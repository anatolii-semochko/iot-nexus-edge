import { pool } from "../db.js";
import { logger } from "../logger.js";
import { createProcess, giveProcessCommand, type NewProcess, ProcessWriteError, switchProcess, writeProcessConfig } from "../processWrites.js";
import { createDevice, createNode, type NewDevice, type NewNode, RegistryError } from "../registry.js";
import type { Instance, Level } from "./instances.js";

// The AI Assistant's proposals (Nexus Edge AI Assistant, stage 6 - nexus-
// edge-aquarium AGENTS_TO_DO.md 2026-10-17; migration 071): every change an
// agent asks for goes through here, whatever its access level:
// - Auto - applied at once as the `ai-agent` user;
// - Confirm - pending until a person accepts it (applied as that person) or
//   rejects it (the messenger's card, Logs -> AI Proposals);
// - Off - the proposing tool isn't offered at all (tools.ts).
// Install - a DNP instance (a process), a node with its devices, a device
// (registry.ts, stage 8).
// Applying is processWrites.ts - the same writes a person's edit makes
// (schema, stamps, command log, author), source "ai". A config proposal
// keeps the stamps its agent saw: a section someone changed since is
// refused on Accept (failed), never overwritten unseen.

export type ProposalAccess = "config" | "control" | "install";
export type Operation = "config" | "command" | "switch" | "create-process" | "create-node" | "create-device";
export type ProposalStatus = "pending" | "applied" | "rejected" | "failed";

/** What applies, per operation (`payload`). */
export type Payload =
  | { sections: Record<string, unknown> } // config
  | { action: string; params: Record<string, unknown> } // command
  | { action: "ON" | "OFF" } // switch
  | NewProcess // create-process
  | NewNode // create-node (with the devices its node.yaml declares)
  | NewDevice; // create-device

export interface ProposalInput {
  access: ProposalAccess;
  operation: Operation;
  processId: number | null;
  summary: string;
  reason: string;
  payload: Payload;
  // what it replaces (the diff's left side); a config's - also `stamps` seen
  before: Record<string, unknown> | null;
}

/** Where a proposal comes from - the built-in assistant's conversation or an MCP client's token. */
export interface ProposalOrigin {
  instance: Instance;
  conversationId?: number | null;
  mcpTokenId?: number | null;
}

export interface Proposal {
  id: number;
  conversationId: number | null;
  viaMcp: boolean;
  instanceKey: string;
  access: ProposalAccess;
  operation: Operation;
  processId: number | null;
  processName: string | null;
  summary: string;
  reason: string;
  payload: Payload;
  before: Record<string, unknown> | null;
  status: ProposalStatus;
  result: unknown;
  error: string | null;
  createdAt: string;
  decidedBy: { id: number; name: string } | null;
  decidedAt: string | null;
}

const SELECT = `
  SELECT a.*, p.name AS process_name, COALESCE(u.display_name, u.username) AS decided_by_name
  FROM ai_proposals a
  LEFT JOIN processes p ON p.id = a.process_id
  LEFT JOIN users u ON u.id = a.decided_by`;

interface ProposalRow {
  id: number;
  conversation_id: number | null;
  via: "assistant" | "mcp";
  instance_key: string;
  access: ProposalAccess;
  operation: Operation;
  process_id: number | null;
  process_name: string | null;
  summary: string;
  reason: string;
  payload: Payload;
  before: Record<string, unknown> | null;
  status: ProposalStatus;
  result: unknown;
  error: string | null;
  created_at: Date;
  decided_by: number | null;
  decided_by_name: string | null;
  decided_at: Date | null;
}

const toProposal = (r: ProposalRow): Proposal => ({
  id: r.id,
  conversationId: r.conversation_id,
  viaMcp: r.via === "mcp",
  instanceKey: r.instance_key,
  access: r.access,
  operation: r.operation,
  processId: r.process_id,
  processName: r.process_name,
  summary: r.summary,
  reason: r.reason,
  payload: r.payload,
  before: r.before,
  status: r.status,
  result: r.result,
  error: r.error,
  createdAt: r.created_at.toISOString(),
  decidedBy: r.decided_by === null ? null : { id: r.decided_by, name: r.decided_by_name ?? "?" },
  decidedAt: r.decided_at?.toISOString() ?? null,
});

let aiAgentUserIdCache: number | null = null;
/** The `ai-agent` user's id (migration 067) - the author of what an agent applies on Auto. */
async function aiAgentUserId(): Promise<number> {
  if (aiAgentUserIdCache !== null) return aiAgentUserIdCache;
  const row = (await pool.query<{ id: number }>("SELECT id FROM users WHERE username = 'ai-agent'")).rows[0];
  if (!row) throw new Error("the ai-agent user not found");
  aiAgentUserIdCache = row.id;
  return aiAgentUserIdCache;
}

export async function getProposal(id: number): Promise<Proposal | null> {
  const row = (await pool.query<ProposalRow>(`${SELECT} WHERE a.id = $1`, [id])).rows[0];
  return row ? toProposal(row) : null;
}

export interface ProposalFilter {
  conversationId?: number;
  status?: ProposalStatus;
  // the conversations of this user only (a non-admin's view)
  ownerId?: number;
  limit?: number;
  offset?: number;
}

