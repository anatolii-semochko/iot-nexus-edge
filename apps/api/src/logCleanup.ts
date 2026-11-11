import { pool } from "./db.js";
import { instanceUnits } from "./dnpInstances.js";
import { initUnreadCounts } from "./processMessages.js";

// Clear Logs with a choice (Service -> Database; nexus-edge-aquarium
// AGENTS_TO_DO.md 2026-10-17, point 11): the logs up to a date (none - all),
// for the units a person ticks, each with its volume up to that date.
// Units:
// - permanent - "ai-messenger" (the AI Assistant's conversations with their
//   messages, the calendar's runs too - by their last activity),
//   "ai-reports", "ai-proposals" (decided ones - a pending one is still
//   waiting for a person), "system" (the log rows of no DNP instance - the
//   core, users, standalone devices, deleted entities);
// - a DNP instance - a root node's tree (an aquarium with its modules: the
//   processes on those nodes and their devices), or a process with no node
//   (Resource Monitor, Data Logger ...).
// The log tables - log_command, log_device, log_messages; an active WEM
// message (unresolved, not dismissed) is the current state, not history -
// kept. Time series (`samples`) are not logs - not here.

export interface LogUnit {
  key: string;
  name: string;
  detail: string | null;
  permanent: boolean;
  rows: number;
  bytes: number;
}

const PERMANENT: { key: string; name: string; detail: string }[] = [
  { key: "ai-messenger", name: "AI Assistant Messenger", detail: "conversations and scheduled runs" },
  { key: "ai-reports", name: "AI Assistant Reports", detail: "reports to the developers" },
  { key: "ai-proposals", name: "AI Assistant Proposals", detail: "decided proposals (pending ones are kept)" },
  { key: "system", name: "System", detail: "core, users, standalone devices" },
];

const cutoffOf = (before: string | null) => {
  if (before === null || before === "") return null;
  const t = new Date(before);
  if (Number.isNaN(t.getTime())) throw new Error("before must be a date");
  return t;
};

// an active WEM message - the current state, kept
const NOT_ACTIVE = "NOT (resolved_at IS NULL AND hidden = false)";

/** Every unit with its log volume up to `before` (null - all): the permanent ones first, then the larger first. */
export async function logVolumes(before: string | null): Promise<LogUnit[]> {
  const cutoff = cutoffOf(before);
  const map = await instanceUnits();
  const [command, device, messages, conversations, reports, proposals] = await Promise.all([
    pool.query<{ process_id: number | null; device_id: number | null; n: string; bytes: string }>(
      `SELECT process_id, device_id, count(*) AS n, sum(pg_column_size(c.*)) AS bytes FROM log_command c
       WHERE $1::timestamptz IS NULL OR created_at < $1 GROUP BY process_id, device_id`,
      [cutoff],
    ),
    pool.query<{ device_id: number | null; n: string; bytes: string }>(
      `SELECT device_id, count(*) AS n, sum(pg_column_size(d.*)) AS bytes FROM log_device d
       WHERE $1::timestamptz IS NULL OR created_at < $1 GROUP BY device_id`,
      [cutoff],
    ),
    pool.query<{ process_id: number | null; n: string; bytes: string }>(
      `SELECT process_id, count(*) AS n, sum(pg_column_size(m.*)) AS bytes FROM log_messages m
       WHERE ($1::timestamptz IS NULL OR created_at < $1) AND ${NOT_ACTIVE} GROUP BY process_id`,
      [cutoff],
    ),
    pool.query<{ n: string; bytes: string }>(
      `SELECT count(*) AS n, COALESCE(sum(pg_column_size(c.*) + COALESCE(m.bytes, 0)), 0) AS bytes FROM ai_conversations c
       LEFT JOIN (SELECT conversation_id, sum(pg_column_size(x.*)) AS bytes FROM ai_messages x GROUP BY conversation_id) m ON m.conversation_id = c.id
       WHERE $1::timestamptz IS NULL OR c.updated_at < $1`,
      [cutoff],
    ),
    pool.query<{ n: string; bytes: string }>(
      "SELECT count(*) AS n, COALESCE(sum(pg_column_size(r.*)), 0) AS bytes FROM ai_reports r WHERE $1::timestamptz IS NULL OR created_at < $1",
      [cutoff],
    ),
    pool.query<{ n: string; bytes: string }>(
      "SELECT count(*) AS n, COALESCE(sum(pg_column_size(p.*)), 0) AS bytes FROM ai_proposals p WHERE status <> 'pending' AND ($1::timestamptz IS NULL OR created_at < $1)",
      [cutoff],
    ),
  ]);
  const totals = new Map<string, { rows: number; bytes: number }>();
  const add = (key: string, n: string, bytes: string) => {
    const t = totals.get(key) ?? { rows: 0, bytes: 0 };
    t.rows += Number(n);
    t.bytes += Number(bytes ?? 0);
    totals.set(key, t);
  };
  for (const r of command.rows)
    add(
      (r.process_id !== null ? map.processUnit.get(r.process_id) : r.device_id !== null ? map.deviceUnit.get(r.device_id) : undefined) ?? "system",
      r.n,
      r.bytes,
    );
  for (const r of device.rows) add((r.device_id !== null ? map.deviceUnit.get(r.device_id) : undefined) ?? "system", r.n, r.bytes);
  for (const r of messages.rows) add((r.process_id !== null ? map.processUnit.get(r.process_id) : undefined) ?? "system", r.n, r.bytes);
  add("ai-messenger", conversations.rows[0].n, conversations.rows[0].bytes);
  add("ai-reports", reports.rows[0].n, reports.rows[0].bytes);
  add("ai-proposals", proposals.rows[0].n, proposals.rows[0].bytes);

  const volume = (key: string) => totals.get(key) ?? { rows: 0, bytes: 0 };
  const permanent = PERMANENT.map((p) => ({ ...p, permanent: true, ...volume(p.key) }));
  const instances = [...map.units.entries()]
    .map(([key, u]) => ({ key, name: u.name, detail: u.detail.join(", ") || null, permanent: false, ...volume(key) }))
    .sort((a, b) => b.bytes - a.bytes || a.name.localeCompare(b.name));
  return [...permanent, ...instances];
}

