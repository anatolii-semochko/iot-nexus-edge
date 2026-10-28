import { notesForPrompt } from "../dayNotes.js";
import { config } from "../config.js";
import { pool } from "../db.js";
import { logger } from "../logger.js";
import { clientFor } from "./connections.js";
import { getInstance, type Instance } from "./instances.js";
import { manifestForKind } from "./manifests.js";
import { can, principalOf } from "../access/principal.js";
import { guestSettings } from "../access/guestSettings.js";
import { guestInstruction, reportInstruction, systemPromptFor } from "./prompts.js";
import { runTool, toolAllowed, ToolError, toolContracts } from "./tools.js";
import type { Subject } from "./subjects.js";
import type { ChatMessage, ChatToolSpec, ToolCall } from "./vision.js";

// The agent (Nexus Edge AI Assistant, stage 4 - nexus-edge-aquarium
// AGENTS_TO_DO.md 2026-10-17): a conversation about one instance and work
// type, through the instance's connection.
// - The system prompt: the packs (prompts.ts) + who / what / when + the
//   developer-report instruction when Report is on; kept with the
//   conversation when it is logged.
// - One answer = up to AI_AGENT_MAX_STEPS model calls: each may call tools
//   (the gateway, tools.ts - those the instance's access allows), whose
//   results go back until the model answers without tools.
// - The history sent back is cut to AI_HISTORY_MAX_CHARS from the end, at a
//   user's turn (the oldest turns drop out first).
// - The connection's tokens of today are checked against its daily limit
//   before each call; each call's tokens / latency are stored.
// - An instance that doesn't log keeps the conversation's text but not the
//   tool results ("[not logged]") nor the system prompt.
// - `<developer-report title="...">...</developer-report>` blocks of an
//   answer (Report on) are stored in ai_reports.

export class AgentError extends Error {
  constructor(
    message: string,
    public statusCode = 400,
  ) {
    super(message);
  }
}

const NOT_LOGGED = "[not logged]";
const toolName = (name: string) => name.replace(/\./g, "_");

export interface StoredMessage {
  id: number;
  role: "user" | "assistant" | "tool" | "topic";
  content: string;
  toolCalls: ToolCall[] | null;
  toolCallId: string | null;
  toolName: string | null;
  isError: boolean;
  model: string | null;
  tokensIn: number | null;
  tokensOut: number | null;
  latencyMs: number | null;
  createdAt: string;
}

interface MessageRow {
  id: number;
  role: "user" | "assistant" | "tool" | "topic";
  content: string;
  tool_calls: ToolCall[] | null;
  tool_call_id: string | null;
  tool_name: string | null;
  is_error: boolean;
  model: string | null;
  tokens_in: number | null;
  tokens_out: number | null;
  latency_ms: number | null;
  created_at: Date;
}

const toMessage = (r: MessageRow): StoredMessage => ({
  id: r.id,
  role: r.role,
  content: r.content,
  toolCalls: r.tool_calls,
  toolCallId: r.tool_call_id,
  toolName: r.tool_name,
  isError: r.is_error,
  model: r.model,
  tokensIn: r.tokens_in,
  tokensOut: r.tokens_out,
  latencyMs: r.latency_ms,
  createdAt: r.created_at.toISOString(),
});

