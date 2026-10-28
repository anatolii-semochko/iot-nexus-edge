import type { FastifyInstance } from "fastify";

import { connectionProblem, deleteConnection, listConnections, saveConnection, clientFor, type ConnectionInput } from "../ai/connections.js";
import { getInstance, instanceProblem, listInstances, NEXUS_EDGE_KEY, saveInstance, type InstanceInput } from "../ai/instances.js";
import { manifestForKind } from "../ai/manifests.js";
import { createMcpToken, deleteMcpToken, handleMcpRequest, listMcpTokens, updateMcpToken } from "../ai/mcp.js";
import { systemPromptFor } from "../ai/prompts.js";
import { decide, getProposal, listProposals, proposalOwner, type ProposalStatus } from "../ai/proposals.js";
import { CalendarError, calendarTick, createSchedule, deleteSchedule, listSchedules, runNow, updateSchedule, type ScheduleInput } from "../ai/calendar.js";
import { secretsAvailable } from "../ai/secrets.js";
import { runTool, ToolError, toolContracts } from "../ai/tools.js";
import { resolveSubject, subjectProblem, subjectWorkType, type Subject, type SubjectInput } from "../ai/subjects.js";
import { AgentError, changeTopic, getConversation, sendMessage, startConversation, type AgentEvent } from "../ai/agent.js";
import { guestSettings } from "../access/guestSettings.js";
import { requireAdmin, requireAuth, type JwtPayload } from "../auth.js";
import { can, visibleUnits, type Principal } from "../access/principal.js";
import { instanceUnits } from "../dnpInstances.js";
import { config } from "../config.js";
import { pool } from "../db.js";
import { ProcessWriteError } from "../processWrites.js";

// AI connections (ai/connections.ts; Service -> Config -> AI), admin only:
// list (no keys - `hasKey`), create, edit (`apiKey` absent - kept, null /
// "" - removed), delete, test (a one-line completion: the model answers,
// how long it took, the tokens). `secretsAvailable` - whether a key can be
// stored at all (AI_SECRETS_KEY in .env).
// Stage 2: the instances (ai/instances.ts - the whole system and the DNP
// instances: connection, access levels, logs), an instance's assembled
// system prompt for a work type (to check the packs), the resource
// gateway's tools (ai/tools.ts) - their contracts and a run for an
// instance (an admin's check now; the agent calls them itself from stage 4).
// Stage 3: the MCP server (ai/mcp.ts) at /mcp - a bearer token, no session -
// and its tokens (admin: list, create - the token shown once, enable /
// rename, delete).
// Stage 4: the conversations (ai/agent.ts) - any signed-in user, each their
// own (an admin - all): start, read, send a message (the answer comes back
// with the tools the agent called), delete; Logs -> AI (every conversation
// with its totals) and Logs -> AI Reports - admin.
// Stage 5 (the messenger): GET /ai/entities - what a signed-in user can talk
// to (the instances with a connection; their work types); POST
// /ai/conversations/:id/messages/stream - the same answer as a stream of
// server-sent events (status / message / done / error).
// Stage 6 (proposals - ai/proposals.ts): GET /ai/conversations/:id carries
// its proposals; GET /ai/proposals - a page of them (Logs -> AI Proposals;
// a non-admin - those of their own conversations); accept / reject - the
// conversation's owner or an admin (an MCP client's - an admin), applied as
// the one who accepts.
// Stage 7 (the calendar - ai/calendar.ts): /ai/schedules CRUD + run now
// (admin); POST /ai/calendar/tick - orchestrator-driven (the "ai-assistant"
// process's tick). A scheduled run's conversation (started by "system") -
// in every signed-in user's list, readable by all, continued / deleted /
// its proposals decided by an admin.

