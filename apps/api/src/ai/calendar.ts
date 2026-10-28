import { getSystemActorUserId } from "../commandLog.js";
import { config } from "../config.js";
import { pool } from "../db.js";
import { logger } from "../logger.js";
import { syncActiveMessages, type MessageInput } from "../processMessages.js";
import { AgentError, sendMessage, startConversation } from "./agent.js";
import { getInstance, type Instance } from "./instances.js";
import { dueOccurrence, nextRun, type Repeat } from "./calendarTime.js";
import { scheduledRunRequest } from "./prompts.js";

// The AI Assistant's calendar (Nexus Edge AI Assistant, stage 7 - nexus-
// edge-aquarium AGENTS_TO_DO.md 2026-10-17; migration 072): scheduled runs
// of an instance's work types - those its DNP (or Nexus Edge) declares in
// `scheduledTypes`.
// - The clock: the "ai-assistant" process's tick in the orchestrator calls
//   POST /ai/calendar/tick; `calendarTick` starts what is due, one run at a
//   time (a queue - a model call is slow, the tick is not held).
// - Due (calendarTime.ts): the local wall time on its date (the daylight
//   saving switches - the processes' dueOccurrence rule), one run per date,
//   no later than AI_CALENDAR_CATCH_UP_MIN (the system down - skipped).
// - A run: a conversation started as the "system" user (the orchestrator is
//   "system"), the request from prompts/scheduled.md; its answer's last line
//   `Status: OK | PROBLEM - ...` is the run's status. Proposals follow the
//   instance's access levels (Auto - applied as ai-agent; Confirm - pending,
//   Logs -> AI Proposals).
// - The runs' problems (and failures) are the "ai-assistant" process's WEM
//   warnings, one per schedule (code "schedule:<id>", linked to the run's
//   conversation), resolved by the schedule's next OK run.

export type RunStatus = "running" | "ok" | "problem" | "failed" | "skipped";

export interface Schedule {
  id: number;
  instanceKey: string;
  workType: string;
  enabled: boolean;
  repeat: Repeat;
  weekday: number | null;
  monthDay: number | null;
  month: number | null;
  time: string;
  everyHours: number | null;
  lastRunDate: string | null;
  lastRunAt: string | null;
  lastConversationId: number | null;
  lastStatus: RunStatus | null;
  lastNote: string | null;
  nextRunAt: string | null;
  updatedAt: string;
}

interface ScheduleRow {
  id: number;
  instance_key: string;
  work_type: string;
  enabled: boolean;
  repeat: Repeat;
  weekday: number | null;
  month_day: number | null;
  month: number | null;
  time: string;
  every_hours: number | null;
  last_run_date: string | null;
  last_run_at: Date | null;
  last_conversation_id: number | null;
  last_status: RunStatus | null;
  last_note: string | null;
  updated_at: Date;
}

const toSchedule = (r: ScheduleRow): Schedule => ({
  id: r.id,
  instanceKey: r.instance_key,
  workType: r.work_type,
  enabled: r.enabled,
  repeat: r.repeat,
  weekday: r.weekday,
  monthDay: r.month_day,
  month: r.month,
  time: r.time,
  everyHours: r.every_hours,
  lastRunDate: r.last_run_date,
  lastRunAt: r.last_run_at?.toISOString() ?? null,
  lastConversationId: r.last_conversation_id,
  lastStatus: r.last_status,
  lastNote: r.last_note,
  nextRunAt: r.enabled ? (nextRun(r, Date.now())?.toISOString() ?? null) : null,
  updatedAt: r.updated_at.toISOString(),
});

// --- CRUD ----------------------------------------------------------------------

export interface ScheduleInput {
  workType?: string;
  enabled?: boolean;
  repeat?: Repeat;
  weekday?: number | null;
  monthDay?: number | null;
  month?: number | null;
  time?: string;
  everyHours?: number | null;
}

/** What is wrong with a schedule for an instance (null - fine). */
export function scheduleProblem(instance: Instance, s: Required<ScheduleInput>): string | null {
  if (!instance.scheduledTypes.includes(s.workType))
    return instance.scheduledTypes.length
      ? `workType must be one of ${instance.scheduledTypes.join(", ")}`
      : `${instance.name} declares no scheduled work types`;
  if (!["day", "week", "month", "year", "hours"].includes(s.repeat)) return "repeat must be day, week, month, year or hours";
  if (s.repeat === "hours" && !(Number.isInteger(s.everyHours) && s.everyHours! >= 1 && s.everyHours! <= 12)) return "everyHours (1..12) is required for runs every N hours";
  if (!/^(([01]\d|2[0-3]):[0-5]\d|24:00)$/.test(s.time)) return "time must be HH:MM (00:00 - 24:00)";
  if (s.repeat === "week" && !(Number.isInteger(s.weekday) && s.weekday! >= 0 && s.weekday! <= 6)) return "weekday (0 - Sunday .. 6) is required for a weekly run";
  if ((s.repeat === "month" || s.repeat === "year") && !(Number.isInteger(s.monthDay) && s.monthDay! >= 1 && s.monthDay! <= 31))
    return "monthDay (1..31) is required";
  if (s.repeat === "year" && !(Number.isInteger(s.month) && s.month! >= 1 && s.month! <= 12)) return "month (1..12) is required for a yearly run";
  return null;
}