async function systemPromptOf(instance: Instance, workType: string, subject: Subject | null = null): Promise<string> {
  const manifest = instance.processId === null ? null : await manifestForKind(instance.kind);
  const packs = await systemPromptFor(workType, manifest);
  if (!packs) throw new AgentError(`no prompt for the work type "${workType}"`);
  let entity = "Entity: the whole Nexus Edge system.";
  if (instance.processId !== null) {
    // its group - the processes on its node and the node's children (an aquarium's modules)
    const group = (
      await pool.query<{ id: number; name: string; kind: string }>(
        `SELECT p.id, p.name, p.kind FROM processes p
         WHERE p.id <> $1 AND p.node_id IN (
           SELECT n.id FROM nodes n, processes me WHERE me.id = $1 AND (n.id = me.node_id OR n.parent_id = me.node_id))
         ORDER BY p.id`,
        [instance.processId],
      )
    ).rows;
    entity =
      `Entity: the DNP instance "${instance.name}" (process ${instance.processId}, kind ${instance.kind})` +
      (group.length ? ` with its group: ${group.map((g) => `${g.name} (process ${g.id}, ${g.kind})`).join("; ")}` : "") +
      ". Tools cover the whole group by default (also with this instance's own processId); pass a module's processId to narrow to it.";
  }
  const now = new Date();
  const when = `Now: ${now.toISOString()} (the server's time zone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}).`;
  const report = instance.access.report ? await reportInstruction() : null;
  // the AI button on a thing (2026-10-24) - what the person asks about
  const about = subject ? `Subject: the person opened the assistant on ${subject.detail}. Start from it - look it up with the tools by its ids - unless they ask about something else.` : null;
  return [packs, entity, about, when, report].filter(Boolean).join("\n\n");
}

/** Starts a conversation (no message yet); `scheduleId` - a calendar's run (ai/calendar.ts). */
export async function startConversation(
  instanceKey: string,
  workType: string,
  title: string | null,
  userId: number,
  scheduleId: number | null = null,
  guestSession: string | null = null,
  subject: Subject | null = null,
) {
  const instance = await getInstance(instanceKey);
  if (!instance) throw new AgentError("no such instance", 404);
  if (instance.connectionId === null) throw new AgentError(`the assistant is off for ${instance.name} (no connection - Service -> Config -> AI)`);
  if (!instance.workTypes.some((w) => w.key === workType)) throw new AgentError(`workType must be one of ${instance.workTypes.map((w) => w.key).join(", ")}`);
  const client = await clientFor(instance.connectionId);
  if (!client) throw new AgentError("the instance's connection is disabled or gone");
  const system = await systemPromptOf(instance, workType, subject);
  const workTitle = instance.workTypes.find((w) => w.key === workType)!.title;
  const row = (
    await pool.query<{ id: number }>(
      `INSERT INTO ai_conversations (instance_key, process_id, work_type, title, connection_id, connection_name, model, logged, system_prompt, created_by, schedule_id, scheduled, guest_session, subject)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING id`,
      [
        instance.key,
        instance.processId,
        workType,
        title?.trim() || `${workTitle} - ${subject?.label ?? instance.name}`,
        instance.connectionId,
        client.connection.name,
        client.connection.model,
        instance.logs,
        instance.logs ? system : null,
        userId,
        scheduleId,
        scheduleId !== null,
        guestSession,
        subject ? JSON.stringify(subject) : null,
      ],
    )
  ).rows[0];
  return getConversation(row.id);
}

/**
 * Another topic for a conversation on the way (2026-10-24): its object (an instance the assistant is
 * on for) and its work type - the system prompt, the connection and the tools follow from the next
 * question; the history stays, a "topic" row marks the change.
 */
export async function changeTopic(conversationId: number, instanceKey: string, workType: string) {
  const conversation = await getConversation(conversationId);
  if (!conversation) throw new AgentError("no such conversation", 404);
  const instance = await getInstance(instanceKey);
  if (!instance) throw new AgentError("no such instance", 404);
  if (instance.connectionId === null) throw new AgentError(`the assistant is off for ${instance.name} (no connection - Service -> Config -> AI)`);
  const work = instance.workTypes.find((w) => w.key === workType);
  if (!work) throw new AgentError(`workType must be one of ${instance.workTypes.map((w) => w.key).join(", ")}`);
  if (conversation.instanceKey === instance.key && conversation.workType === workType) return conversation;
  const client = await clientFor(instance.connectionId);
  if (!client) throw new AgentError("the instance's connection is disabled or gone");
  const system = await systemPromptOf(instance, workType, conversation.subject);
  await pool.query(
    `UPDATE ai_conversations SET instance_key = $2, process_id = $3, work_type = $4, connection_id = $5, connection_name = $6, model = $7,
       system_prompt = CASE WHEN logged THEN $8 ELSE NULL END, updated_at = now() WHERE id = $1`,
    [conversation.id, instance.key, instance.processId, workType, instance.connectionId, client.connection.name, client.connection.model, system],
  );
  await pool.query("INSERT INTO ai_messages (conversation_id, role, content) VALUES ($1, 'topic', $2)", [conversation.id, `${work.title} - ${instance.name}`]);
  return getConversation(conversation.id);
}

