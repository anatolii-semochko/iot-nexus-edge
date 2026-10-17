import type { MigrationBuilder } from "node-pg-migrate";

// Nexus Edge AI Assistant, stage 2 (nexus-edge-aquarium AGENTS_TO_DO.md
// 2026-10-17): the assistant's settings per instance - "nexus-edge" (the
// whole system) or a DNP instance ("process:<id>", a process whose kind a
// DNP's AI manifest covers - ai/manifests.ts):
// - `connection_id` - the AI connection it uses (null - the assistant is
//   off for it);
// - `access` - {read: bool, config / control / install: "off" | "confirm"
//   | "auto", report: bool} (install - the whole system only);
// - `logs` - its conversations logged with the full payload.
// A missing row - the defaults (ai/instances.ts).
export const up = (pgm: MigrationBuilder): void => {
  pgm.createTable("ai_instances", {
    instance_key: { type: "text", primaryKey: true, check: "instance_key = 'nexus-edge' OR instance_key ~ '^process:[0-9]+$'" },
    process_id: { type: "integer", references: "processes", onDelete: "CASCADE" },
    connection_id: { type: "integer", references: "ai_connections", onDelete: "SET NULL" },
    access: { type: "jsonb", notNull: true },
    logs: { type: "boolean", notNull: true, default: true },
    updated_by: { type: "integer", references: "users", onDelete: "SET NULL" },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
};

export const down = (pgm: MigrationBuilder): void => {
  pgm.dropTable("ai_instances");
};
