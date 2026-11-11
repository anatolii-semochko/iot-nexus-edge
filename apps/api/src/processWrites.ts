import { logCommand } from "./commandLog.js";
import { configProblems } from "./configSchemas.js";
import { pool } from "./db.js";
import { announceChange } from "./entityChanges.js";
import { broadcastForced } from "./processBroadcast.js";
import * as processRegistry from "./processRegistry.js";

// A process's writes - its config, a one-shot command, ON / OFF, creating
// one - in ONE place for every writer (routes/processes.ts for a person; the
// AI Assistant's proposals, ai/proposals.ts, applied by a person or by the
// `ai-agent` account): the section stamps a write saw (migration 064 - a
// section changed since is refused), the kind's schema (configSchemas.ts),
// the command log, and the author of the sections' stamps (`nexus.actor`).

export class ProcessWriteError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public extra: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

interface ProcessRow {
  id: number;
  kind: string;
  config: Record<string, unknown>;
  config_stamps: Record<string, { at: string; by: number | null }>;
}

async function processOf(processId: number): Promise<ProcessRow> {
  const p = (await pool.query<ProcessRow>("SELECT id, kind, config, config_stamps FROM processes WHERE id = $1", [processId])).rows[0];
  if (!p) throw new ProcessWriteError("process not found", 404);
  return p;
}

// the config after the write - or what is wrong with it (the kind's schema)
function checkedConfig(process: ProcessRow, sections: Record<string, unknown>): Record<string, unknown> {
  const config = { ...process.config, ...sections } as Record<string, unknown> & { min?: number; max?: number };
  if (config.min !== undefined && config.max !== undefined && config.max < config.min) throw new ProcessWriteError("max cannot be less than min", 400);
  const problems = configProblems(process.kind, sections);
  if (problems.length > 0) throw new ProcessWriteError(`invalid config: ${problems.join("; ")}`, 400, { problems });
  return config;
}

/** Checks a config write without making it (a proposal's, before a person sees it). */
export async function checkProcessConfig(processId: number, sections: Record<string, unknown>): Promise<void> {
  checkedConfig(await processOf(processId), sections);
}

/** The sections' stamps now (for a write that will say what it saw). */
export async function sectionStamps(processId: number, sections: string[]): Promise<Record<string, string | null>> {
  const p = await processOf(processId);
  return Object.fromEntries(sections.map((s) => [s, p.config_stamps?.[s]?.at ?? null]));
}

/**
 * Writes `sections` (top-level config sections, merged over the config) as
 * `actorUserId`; `seen` - the stamps the writer saw per section (a section
 * changed after - 409; absent - not checked); `source` - the command log's.
 */