export async function getConversation(id: number) {
  // a bad id in an address - none (not a database error)
  if (!Number.isSafeInteger(id)) return null;
  const c = (await pool.query("SELECT * FROM ai_conversations WHERE id = $1", [id])).rows[0];
  if (!c) return null;
  const messages = (await pool.query<MessageRow>("SELECT * FROM ai_messages WHERE conversation_id = $1 ORDER BY id", [id])).rows.map(toMessage);
  return {
    id: c.id as number,
    instanceKey: c.instance_key as string,
    processId: c.process_id as number | null,
    workType: c.work_type as string,
    title: c.title as string,
    connectionName: c.connection_name as string | null,
    model: c.model as string | null,
    logged: c.logged as boolean,
    systemPrompt: c.system_prompt as string | null,
    tokensIn: c.tokens_in as number,
    tokensOut: c.tokens_out as number,
    createdBy: c.created_by as number | null,
    scheduled: c.scheduled as boolean,
    scheduleId: c.schedule_id as number | null,
    // a guest's conversation (their session's id - routes/auth.ts)
    guestSession: c.guest_session as string | null,
    // what it is about - the AI button on a thing (migration 087)
    subject: (c.subject as Subject | null) ?? null,
    // shared - read only for everyone who may talk to its instance (2026-10-27; the former demo showcase)
    shared: c.shared as boolean,
    createdAt: (c.created_at as Date).toISOString(),
    updatedAt: (c.updated_at as Date).toISOString(),
    connectionId: c.connection_id as number | null,
    messages,
  };
}

// the history as the model sees it, cut from the end at a user's turn
function historyOf(stored: StoredMessage[]): ChatMessage[] {
  // a topic changed on the way - a note before the next question (the system prompt is already the new topic's)
  const messages: StoredMessage[] = [];
  let note: string | null = null;
  for (const m of stored) {
    if (m.role === "topic") note = m.content;
    else if (m.role === "user" && note !== null) {
      messages.push({ ...m, content: `(The conversation's topic is now: ${note}.)\n\n${m.content}` });
      note = null;
    } else messages.push(m);
  }
  const out: ChatMessage[] = [];
  let chars = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    chars += m.content.length + JSON.stringify(m.toolCalls ?? []).length;
    out.unshift(
      m.role === "user"
        ? { role: "user", content: m.content }
        : m.role === "assistant"
          ? { role: "assistant", content: m.content, ...(m.toolCalls?.length ? { toolCalls: m.toolCalls } : {}) }
          : { role: "tool", toolCallId: m.toolCallId ?? "", name: m.toolName ?? "", content: m.content, isError: m.isError },
    );
    if (chars > config.ai.historyMaxChars && m.role === "user") break;
  }
  // never start inside a turn (a tool result without its call)
  while (out.length && out[0].role !== "user") out.shift();
  return out;
}

async function tokensToday(connectionId: number): Promise<number> {
  const r = await pool.query<{ n: string }>(
    `SELECT COALESCE(sum(COALESCE(m.tokens_in, 0) + COALESCE(m.tokens_out, 0)), 0) AS n
     FROM ai_messages m JOIN ai_conversations c ON c.id = m.conversation_id
     WHERE c.connection_id = $1 AND m.created_at >= date_trunc('day', now())`,
    [connectionId],
  );
  return Number(r.rows[0].n);
}

// the tokens an account used today (its conversations; the guest's - all guests')
export async function accountTokensToday(userId: number): Promise<number> {
  const r = await pool.query<{ n: string }>(
    `SELECT COALESCE(sum(COALESCE(m.tokens_in, 0) + COALESCE(m.tokens_out, 0)), 0) AS n
     FROM ai_messages m JOIN ai_conversations c ON c.id = m.conversation_id
     WHERE c.created_by = $1 AND m.created_at >= date_trunc('day', now())`,
    [userId],
  );
  return Number(r.rows[0].n);
}