/** Proposals, newest first (a conversation's - in order), and how many match. */
export async function listProposals(filter: ProposalFilter): Promise<{ items: Proposal[]; total: number }> {
  const where: string[] = [];
  const args: unknown[] = [];
  const add = (sql: string, v: unknown) => {
    args.push(v);
    where.push(sql.replace("?", `$${args.length}`));
  };
  if (filter.conversationId !== undefined) add("a.conversation_id = ?", filter.conversationId);
  if (filter.status) add("a.status = ?", filter.status);
  if (filter.ownerId !== undefined) add("a.conversation_id IN (SELECT id FROM ai_conversations WHERE created_by = ?)", filter.ownerId);
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const order = filter.conversationId !== undefined ? "a.id" : "a.id DESC";
  const [rows, total] = await Promise.all([
    pool.query<ProposalRow>(`${SELECT} ${whereSql} ORDER BY ${order} LIMIT $${args.length + 1} OFFSET $${args.length + 2}`, [
      ...args,
      Math.min(Math.max(filter.limit ?? 50, 1), 500),
      Math.max(filter.offset ?? 0, 0),
    ]),
    pool.query<{ n: string }>(`SELECT count(*) AS n FROM ai_proposals a ${whereSql}`, args),
  ]);
  return { items: rows.rows.map(toProposal), total: Number(total.rows[0].n) };
}

/** Who started the conversation a proposal came from (null - an MCP client's, or the conversation is gone). */
export async function proposalOwner(id: number): Promise<number | null> {
  return (
    (await pool.query<{ created_by: number | null }>("SELECT c.created_by FROM ai_proposals a JOIN ai_conversations c ON c.id = a.conversation_id WHERE a.id = $1", [id]))
      .rows[0]?.created_by ?? null
  );
}

/**
 * An agent's proposal: stored; on Auto - applied at once as `ai-agent`. The
 * caller (the proposing tool) has checked it can apply now.
 */
export async function propose(input: ProposalInput, origin: ProposalOrigin): Promise<Proposal> {
  const level: Level = origin.instance.access[input.access];
  if (level === "off") throw new ProcessWriteError(`${origin.instance.name}: ${input.access} is off`, 403);
  const id = (
    await pool.query<{ id: number }>(
      `INSERT INTO ai_proposals (via, conversation_id, mcp_token_id, instance_key, access, operation, process_id, summary, reason, payload, before)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
      [
        origin.mcpTokenId ? "mcp" : "assistant",
        origin.conversationId ?? null,
        origin.mcpTokenId ?? null,
        origin.instance.key,
        input.access,
        input.operation,
        input.processId,
        input.summary,
        input.reason,
        JSON.stringify(input.payload),
        input.before === null ? null : JSON.stringify(input.before),
      ],
    )
  ).rows[0].id;
  if (level === "auto") return decide(id, await aiAgentUserId(), "accept");
  return (await getProposal(id))!;
}

async function apply(p: ProposalRow, userId: number): Promise<unknown> {
  const processId = p.process_id;
  const needProcess = () => {
    if (processId === null) throw new ProcessWriteError("the process is gone", 410);
    return processId;
  };
  switch (p.operation) {
    case "config": {
      const { sections } = p.payload as { sections: Record<string, unknown> };
      const seen = (p.before?.stamps ?? {}) as Record<string, string | null>;
      const { stamps } = await writeProcessConfig(needProcess(), sections, seen, userId, "ai");
      return { stamps };
    }
    case "command": {
      const { action, params } = p.payload as { action: string; params: Record<string, unknown> };
      return { commandId: await giveProcessCommand(needProcess(), action, params, userId, "ai") };
    }
    case "switch":
      await switchProcess(needProcess(), (p.payload as { action: string }).action, userId, "ai");
      return { status: (p.payload as { action: string }).action };
    case "create-process": {
      const id = await createProcess(p.payload as NewProcess, userId, "ai");
      await pool.query("UPDATE ai_proposals SET process_id = $2 WHERE id = $1", [p.id, id]);
      return { processId: id };
    }
    case "create-node":
      return createNode(p.payload as NewNode, userId, "ai");
    case "create-device":
      return { deviceId: await createDevice(p.payload as NewDevice, userId, "ai") };
  }
}

/**
 * A person's (or, on Auto, ai-agent's) decision on a pending proposal - the
 * proposal after it. Taken once: a proposal already decided - 409.
 */
export async function decide(id: number, userId: number, decision: "accept" | "reject"): Promise<Proposal> {
  // claimed atomically - two people pressing Accept at once apply it once
  const claimed = (
    await pool.query<ProposalRow>(
      "UPDATE ai_proposals SET decided_by = $2, decided_at = now() WHERE id = $1 AND status = 'pending' AND decided_at IS NULL RETURNING *",
      [id, userId],
    )
  ).rows[0];
  if (!claimed) {
    const existing = await getProposal(id);
    if (!existing) throw new ProcessWriteError("no such proposal", 404);
    throw new ProcessWriteError(`the proposal is already ${existing.status === "pending" ? "being applied" : existing.status}`, 409);
  }
  if (decision === "reject") {
    await pool.query("UPDATE ai_proposals SET status = 'rejected' WHERE id = $1", [id]);
  } else {
    try {
      const result = await apply(claimed, userId);
      await pool.query("UPDATE ai_proposals SET status = 'applied', result = $2 WHERE id = $1", [id, JSON.stringify(result ?? null)]);
    } catch (err) {
      const known = err instanceof ProcessWriteError || err instanceof RegistryError || (err as { code?: string }).code === "23505";
      if (!known) logger.error({ err, proposal: id }, "applying an AI proposal failed");
      const message = known ? ((err as { detail?: string }).detail ?? (err as Error).message) : "applying failed - see the api log";
      await pool.query("UPDATE ai_proposals SET status = 'failed', error = $2 WHERE id = $1", [id, message]);
    }
  }
  return (await getProposal(id))!;
}