export async function writeProcessConfig(
  processId: number,
  sections: Record<string, unknown>,
  seen: Record<string, string | null> | undefined,
  actorUserId: number,
  source: string,
): Promise<{ config: Record<string, unknown>; stamps: unknown }> {
  const process = await processOf(processId);
  for (const [section, seenAt] of Object.entries(seen ?? {})) {
    if (!(section in sections)) continue;
    const stamp = process.config_stamps?.[section];
    if (stamp?.at && (!seenAt || Date.parse(stamp.at) > Date.parse(seenAt))) {
      const by =
        stamp.by === null
          ? null
          : (await pool.query<{ name: string }>("SELECT COALESCE(display_name, username) AS name FROM users WHERE id = $1", [stamp.by])).rows[0]?.name;
      throw new ProcessWriteError(`"${section}" was changed${by ? ` by ${by}` : ""} at ${stamp.at} - reload and edit again`, 409, { section, stamp });
    }
  }
  const config = checkedConfig(process, sections);

  // Logged before applying (AGENTS.md section 22's precedent for device
  // writes) - `value` is the partial patch actually sent.
  await logCommand({ processId, action: "config", value: sections, source, actorUserId });
  // the writer named for the sections' stamps (the trigger reads nexus.actor)
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('nexus.actor', $1, true)", [String(actorUserId)]);
    const stamps = (await client.query("UPDATE processes SET config = $1, updated_at = now() WHERE id = $2 RETURNING config_stamps", [config, processId])).rows[0]
      ?.config_stamps;
    await client.query("COMMIT");
    return { config, stamps };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/** Gives a process a one-shot command (process_commands, migration 064) as `actorUserId` - its id. */
export async function giveProcessCommand(processId: number, action: string, params: Record<string, unknown>, actorUserId: number, source: string): Promise<number> {
  await processOf(processId);
  if (!action) throw new ProcessWriteError("action is required", 400);
  await logCommand({ processId, action: "command", value: { action, params }, source, actorUserId });
  return (
    await pool.query<{ id: number }>("INSERT INTO process_commands (process_id, action, params, created_by) VALUES ($1, $2, $3, $4) RETURNING id", [
      processId,
      action,
      params,
      actorUserId,
    ])
  ).rows[0].id;
}

// Only ON / OFF exist today - START / PAUSE / STOP are named in the general
// process concept but not implemented yet.
const IMPLEMENTED_ACTIONS = new Set(["ON", "OFF"]);

/** Switches a process ON / OFF as `actorUserId`. */
export async function switchProcess(processId: number, action: string, actorUserId: number, source: string): Promise<void> {
  const p = (await pool.query<{ actions: string[] }>("SELECT actions FROM processes WHERE id = $1", [processId])).rows[0];
  if (!p) throw new ProcessWriteError("process not found", 404);
  if (!p.actions.includes(action)) throw new ProcessWriteError(`action '${action}' is not valid for this process`, 400, { allowed: p.actions });
  if (!IMPLEMENTED_ACTIONS.has(action)) throw new ProcessWriteError(`action '${action}' is not implemented yet`, 400);
  await logCommand({ processId, action: action === "ON" ? "on" : "off", source, actorUserId });
  await processRegistry.setStatus(processId, action === "ON" ? "on" : "off", source);
  // the status lives in Redis - no row change tells the processes' caches
  announceChange("processes", processId);
  // `status` is a deliberately non-urgent, timer-only broadcast field
  // (AGENTS.md section 24) - a switch is exactly the "flip it and watch the
  // effect immediately" case that's laggy for: forced, not left to the
  // next periodic tick or an unrelated urgent trigger.
  await broadcastForced(`process-action:${action}`);
}

export interface NewProcess {
  name: string;
  groupId: number;
  type: "controllable" | "permanent";
  kind: string;
  actions?: string[];
  deviceId?: number | null;
  nodeId?: number | null;
  config?: object;
}

/**
 * Creates a process (a DNP instance) as `actorUserId` - its id. Live: the
 * orchestrator's tick re-reads the processes each tick (AGENTS.md sections
 * 10 / 51); a kind whose plugin isn't loaded there yet is skipped until a
 * restart (GET /processes/registered-kinds).
 */
export async function createProcess(input: NewProcess, actorUserId: number, source: string): Promise<number> {
  const { name, groupId, type, kind, actions, deviceId, nodeId, config } = input;
  if (!name || !groupId || !kind) throw new ProcessWriteError("name, groupId, and kind are required", 400);
  if (type !== "controllable" && type !== "permanent") throw new ProcessWriteError("type must be 'controllable' or 'permanent'", 400);
  const problems = config ? configProblems(kind, config) : [];
  if (problems.length > 0) throw new ProcessWriteError(`invalid config: ${problems.join("; ")}`, 400, { problems });
  let id: number;
  try {
    id = (
      await pool.query<{ id: number }>(
        `INSERT INTO processes (name, group_id, type, kind, actions, device_id, node_id, config)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [name, groupId, type, kind, actions ?? [], deviceId ?? null, nodeId ?? null, config ?? {}],
      )
    ).rows[0].id;
  } catch (err) {
    throw new ProcessWriteError((err as Error).message, 400);
  }
  await logCommand({ processId: id, action: "create", value: input, source, actorUserId });
  return id;
}