// a guest's question off the installation (prompts/guest.md) - the answer's last line
const OFF_TOPIC = /\s*<off-topic\s*\/?>\s*$/i;

const REPORT = /<developer-report\s+title="([^"]{1,200})">([\s\S]*?)<\/developer-report>/g;

/** What a running answer reports as it goes (the messenger's stream). */
export type AgentEvent = { type: "message"; message: StoredMessage } | { type: "status"; text: string };

/**
 * The user's message and the assistant's answer (with the tools it called)
 * - the new messages; `onEvent` hears each stored message and what the agent
 * is doing now (a model call, a tool) as it happens.
 */
export async function sendMessage(conversationId: number, text: string, onEvent: (e: AgentEvent) => void = () => {}): Promise<StoredMessage[]> {
  const conversation = await getConversation(conversationId);
  if (!conversation) throw new AgentError("no such conversation", 404);
  const instance = await getInstance(conversation.instanceKey);
  if (!instance) throw new AgentError("the conversation's instance is gone", 410);
  if (conversation.connectionId === null) throw new AgentError("the conversation's connection is gone");
  const client = await clientFor(conversation.connectionId);
  if (!client) throw new AgentError("the conversation's connection is disabled");
  const limit = (await pool.query<{ daily_token_limit: number | null }>("SELECT daily_token_limit FROM ai_connections WHERE id = $1", [conversation.connectionId])).rows[0]
    ?.daily_token_limit;

  // the operational days' notes of the whole site, fresh on every turn (the user, 2026-10-25: the AI sees the
  // situation everywhere, not only in its panel - they take little room)
  const notes = await notesForPrompt();
  // a guest's conversation - what to answer, the off-topic mark (prompts/guest.md)
  const guest = conversation.guestSession !== null ? await guestInstruction() : null;
  // (first - it decides whether to answer at all)
  const system = [guest, conversation.systemPrompt ?? (await systemPromptOf(instance, conversation.workType, conversation.subject)), notes].filter(Boolean).join("\n\n");
  // the tools this instance may use now (read - its Read level; a proposing one - its level is not Off);
  // a person who can't decide proposals (the guest, a viewer) - reading only. The account's daily tokens
  // (null - unlimited; access/principal.ts)
  const owner = conversation.createdBy !== null ? await principalOf(conversation.createdBy) : null;
  const readOnly = owner !== null && !can(owner, "ai.decide");
  const accountLimit = owner?.aiDailyTokens ?? null;
  const contracts = toolContracts().filter((t) => toolAllowed(t.access, instance) && (!readOnly || t.access === "read"));
  const specs: ChatToolSpec[] = contracts.map((t) => ({ name: toolName(t.name), description: t.description, input: t.input }));
  const byName = new Map(contracts.map((t) => [toolName(t.name), t.name]));

  const stored: StoredMessage[] = [];
  const insert = async (m: Omit<StoredMessage, "id" | "createdAt">) => {
    const r = (
      await pool.query<MessageRow>(
        `INSERT INTO ai_messages (conversation_id, role, content, tool_calls, tool_call_id, tool_name, is_error, model, tokens_in, tokens_out, latency_ms)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
        [conversationId, m.role, m.content, m.toolCalls ? JSON.stringify(m.toolCalls) : null, m.toolCallId, m.toolName, m.isError, m.model, m.tokensIn, m.tokensOut, m.latencyMs],
      )
    ).rows[0];
    const message = toMessage(r);
    stored.push(message);
    onEvent({ type: "message", message });
  };
  const blank = { toolCalls: null, toolCallId: null, toolName: null, isError: false, model: null, tokensIn: null, tokensOut: null, latencyMs: null };

  const messages = historyOf(conversation.messages);
  messages.push({ role: "user", content: text });
  await insert({ ...blank, role: "user", content: text });

  let tokensIn = 0;
  let tokensOut = 0;
  let offTopic = false;
  try {
    for (let step = 0; step < config.ai.agentMaxSteps; step++) {
      if (limit && (await tokensToday(conversation.connectionId)) >= limit)
        throw new AgentError(`the connection's daily token limit (${limit}) is reached`, 429);
      if (accountLimit !== null && (await accountTokensToday(conversation.createdBy!)) >= accountLimit)
        throw new AgentError(
          conversation.guestSession !== null ? "the guests' AI budget for today is used up - come back tomorrow" : `your daily AI tokens (${accountLimit}) are used up`,
          429,
        );
      const last = step === config.ai.agentMaxSteps - 1;
      onEvent({ type: "status", text: step === 0 ? "thinking" : "reading the results" });
      // the last step - no tools: the model has to answer with what it has
      // a model's failure (timeout, auth, rate limit) is the user's to see - said plainly
      const result = await client.chat({ system, messages, tools: last ? [] : specs }).catch((err: unknown) => {
        throw new AgentError(`${client.connection.name}: ${err instanceof Error ? err.message : String(err)}`, 502);
      });
      tokensIn += result.usage?.inputTokens ?? 0;
      tokensOut += result.usage?.outputTokens ?? 0;
      if (conversation.guestSession !== null && OFF_TOPIC.test(result.content)) {
        result.content = result.content.replace(OFF_TOPIC, "");
        offTopic = true;
      }
      messages.push({ role: "assistant", content: result.content, ...(result.toolCalls.length ? { toolCalls: result.toolCalls } : {}) });
      await insert({
        ...blank,
        role: "assistant",
        content: result.content,
        toolCalls: result.toolCalls.length ? result.toolCalls : null,
        model: result.model,
        tokensIn: result.usage?.inputTokens ?? null,
        tokensOut: result.usage?.outputTokens ?? null,
        latencyMs: result.latencyMs,
      });
      if (result.toolCalls.length === 0) {
        if (instance.access.report) await storeReports(conversationId, instance.key, result.content);
        break;
      }
      for (const call of result.toolCalls) {
        const name = byName.get(call.name);
        onEvent({ type: "status", text: `calling ${call.name}` });
        let content: string;
        let isError = false;
        try {
          if (!name) throw new ToolError(`no tool "${call.name}"`);
          content = (await runTool(name, call.input, { instance, conversationId })).text;
        } catch (err) {
          isError = true;
          content = err instanceof ToolError ? err.message : "the tool failed";
          if (!(err instanceof ToolError)) logger.error({ err, tool: name }, "agent tool failed");
        }
        messages.push({ role: "tool", toolCallId: call.id, name: call.name, content, isError });
        await insert({ ...blank, role: "tool", content: conversation.logged ? content : NOT_LOGGED, toolCallId: call.id, toolName: call.name, isError });
      }
    }
  } finally {
    await pool.query("UPDATE ai_conversations SET tokens_in = tokens_in + $2, tokens_out = tokens_out + $3, updated_at = now() WHERE id = $1", [
      conversationId,
      tokensIn,
      tokensOut,
    ]);
  }
  // a guest's off-topic question is not kept (the guest's settings): this turn's messages go - the
  // conversation too when nothing else is left (the tokens stay counted - the budget)
  if (offTopic && (await guestSettings()).relevantOnly && stored.length) {
    await pool.query("DELETE FROM ai_messages WHERE conversation_id = $1 AND id >= $2", [conversationId, stored[0].id]);
    await pool.query("DELETE FROM ai_conversations c WHERE id = $1 AND NOT EXISTS (SELECT 1 FROM ai_messages m WHERE m.conversation_id = c.id)", [conversationId]);
  }
  return stored;
}

async function storeReports(conversationId: number, instanceKey: string, content: string): Promise<void> {
  for (const m of content.matchAll(REPORT)) {
    await pool.query("INSERT INTO ai_reports (conversation_id, instance_key, title, body) VALUES ($1, $2, $3, $4)", [conversationId, instanceKey, m[1].trim(), m[2].trim()]);
  }
}
