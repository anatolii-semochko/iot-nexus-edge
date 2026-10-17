import type { MigrationBuilder } from "node-pg-migrate";

// The AI Assistant's calendar (Nexus Edge AI Assistant, stage 7 - nexus-
// edge-aquarium AGENTS_TO_DO.md 2026-10-17; ai/calendar.ts):
// - `ai_schedules` - a scheduled run of an instance's work type (one the
//   DNP / Nexus Edge declares in `scheduledTypes`): on / off, repeat day /
//   week (`weekday` 0 - Sunday .. 6) / month (`month_day` 1..31 - the last
//   day of a shorter month) / year (`month` 1..12 + `month_day`), the local
//   time "HH:MM"; the last run - its local date (one run per occurrence),
//   when, its conversation, status ok / problem / failed / skipped, what it
//   found.
// - `ai_conversations.schedule_id` / `scheduled` - a run is a conversation
//   started by the "system" user (the orchestrator's clock runs it).
// - `log_messages.link` - an in-app path a message points to (a scheduled
//   run's problem -> its conversation); null - none.
// - The "AI Assistant" process (kind "ai-assistant", permanent, System) -
//   the orchestrator's tick drives the calendar through it, and the runs'
//   problems are its WEM warnings (a watchdog reports under its own id -
//   the Heartbeating Control / Data Logger convention). Config:
//   `problemLevel` - the level of those warnings.
export const up = (pgm: MigrationBuilder): void => {
  pgm.createTable("ai_schedules", {
    id: "id",
    instance_key: { type: "text", notNull: true },
    work_type: { type: "text", notNull: true },
    enabled: { type: "boolean", notNull: true, default: true },
    repeat: { type: "text", notNull: true, check: "repeat IN ('day', 'week', 'month', 'year')" },
    weekday: { type: "smallint", check: "weekday BETWEEN 0 AND 6" },
    month_day: { type: "smallint", check: "month_day BETWEEN 1 AND 31" },
    month: { type: "smallint", check: "month BETWEEN 1 AND 12" },
    time: { type: "text", notNull: true, check: "time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$|^24:00$'" },
    last_run_date: { type: "text" },
    last_run_at: { type: "timestamptz" },
    last_conversation_id: { type: "integer", references: "ai_conversations", onDelete: "SET NULL" },
    last_status: { type: "text", check: "last_status IN ('running', 'ok', 'problem', 'failed', 'skipped')" },
    last_note: { type: "text" },
    created_by: { type: "integer", references: "users", onDelete: "SET NULL" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.createIndex("ai_schedules", "instance_key");

  pgm.addColumns("ai_conversations", {
    schedule_id: { type: "integer", references: "ai_schedules", onDelete: "SET NULL" },
    scheduled: { type: "boolean", notNull: true, default: false },
  });

  pgm.addColumn("log_messages", { link: { type: "text" } });

  pgm.sql(`
    INSERT INTO processes (name, group_id, type, kind, actions, device_id, config)
    VALUES (
      'AI Assistant',
      (SELECT id FROM process_groups WHERE name = 'System'),
      'permanent',
      'ai-assistant',
      ARRAY[]::text[],
      NULL,
      '{"problemLevel": 1}'::jsonb
    )
  `);
};

export const down = (pgm: MigrationBuilder): void => {
  pgm.sql(`DELETE FROM processes WHERE kind = 'ai-assistant'`);
  pgm.dropColumn("log_messages", "link");
  pgm.dropColumns("ai_conversations", ["schedule_id", "scheduled"]);
  pgm.dropTable("ai_schedules");
};