/** Deletes the logs of `keys` up to `before` (null - all) - the rows deleted per table. */
export async function clearLogs(before: string | null, keys: string[], options: { keepShared?: boolean } = {}): Promise<Record<string, number>> {
  const cutoff = cutoffOf(before);
  const map = await instanceUnits();
  const chosen = new Set(keys);
  const processIds = [...map.processUnit.entries()].filter(([, k]) => chosen.has(k)).map(([id]) => id);
  const deviceIds = [...map.deviceUnit.entries()].filter(([, k]) => chosen.has(k)).map(([id]) => id);
  const system = chosen.has("system");
  const deleted: Record<string, number> = {};
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const run = async (table: string, sql: string, args: unknown[]) => {
      deleted[table] = (deleted[table] ?? 0) + ((await client.query(sql, args)).rowCount ?? 0);
    };
    const time = "($1::timestamptz IS NULL OR created_at < $1)";
    // a row of a process -> its unit; else of a device -> the device's; else - system
    await run(
      "log_command",
      `DELETE FROM log_command WHERE ${time} AND (process_id = ANY($2) OR (process_id IS NULL AND device_id = ANY($3))
         OR ($4 AND ((process_id IS NULL AND device_id IS NULL)
           OR (process_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM processes p WHERE p.id = process_id))
           OR (process_id IS NULL AND device_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM devices d WHERE d.id = device_id)))))`,
      [cutoff, processIds, deviceIds, system],
    );
    await run(
      "log_device",
      `DELETE FROM log_device WHERE ${time} AND (device_id = ANY($2)
         OR ($3 AND (device_id IS NULL OR NOT EXISTS (SELECT 1 FROM devices d WHERE d.id = device_id))))`,
      [cutoff, deviceIds, system],
    );
    await run(
      "log_messages",
      `DELETE FROM log_messages WHERE ${time} AND ${NOT_ACTIVE} AND (process_id = ANY($2)
         OR ($3 AND (process_id IS NULL OR NOT EXISTS (SELECT 1 FROM processes p WHERE p.id = process_id))))`,
      [cutoff, processIds, system],
    );
    // `keepShared` - the nightly retention keeps the shared conversations (ai routes - "Share"; migration 094)
    if (chosen.has("ai-messenger"))
      await run(
        "ai_conversations",
        `DELETE FROM ai_conversations WHERE ($1::timestamptz IS NULL OR updated_at < $1) AND NOT ($2 AND shared)`,
        [cutoff, options.keepShared ?? false],
      );
    if (chosen.has("ai-reports")) await run("ai_reports", `DELETE FROM ai_reports WHERE ${time}`, [cutoff]);
    if (chosen.has("ai-proposals")) await run("ai_proposals", `DELETE FROM ai_proposals WHERE status <> 'pending' AND ${time}`, [cutoff]);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
  // Found live (2026-08-30, "Clear Logs doesn't work"): the header's unread
  // badges are cached counters in Redis (processMessages.ts `wem:unread:*`),
  // not counted from log_messages - deleted rows left them showing the old
  // numbers. Resynced from the tables, as at boot.
  await initUnreadCounts();
  return deleted;
}

/** Everything older than `days` days - every unit (the nightly retention, maintenance.ts). */
export async function clearLogsOlderThan(days: number): Promise<Record<string, number>> {
  const map = await instanceUnits();
  const keys = [...PERMANENT.map((p) => p.key), ...map.units.keys()];
  return clearLogs(new Date(Date.now() - days * 86_400_000).toISOString(), keys, { keepShared: true });
}
