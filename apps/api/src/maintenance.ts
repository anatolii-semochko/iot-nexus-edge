import { dueOccurrence } from "./ai/calendarTime.js";
import { removeOldGuestConversations } from "./access/guestSettings.js";
import { removeEndedSessions } from "./access/session.js";
import { config } from "./config.js";
import { pool } from "./db.js";
import { clearLogsOlderThan } from "./logCleanup.js";
import { logger } from "./logger.js";

// The nightly maintenance (B1.3 - iot AGENTS_TO_DO.md 2026-10-17), checked
// every minute, each job once a day at its local time (the calendar's rule
// - ai/calendarTime.ts: a time the clock skips runs after the jump, a
// repeated one once, a job later than its catch-up span skipped); the day a
// job last ran is kept in `system_settings` - a restart doesn't run it again:
// - the guests' conversations past the guest's kept days (Users -> Guest; at
//   GUEST_CLEANUP_AT), and the ended sessions (revoked, or idle past
//   JWT_TIME_INVALIDATION - access/session.ts);
// - logs older than LOG_RETENTION_DAYS (at LOG_RETENTION_AT) - every unit
//   (logCleanup.ts), the active WEM and pending proposals kept.
// The time series' raw samples - a TimescaleDB retention policy
// (SAMPLES_RETENTION_DAYS), set at start.

const CHECK_MS = 60_000;
const CATCH_UP_MIN = 60;

interface Job {
  key: string;
  at: () => string; // "HH:MM", "" - never
  run: () => Promise<unknown>;
}

const JOBS: Job[] = [
  {
    key: "maintenance.guests",
    at: () => config.auth.guestCleanupAt,
    run: async () => ({ conversations: await removeOldGuestConversations(), sessions: await removeEndedSessions() }),
  },
  {
    key: "maintenance.log-retention",
    at: () => (config.logRetentionDays > 0 ? config.logRetentionAt : ""),
    run: () => clearLogsOlderThan(config.logRetentionDays),
  },
];

const HHMM = /^(([01]\d|2[0-3]):[0-5]\d|24:00)$/;

async function tick(): Promise<void> {
  for (const job of JOBS) {
    const at = job.at();
    if (!at) continue;
    if (!HHMM.test(at)) {
      logger.warn({ job: job.key, at }, "maintenance time must be HH:MM - the job is skipped");
      continue;
    }
    const last = (await pool.query<{ value: string }>("SELECT value #>> '{}' AS value FROM system_settings WHERE key = $1", [job.key])).rows[0]?.value ?? null;
    const date = dueOccurrence({ repeat: "day", weekday: null, month_day: null, month: null, time: at, last_run_date: last }, Date.now(), CATCH_UP_MIN);
    if (!date) continue;
    // claimed for the date atomically - one run per day
    const claimed = await pool.query(
      `INSERT INTO system_settings (key, value) VALUES ($1, to_jsonb($2::text))
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now() WHERE system_settings.value #>> '{}' IS DISTINCT FROM $2`,
      [job.key, date],
    );
    if (!claimed.rowCount) continue;
    try {
      const result = await job.run();
      logger.info({ job: job.key, date, result }, "maintenance job done");
    } catch (err) {
      logger.error({ err, job: job.key }, "maintenance job failed");
    }
  }
}

/** The time series' raw samples older than SAMPLES_RETENTION_DAYS dropped by TimescaleDB (0 - kept forever). */
async function applySamplesRetention(): Promise<void> {
  await pool.query("SELECT remove_retention_policy('samples', if_exists => true)");
  if (config.samplesRetentionDays > 0) {
    await pool.query("SELECT add_retention_policy('samples', make_interval(days => $1))", [config.samplesRetentionDays]);
  }
}

export function startMaintenance(): void {
  applySamplesRetention().catch((err: unknown) => logger.error({ err }, "the samples retention policy failed"));
  const run = () => tick().catch((err: unknown) => logger.error({ err }, "maintenance check failed"));
  setInterval(run, CHECK_MS);
  void run();
}