export async function aiRoutes(app: FastifyInstance): Promise<void> {
  app.get("/ai/connections", { preHandler: requireAdmin }, async () => ({
    connections: await listConnections(),
    secretsAvailable: secretsAvailable(),
  }));

  app.post<{ Body: ConnectionInput }>("/ai/connections", { preHandler: requireAdmin }, async (request, reply) => {
    const body = request.body ?? {};
    const problem = connectionProblem(body, true);
    if (problem) return reply.code(400).send({ error: problem });
    try {
      return await saveConnection(null, body, request.user.sub);
    } catch (err) {
      if ((err as { code?: string }).code === "23505") return reply.code(409).send({ error: "a connection with this name exists" });
      throw err;
    }
  });

  app.patch<{ Params: { id: string }; Body: ConnectionInput }>("/ai/connections/:id", { preHandler: requireAdmin }, async (request, reply) => {
    const body = request.body ?? {};
    const problem = connectionProblem(body, false);
    if (problem) return reply.code(400).send({ error: problem });
    try {
      return await saveConnection(Number(request.params.id), body, request.user.sub);
    } catch (err) {
      const e = err as { statusCode?: number; code?: string; message: string };
      if (e.statusCode === 404) return reply.code(404).send({ error: e.message });
      if (e.code === "23505") return reply.code(409).send({ error: "a connection with this name exists" });
      throw err;
    }
  });

  app.delete<{ Params: { id: string } }>("/ai/connections/:id", { preHandler: requireAdmin }, async (request, reply) =>
    (await deleteConnection(Number(request.params.id))) ? { status: "ok" } : reply.code(404).send({ error: "connection not found" }),
  );

  app.post<{ Params: { id: string } }>("/ai/connections/:id/test", { preHandler: requireAdmin }, async (request, reply) => {
    const client = await clientFor(Number(request.params.id));
    if (!client) return reply.code(404).send({ error: "no such enabled connection" });
    try {
      const result = await client.complete({ prompt: "Reply with the single word OK.", maxTokens: 16 });
      return { ok: true, text: result.text.trim(), model: result.model, latencyMs: result.latencyMs, usage: result.usage };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  app.get("/ai/instances", { preHandler: requireAdmin }, async () => ({ instances: await listInstances() }));

  app.put<{ Params: { key: string }; Body: InstanceInput }>("/ai/instances/:key", { preHandler: requireAdmin }, async (request, reply) => {
    const instance = await getInstance(request.params.key);
    if (!instance) return reply.code(404).send({ error: "no such instance" });
    const body = request.body ?? {};
    const problem = instanceProblem(body);
    if (problem) return reply.code(400).send({ error: problem });
    try {
      return await saveInstance(instance, body, request.user.sub);
    } catch (err) {
      if ((err as { code?: string }).code === "23503") return reply.code(400).send({ error: "no such connection" });
      throw err;
    }
  });

  app.get<{ Params: { key: string }; Querystring: { workType?: string } }>("/ai/instances/:key/prompt", { preHandler: requireAdmin }, async (request, reply) => {
    const instance = await getInstance(request.params.key);
    if (!instance) return reply.code(404).send({ error: "no such instance" });
    const workType = request.query.workType ?? "";
    if (!instance.workTypes.some((w) => w.key === workType))
      return reply.code(400).send({ error: `workType must be one of ${instance.workTypes.map((w) => w.key).join(", ")}` });
    const prompt = await systemPromptFor(workType, instance.processId === null ? null : await manifestForKind(instance.kind));
    return prompt === null ? reply.code(404).send({ error: "no prompt for this work type" }) : { workType, prompt, chars: prompt.length };
  });

  app.get("/ai/tools", { preHandler: requireAdmin }, async () => ({ tools: toolContracts() }));

  app.post<{ Params: { name: string }; Body: { instanceKey?: string; input?: unknown } }>("/ai/tools/:name", { preHandler: requireAdmin }, async (request, reply) => {
    const instance = await getInstance(request.body?.instanceKey ?? "nexus-edge");
    if (!instance) return reply.code(404).send({ error: "no such instance" });
    try {
      const { text, truncated } = await runTool(request.params.name, request.body?.input ?? {}, { instance });
      return { truncated, chars: text.length, result: JSON.parse(truncated ? "null" : text), ...(truncated ? { text } : {}) };
    } catch (err) {
      if (err instanceof ToolError) return reply.code(400).send({ error: err.message });
      throw err;
    }
  });

  app.get("/ai/mcp-tokens", { preHandler: requireAdmin }, async () => ({ tokens: await listMcpTokens() }));

  app.post<{ Body: { name?: string; instanceKey?: string } }>("/ai/mcp-tokens", { preHandler: requireAdmin }, async (request, reply) => {
    const name = request.body?.name?.trim();
    if (!name) return reply.code(400).send({ error: "name is required" });
    const instanceKey = request.body?.instanceKey ?? "nexus-edge";
    if (!(await getInstance(instanceKey))) return reply.code(400).send({ error: "no such instance" });
    return createMcpToken(name, instanceKey, request.user.sub);
  });

  app.patch<{ Params: { id: string }; Body: { enabled?: boolean; name?: string } }>("/ai/mcp-tokens/:id", { preHandler: requireAdmin }, async (request, reply) => {
    const token = await updateMcpToken(Number(request.params.id), request.body ?? {});
    return token ?? reply.code(404).send({ error: "token not found" });
  });

  app.delete<{ Params: { id: string } }>("/ai/mcp-tokens/:id", { preHandler: requireAdmin }, async (request, reply) =>
    (await deleteMcpToken(Number(request.params.id))) ? { status: "ok" } : reply.code(404).send({ error: "token not found" }),
  );

  // the MCP endpoint itself - the transport writes the answer
  app.route({
    method: ["POST", "GET", "DELETE"],
    url: "/mcp",
    handler: async (request, reply) => {
      reply.hijack();
      try {
        await handleMcpRequest(request.raw, reply.raw, request.body);
      } catch (err) {
        request.log.error({ err }, "MCP request failed");
        if (!reply.raw.headersSent) {
          reply.raw.writeHead(500, { "content-type": "application/json" });
          reply.raw.end(JSON.stringify({ error: "MCP request failed" }));
        }
      }
    },
  });

  const user = (request: { user: unknown }) => request.user as JwtPayload;
  // the assistant's administrator (Service -> Config -> AI) sees every conversation and decides any proposal
  const isAdmin = (request: { principal?: Principal }) => !!request.principal && can(request.principal, "ai.configure");
  // the instances a person may talk to: the whole system - with ai.use everywhere; a DNP instance - within their units
  const usableInstance = async (request: { principal?: Principal }) => {
    const p = request.principal;
    if (!p) return () => false;
    const units = visibleUnits(p, "ai.use");
    if (units === null) return () => true;
    const map = await instanceUnits();
    return (i: { processId: number | null }) => i.processId !== null && units.has(map.processUnit.get(i.processId) ?? "");
  };
  type Asker = { user: unknown; principal?: Principal; guestSession?: string };
  // the caller's own: theirs, and in their session for a guest (each browser - its own)
  const isOwn = (request: Asker, c: { createdBy: number | null; guestSession: string | null }) =>
    c.createdBy === user(request).sub && (c.guestSession ?? null) === (request.guestSession ?? null);
  // another guest's conversation a guest reads (the guest's settings - public)
  const guestReads = async (request: Asker, c: { guestSession: string | null }) =>
    request.guestSession !== undefined && c.guestSession !== null && (await guestSettings()).conversations === "public";
  // a conversation the caller may see: theirs, any for an admin, a shared or a scheduled run's one of an
  // instance they may talk to, another guest's when the guests' are public
  const ownConversation = async (request: Asker, id: number) => {
    const c = await getConversation(id);
    if (!c) return null;
    if (isOwn(request, c) || isAdmin(request)) return c;
    if (await guestReads(request, c)) return c;
    return (c.scheduled || c.shared) && (await usableInstance(request))({ processId: c.processId }) && (c.processId !== null || c.instanceKey === NEXUS_EDGE_KEY) ? c : null;
  };
  // a conversation the caller may continue / delete (theirs; a scheduled run's - an admin)
  const mayContinue = (request: Asker, c: { createdBy: number | null; scheduled: boolean; guestSession: string | null }) =>
    isOwn(request, c) || (c.scheduled && isAdmin(request));
  const agentError = (reply: { code(n: number): { send(b: unknown): unknown } }, err: unknown) => {
    if (err instanceof AgentError) return reply.code(err.statusCode).send({ error: err.message });
    throw err;
  };

  // the subject a person may ask about: it exists and its process (if any) is theirs to see
  const subjectFor = async (request: Parameters<typeof usableInstance>[0], input: SubjectInput): Promise<Subject | null> => {
    const subject = await resolveSubject(input);
    if (!subject) return null;
    if (subject.processId !== null && !(await usableInstance(request))({ processId: subject.processId })) return null;
    return subject;
  };

  // the AI button on a thing (2026-10-24): which object and work type the assistant opens with -
  // the DNP instance of the thing's process when the assistant is on for it, else the whole system
  app.get<{ Querystring: { type?: string; id?: string; processId?: string; page?: string; view?: string } }>("/ai/subject", { preHandler: requireAuth }, async (request, reply) => {
    const input = {
      type: request.query.type,
      id: request.query.id === undefined ? undefined : Number(request.query.id),
      processId: request.query.processId ? Number(request.query.processId) : null,
      page: request.query.page,
      view: request.query.view ?? null,
    } as SubjectInput;
    const problem = subjectProblem(input);
    if (problem) return reply.code(400).send({ error: problem });
    const subject = await subjectFor(request, input);
    if (!subject) return reply.code(404).send({ error: "no such subject" });
    const connections = new Set((await listConnections()).filter((c) => c.enabled).map((c) => c.id));
    const usable = await usableInstance(request);
    const on = (await listInstances()).filter((i) => i.connectionId !== null && connections.has(i.connectionId) && usable(i));
    const instance = on.find((i) => subject.processId !== null && i.processId === subject.processId) ?? on.find((i) => i.key === NEXUS_EDGE_KEY);
    if (!instance) return reply.code(409).send({ error: "the assistant is off for this - Service -> Config -> AI" });
    const wanted = subjectWorkType(subject);
    const workType = instance.workTypes.find((w) => w.key === wanted)?.key ?? instance.workTypes[0]?.key;
    return {
      subject: { type: subject.type, id: subject.id, processId: subject.processId, label: subject.label, page: subject.page, view: subject.view ?? null },
      instanceKey: instance.key,
      workType,
    };
  });

  app.post<{ Body: { instanceKey?: string; workType?: string; title?: string; subject?: SubjectInput } }>("/ai/conversations", { preHandler: requireAuth }, async (request, reply) => {
    const { instanceKey, workType, title } = request.body ?? {};
    if (!instanceKey || !workType) return reply.code(400).send({ error: "instanceKey and workType are required" });
    const instance = await getInstance(instanceKey);
    if (!instance || !(await usableInstance(request))(instance)) return reply.code(404).send({ error: "no such instance" });
    let subject: Subject | null = null;
    if (request.body?.subject != null) {
      const problem = subjectProblem(request.body.subject);
      if (problem) return reply.code(400).send({ error: problem });
      subject = await subjectFor(request, request.body.subject);
      if (!subject) return reply.code(404).send({ error: "no such subject" });
    }
    try {
      return await startConversation(instanceKey, workType, title ?? null, user(request).sub, null, request.guestSession ?? null, subject);
    } catch (err) {
      return agentError(reply, err);
    }
  });

  app.get<{ Querystring: { instanceKey?: string; limit?: string } }>("/ai/conversations", { preHandler: requireAuth }, async (request) => {
    const limit = Math.min(200, Math.max(1, Number(request.query.limit) || 50));
    const publicGuests = request.guestSession !== undefined && (await guestSettings()).conversations === "public";
    const rows = (
      await pool.query(
        `SELECT id, instance_key, process_id, work_type, title, model, tokens_in, tokens_out, scheduled, shared, created_by, guest_session, created_at, updated_at
           FROM ai_conversations
          WHERE ((created_by = $1 AND guest_session IS NOT DISTINCT FROM $4::text) OR scheduled OR shared OR ($5 AND guest_session IS NOT NULL))
            AND ($2::text IS NULL OR instance_key = $2) ORDER BY updated_at DESC LIMIT $3`,
        [user(request).sub, request.query.instanceKey ?? null, limit, request.guestSession ?? null, publicGuests],
      )
    ).rows;
    // others' scheduled runs and shared ones - only of the instances this person may talk to; other guests' -
    // when the guests' are public. `mine` - the caller's own (the rest read only)
    const usable = await usableInstance(request);
    return {
      conversations: rows
        .map(({ guest_session: guestSession, ...r }) => ({ ...r, mine: isOwn(request, { createdBy: r.created_by, guestSession }), guest: guestSession !== null }))
        .filter((r) => r.mine || (publicGuests && r.guest) || usable({ processId: r.process_id })),
    };
  });

  // another topic on the way (2026-10-24): the object and the work type of a conversation of yours
  app.patch<{ Params: { id: string }; Body: { instanceKey?: string; workType?: string } }>("/ai/conversations/:id/topic", { preHandler: requireAuth }, async (request, reply) => {
    const { instanceKey, workType } = request.body ?? {};
    if (!instanceKey || !workType) return reply.code(400).send({ error: "instanceKey and workType are required" });
    const c = await ownConversation(request, Number(request.params.id));
    if (!c || !mayContinue(request, c)) return reply.code(404).send({ error: "no such conversation of yours" });
    const instance = await getInstance(instanceKey);
    if (!instance || !(await usableInstance(request))(instance)) return reply.code(404).send({ error: "no such instance" });
    try {
      const changed = await changeTopic(c.id, instanceKey, workType);
      return { ...changed, proposals: (await listProposals({ conversationId: c.id, limit: 500 })).items };
    } catch (err) {
      return agentError(reply, err);
    }
  });

  // share one's conversation (2026-10-27; the former demo showcase): everyone who may talk to its
  // instance's assistant reads it (the guest too, when its role lets it)
  app.patch<{ Params: { id: string }; Body: { shared?: boolean } }>("/ai/conversations/:id/shared", { preHandler: requireAuth }, async (request, reply) => {
    if (typeof request.body?.shared !== "boolean") return reply.code(400).send({ error: "shared (boolean) is required" });
    const c = await getConversation(Number(request.params.id));
    if (!c || c.guestSession !== null || !(isOwn(request, c) || isAdmin(request))) return reply.code(404).send({ error: "no such conversation of yours" });
    await pool.query("UPDATE ai_conversations SET shared = $2 WHERE id = $1", [c.id, request.body.shared]);
    return { id: c.id, shared: request.body.shared };
  });

  app.get<{ Params: { id: string } }>("/ai/conversations/:id", { preHandler: requireAuth }, async (request, reply) => {
    const c = await ownConversation(request, Number(request.params.id));
    if (!c) return reply.code(404).send({ error: "no such conversation" });
    const { guestSession, ...rest } = c;
    return { ...rest, guest: guestSession !== null, mine: isOwn(request, c), proposals: (await listProposals({ conversationId: c.id, limit: 500 })).items };
  });

  app.post<{ Params: { id: string }; Body: { text?: string } }>("/ai/conversations/:id/messages", { preHandler: requireAuth }, async (request, reply) => {
    const text = request.body?.text?.trim();
    if (!text) return reply.code(400).send({ error: "text is required" });
    const c = await ownConversation(request, Number(request.params.id));
    if (!c || !mayContinue(request, c)) return reply.code(404).send({ error: "no such conversation of yours" });
    try {
      return { messages: await sendMessage(c.id, text) };
    } catch (err) {
      return agentError(reply, err);
    }
  });

  app.delete<{ Params: { id: string } }>("/ai/conversations/:id", { preHandler: requireAuth }, async (request, reply) => {
    const c = await ownConversation(request, Number(request.params.id));
    if (!c || !mayContinue(request, c)) return reply.code(404).send({ error: "no such conversation" });
    await pool.query("DELETE FROM ai_conversations WHERE id = $1", [c.id]);
    return { status: "ok" };
  });

  // Logs -> AI: every conversation, newest first, with its totals
  app.get<{ Querystring: { page?: string; pageSize?: string; instanceKey?: string } }>("/ai/logs", { preHandler: requireAdmin }, async (request) => {
    const pageSize = Math.min(100, Math.max(5, Number(request.query.pageSize) || 25));
    const page = Math.max(1, Number(request.query.page) || 1);
    const filter = request.query.instanceKey ?? null;
    const [rows, total] = await Promise.all([
      pool.query(
        `SELECT c.id, c.instance_key, c.work_type, c.title, c.connection_name, c.model, c.logged, c.tokens_in, c.tokens_out,
                c.scheduled, c.created_at, c.updated_at, u.username AS created_by,
                (SELECT count(*) FROM ai_messages m WHERE m.conversation_id = c.id AND m.role = 'user') AS questions,
                (SELECT count(*) FROM ai_messages m WHERE m.conversation_id = c.id AND m.role = 'tool') AS tool_calls
         FROM ai_conversations c LEFT JOIN users u ON u.id = c.created_by
         WHERE $1::text IS NULL OR c.instance_key = $1
         ORDER BY c.updated_at DESC LIMIT $2 OFFSET $3`,
        [filter, pageSize, (page - 1) * pageSize],
      ),
      pool.query<{ n: string }>("SELECT count(*) AS n FROM ai_conversations WHERE $1::text IS NULL OR instance_key = $1", [filter]),
    ]);
    return { items: rows.rows.map((r) => ({ ...r, questions: Number(r.questions), tool_calls: Number(r.tool_calls) })), total: Number(total.rows[0].n) };
  });

  // Logs -> AI Reports: the assistant's reports to the developers
  app.get<{ Querystring: { page?: string; pageSize?: string } }>("/ai/reports", { preHandler: requireAdmin }, async (request) => {
    const pageSize = Math.min(100, Math.max(5, Number(request.query.pageSize) || 25));
    const page = Math.max(1, Number(request.query.page) || 1);
    const [rows, total] = await Promise.all([
      pool.query("SELECT id, conversation_id, instance_key, title, body, created_at FROM ai_reports ORDER BY created_at DESC LIMIT $1 OFFSET $2", [
        pageSize,
        (page - 1) * pageSize,
      ]),
      pool.query<{ n: string }>("SELECT count(*) AS n FROM ai_reports"),
    ]);
    return { items: rows.rows, total: Number(total.rows[0].n) };
  });

  // the agents' proposals, newest first (Logs -> AI Proposals; the messenger - a conversation's)
  app.get<{ Querystring: { page?: string; pageSize?: string; status?: string; conversationId?: string } }>(
    "/ai/proposals",
    { preHandler: requireAuth },
    async (request, reply) => {
      const pageSize = Math.min(100, Math.max(5, Number(request.query.pageSize) || 25));
      const page = Math.max(1, Number(request.query.page) || 1);
      const status = request.query.status as ProposalStatus | undefined;
      if (status && !["pending", "applied", "rejected", "failed"].includes(status)) return reply.code(400).send({ error: "status must be pending, applied, rejected or failed" });
      const conversationId = request.query.conversationId ? Number(request.query.conversationId) : undefined;
      if (conversationId !== undefined && !(await ownConversation(request, conversationId))) return reply.code(404).send({ error: "no such conversation" });
      return listProposals({
        status,
        conversationId,
        // a conversation's - all of it (the caller may see it); else a non-admin's own conversations'
        ownerId: isAdmin(request) || conversationId !== undefined ? undefined : user(request).sub,
        limit: pageSize,
        offset: (page - 1) * pageSize,
      });
    },
  );

  app.post<{ Params: { id: string; decision: string } }>("/ai/proposals/:id/:decision", { preHandler: requireAuth }, async (request, reply) => {
    const { decision } = request.params;
    if (decision !== "accept" && decision !== "reject") return reply.code(404).send({ error: "accept or reject" });
    const id = Number(request.params.id);
    if (!isAdmin(request) && (await proposalOwner(id)) !== user(request).sub) return reply.code(404).send({ error: "no such proposal of yours" });
    // a change of someone's access - only for a person who manages users (B1.4)
    const target = await getProposal(id);
    if (target?.operation === "roles" && !(request.principal && can(request.principal, "users.manage")))
      return reply.code(403).send({ error: "only a person who manages users decides an access change" });
    try {
      return await decide(id, user(request).sub, decision);
    } catch (err) {
      if (err instanceof ProcessWriteError) return reply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
  });

  // the calendar (ai/calendar.ts)
  const calendarError = (reply: { code(n: number): { send(b: unknown): unknown } }, err: unknown) => {
    if (err instanceof CalendarError) return reply.code(err.statusCode).send({ error: err.message });
    throw err;
  };

  app.get<{ Querystring: { instanceKey?: string } }>("/ai/schedules", { preHandler: requireAdmin }, async (request) => ({
    schedules: await listSchedules(request.query.instanceKey),
  }));

  app.post<{ Body: ScheduleInput & { instanceKey?: string } }>("/ai/schedules", { preHandler: requireAdmin }, async (request, reply) => {
    const { instanceKey, ...input } = request.body ?? {};
    if (!instanceKey) return reply.code(400).send({ error: "instanceKey is required" });
    try {
      return await createSchedule(instanceKey, input, user(request).sub);
    } catch (err) {
      return calendarError(reply, err);
    }
  });

  app.patch<{ Params: { id: string }; Body: ScheduleInput }>("/ai/schedules/:id", { preHandler: requireAdmin }, async (request, reply) => {
    try {
      return await updateSchedule(Number(request.params.id), request.body ?? {});
    } catch (err) {
      return calendarError(reply, err);
    }
  });

  app.delete<{ Params: { id: string } }>("/ai/schedules/:id", { preHandler: requireAdmin }, async (request, reply) =>
    (await deleteSchedule(Number(request.params.id))) ? { status: "ok" } : reply.code(404).send({ error: "no such schedule" }),
  );

  app.post<{ Params: { id: string } }>("/ai/schedules/:id/run", { preHandler: requireAdmin }, async (request, reply) => {
    try {
      await runNow(Number(request.params.id));
      return { status: "started" };
    } catch (err) {
      return calendarError(reply, err);
    }
  });

  // Orchestrator-driven: the "ai-assistant" process's tick - starts what is due
  app.post("/ai/calendar/tick", async () => ({ started: await calendarTick() }));

  // what the messenger offers: the instances the assistant is on for
  app.get("/ai/entities", { preHandler: requireAuth }, async (request) => {
    const connections = new Map((await listConnections()).filter((c) => c.enabled).map((c) => [c.id, c]));
    const usable = await usableInstance(request);
    const instances = await listInstances();
    // a DNP instance's picture - its package's Library icon (its process type's, else its node type's)
    const icons = new Map(
      (
        await pool.query<{ type_name: string; icon_path: string }>(
          "SELECT DISTINCT ON (type_name) type_name, icon_path FROM library_items WHERE type_name = ANY($1::text[]) AND icon_path IS NOT NULL ORDER BY type_name, (kind = 'process') DESC",
          [instances.map((i) => i.kind)],
        )
      ).rows.map((r) => [r.type_name, r.icon_path]),
    );
    return {
      quickStart: config.ai.quickStart,
      entities: instances
        .filter((i) => i.connectionId !== null && connections.has(i.connectionId) && usable(i))
        .map((i) => ({
          key: i.key,
          name: i.name,
          kind: i.kind,
          processId: i.processId,
          iconPath: icons.get(i.kind) ?? null,
          workTypes: i.workTypes,
          connectionName: connections.get(i.connectionId!)!.name,
          model: connections.get(i.connectionId!)!.model,
        })),
    };
  });

  // the answer as server-sent events - the messenger shows each step as it comes
  app.post<{ Params: { id: string }; Body: { text?: string } }>("/ai/conversations/:id/messages/stream", { preHandler: requireAuth }, async (request, reply) => {
    const text = request.body?.text?.trim();
    if (!text) return reply.code(400).send({ error: "text is required" });
    const c = await ownConversation(request, Number(request.params.id));
    if (!c || !mayContinue(request, c)) return reply.code(404).send({ error: "no such conversation of yours" });
    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      // nginx must not buffer the stream
      "x-accel-buffering": "no",
    });
    const send = (event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    try {
      await sendMessage(c.id, text, (e: AgentEvent) => send(e.type, e.type === "message" ? e.message : { text: e.text }));
      send("done", {});
    } catch (err) {
      send("error", { error: err instanceof AgentError ? err.message : "the assistant failed - see the api log" });
      if (!(err instanceof AgentError)) request.log.error({ err }, "AI answer failed");
    } finally {
      res.end();
    }
  });
}
