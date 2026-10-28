import type { MigrationBuilder } from "node-pg-migrate";

// The Energy Ledger's operational days' notes (iot AGENTS_TO_DO.md 2026-10-25, stage B): what is known about a
// day - today's or one ahead - that the plan and the AI must weigh: a grid outage, a holiday / a day off, a
// working weekend, maintenance (its nodes, its window), anything else. Written automatically (the holidays of
// the configured country - `auto_key`, idempotent), by the AI (its process commands - the Control level) and
// by people (the CRUD). A dismissed automatic note stays dismissed (never re-added by the sync).
export const up = (pgm: MigrationBuilder): void => {
  pgm.createTable("ledger_day_notes", {
    id: "id",
    process_id: { type: "integer", notNull: true, references: "processes", onDelete: "CASCADE" },
    day: { type: "date", notNull: true },
    kind: { type: "text", notNull: true },
    text: { type: "text", notNull: true, default: "" },
    starts_at: { type: "timestamptz" },
    ends_at: { type: "timestamptz" },
    node_ids: { type: "integer[]", notNull: true, default: "{}" },
    source: { type: "text", notNull: true },
    auto_key: { type: "text" },
    dismissed: { type: "boolean", notNull: true, default: false },
    created_by: { type: "integer", references: "users", onDelete: "SET NULL" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.addConstraint("ledger_day_notes", "ledger_day_notes_kind_check", {
    check: "kind IN ('outage', 'holiday', 'day-off', 'workday', 'maintenance', 'other')",
  });
  pgm.addConstraint("ledger_day_notes", "ledger_day_notes_source_check", { check: "source IN ('auto', 'ai', 'user')" });
  pgm.createIndex("ledger_day_notes", ["process_id", "day"]);
  pgm.createIndex("ledger_day_notes", ["process_id", "auto_key"], { unique: true, where: "auto_key IS NOT NULL" });
};

export const down = (pgm: MigrationBuilder): void => {
  pgm.dropTable("ledger_day_notes");
};
