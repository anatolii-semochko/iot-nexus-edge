import type { MigrationBuilder } from "node-pg-migrate";

// The AI calendar's "every N hours" (iot AGENTS_TO_DO.md 2026-10-25, the Energy Ledger's stage D - its
// corrections during the day): repeat "hours" - from `time` every `every_hours` hours to the day's end;
// `last_run_date` then holds the occurrence's "YYYY-MM-DD HH:MM".
export const up = (pgm: MigrationBuilder): void => {
  pgm.addColumns("ai_schedules", { every_hours: { type: "smallint", check: "every_hours BETWEEN 1 AND 12" } });
  pgm.dropConstraint("ai_schedules", "ai_schedules_repeat_check");
  pgm.addConstraint("ai_schedules", "ai_schedules_repeat_check", { check: "repeat IN ('day', 'week', 'month', 'year', 'hours')" });
};

export const down = (pgm: MigrationBuilder): void => {
  pgm.sql("DELETE FROM ai_schedules WHERE repeat = 'hours'");
  pgm.dropConstraint("ai_schedules", "ai_schedules_repeat_check");
  pgm.addConstraint("ai_schedules", "ai_schedules_repeat_check", { check: "repeat IN ('day', 'week', 'month', 'year')" });
  pgm.dropColumns("ai_schedules", ["every_hours"]);
};