// only the fields its repeat uses are kept
const normalized = (s: Required<ScheduleInput>) => ({
  ...s,
  weekday: s.repeat === "week" ? s.weekday : null,
  monthDay: s.repeat === "month" || s.repeat === "year" ? s.monthDay : null,
  month: s.repeat === "year" ? s.month : null,
  everyHours: s.repeat === "hours" ? s.everyHours : null,
});

export async function listSchedules(instanceKey?: string): Promise<Schedule[]> {
  const rows = (
    await pool.query<ScheduleRow>("SELECT * FROM ai_schedules WHERE $1::text IS NULL OR instance_key = $1 ORDER BY instance_key, time, id", [instanceKey ?? null])
  ).rows;
  return rows.map(toSchedule);
}

async function scheduleRow(id: number): Promise<ScheduleRow | null> {
  return (await pool.query<ScheduleRow>("SELECT * FROM ai_schedules WHERE id = $1", [id])).rows[0] ?? null;
}

export class CalendarError extends Error {
  constructor(
    message: string,
    public statusCode = 400,
  ) {
    super(message);
  }
}

export async function createSchedule(instanceKey: string, input: ScheduleInput, userId: number): Promise<Schedule> {
  const instance = await getInstance(instanceKey);
  if (!instance) throw new CalendarError("no such instance", 404);
  const s: Required<ScheduleInput> = {
    workType: input.workType ?? instance.scheduledTypes[0] ?? "",
    enabled: input.enabled ?? true,
    repeat: input.repeat ?? "day",
    weekday: input.weekday ?? null,
    monthDay: input.monthDay ?? null,
    month: input.month ?? null,
    time: input.time ?? "",
    everyHours: input.everyHours ?? null,
  };
  const problem = scheduleProblem(instance, s);
  if (problem) throw new CalendarError(problem);
  const n = normalized(s);
  const row = (
    await pool.query<ScheduleRow>(
      `INSERT INTO ai_schedules (instance_key, work_type, enabled, repeat, weekday, month_day, month, time, every_hours, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [instanceKey, n.workType, n.enabled, n.repeat, n.weekday, n.monthDay, n.month, n.time, n.everyHours, userId],
    )
  ).rows[0];
  return toSchedule(row);
}

export async function updateSchedule(id: number, input: ScheduleInput): Promise<Schedule> {
  const row = await scheduleRow(id);
  if (!row) throw new CalendarError("no such schedule", 404);
  const instance = await getInstance(row.instance_key);
  if (!instance) throw new CalendarError("the schedule's instance is gone", 410);
  const s: Required<ScheduleInput> = {
    workType: input.workType ?? row.work_type,
    enabled: input.enabled ?? row.enabled,
    repeat: input.repeat ?? row.repeat,
    weekday: input.weekday !== undefined ? input.weekday : row.weekday,
    monthDay: input.monthDay !== undefined ? input.monthDay : row.month_day,
    month: input.month !== undefined ? input.month : row.month,
    time: input.time ?? row.time,
    everyHours: input.everyHours !== undefined ? input.everyHours : row.every_hours,
  };
  const problem = scheduleProblem(instance, s);
  if (problem) throw new CalendarError(problem);
  const n = normalized(s);
  const updated = (
    await pool.query<ScheduleRow>(
      `UPDATE ai_schedules SET work_type = $2, enabled = $3, repeat = $4, weekday = $5, month_day = $6, month = $7, time = $8, every_hours = $9, updated_at = now()
       WHERE id = $1 RETURNING *`,
      [id, n.workType, n.enabled, n.repeat, n.weekday, n.monthDay, n.month, n.time, n.everyHours],
    )
  ).rows[0];
  // switched off - its problem is no one's to see any more
  if (!n.enabled) await syncProblems();
  return toSchedule(updated);
}

export async function deleteSchedule(id: number): Promise<boolean> {
  const deleted = ((await pool.query("DELETE FROM ai_schedules WHERE id = $1", [id])).rowCount ?? 0) > 0;
  if (deleted) await syncProblems();
  return deleted;
}

// --- runs ----------------------------------------------------------------------

const STATUS_LINE = /^\s*\**status:?\**\s*(ok|problem)\b\s*[-:–—]?\s*(.*)$/im;

let queue: Promise<void> = Promise.resolve();
const enqueue = (id: number) => {
  queue = queue.then(() => runSchedule(id)).catch((err: unknown) => logger.error({ err, schedule: id }, "a scheduled AI run failed"));
};

/** The orchestrator's tick: claims what is due (one run per occurrence date) and queues it - the claimed ids. */
export async function calendarTick(now = Date.now()): Promise<number[]> {
  const rows = (await pool.query<ScheduleRow>("SELECT * FROM ai_schedules WHERE enabled")).rows;
  const started: number[] = [];
  for (const r of rows) {
    const date = dueOccurrence(r, now, config.ai.calendarCatchUpMin);
    if (!date) continue;
    // claimed atomically - another tick / api instance doesn't run it again
    const claimed = await pool.query(
      "UPDATE ai_schedules SET last_run_date = $2, last_run_at = now(), last_status = 'running', last_note = NULL WHERE id = $1 AND last_run_date IS DISTINCT FROM $2",
      [r.id, date],
    );
    if (claimed.rowCount) {
      started.push(r.id);
      enqueue(r.id);
    }
  }
  return started;
}

/** Runs a schedule now (a person's "Run now") - queued like a due one. */
export async function runNow(id: number): Promise<void> {
  const claimed = await pool.query(
    "UPDATE ai_schedules SET last_run_at = now(), last_status = 'running', last_note = NULL WHERE id = $1 AND last_status IS DISTINCT FROM 'running'",
    [id],
  );
  if (claimed.rowCount) return enqueue(id);
  if (!(await scheduleRow(id))) throw new CalendarError("no such schedule", 404);
  throw new CalendarError("it is running now", 409);
}

/** Runs left "running" by an api that stopped mid-run (the queue lives in memory) - failed. */
export async function recoverInterruptedRuns(): Promise<void> {
  await pool.query("UPDATE ai_schedules SET last_status = 'failed', last_note = 'interrupted - the api restarted' WHERE last_status = 'running'");
  await syncProblems();
}

async function finish(id: number, status: RunStatus, note: string | null, conversationId: number | null): Promise<void> {
  await pool.query("UPDATE ai_schedules SET last_status = $2, last_note = $3, last_conversation_id = COALESCE($4, last_conversation_id) WHERE id = $1", [
    id,
    status,
    note,
    conversationId,
  ]);
  await syncProblems();
}

async function runSchedule(id: number): Promise<void> {
  const s = await scheduleRow(id);
  if (!s) return;
  const instance = await getInstance(s.instance_key);
  if (!instance) return finish(id, "skipped", "the instance is gone", null);
  if (instance.connectionId === null) return finish(id, "skipped", `the assistant is off for ${instance.name} (no connection)`, null);
  const workTitle = instance.workTypes.find((w) => w.key === s.work_type)?.title ?? s.work_type;
  let conversationId: number | null = null;
  try {
    const conversation = await startConversation(instance.key, s.work_type, `Scheduled: ${workTitle} - ${instance.name}`, await getSystemActorUserId(), id);
    conversationId = conversation!.id;
    const template = (await scheduledRunRequest()) ?? 'Scheduled run of "{workType}" for {entity}. End with "Status: OK" or "Status: PROBLEM - <what>".';
    const request = template
      .replaceAll("{workType}", workTitle)
      .replaceAll("{entity}", instance.name)
      .replaceAll("{language}", config.ai.scheduledLanguage);
    const messages = await sendMessage(conversationId, request);
    const answer = [...messages].reverse().find((m) => m.role === "assistant" && !m.toolCalls?.length)?.content ?? "";
    const status = STATUS_LINE.exec(answer);
    if (!status) return finish(id, "ok", "no status line - read the report", conversationId);
    if (status[1].toLowerCase() === "ok") return finish(id, "ok", null, conversationId);
    return finish(id, "problem", status[2].trim().slice(0, 300) || "a problem - read the report", conversationId);
  } catch (err) {
    const message = err instanceof AgentError ? err.message : "the run failed - see the api log";
    if (!(err instanceof AgentError)) logger.error({ err, schedule: id }, "a scheduled AI run failed");
    return finish(id, "failed", message, conversationId);
  }
}

/** The runs' problems now -> the "ai-assistant" process's warnings (one per schedule; none - resolved). */
export async function syncProblems(): Promise<void> {
  const process = (await pool.query<{ id: number; config: { problemLevel?: number } }>("SELECT id, config FROM processes WHERE kind = 'ai-assistant' ORDER BY id LIMIT 1"))
    .rows[0];
  if (!process) return;
  const level = process.config?.problemLevel ?? 1;
  const rows = (
    await pool.query<ScheduleRow>("SELECT * FROM ai_schedules WHERE enabled AND last_status IN ('problem', 'failed') ORDER BY id")
  ).rows;
  const entries: MessageInput[] = [];
  for (const r of rows) {
    const instance = await getInstance(r.instance_key);
    const workTitle = instance?.workTypes.find((w) => w.key === r.work_type)?.title ?? r.work_type;
    entries.push({
      code: `schedule:${r.id}`,
      level,
      text: `${workTitle}: ${r.last_status === "failed" ? `the scheduled run failed - ${r.last_note}` : r.last_note}`,
      subject: instance?.name ?? r.instance_key,
      link: r.last_conversation_id ? `/ai-assistant/${r.last_conversation_id}` : null,
    });
  }
  await syncActiveMessages(process.id, "warning", entries, "ai");
}
