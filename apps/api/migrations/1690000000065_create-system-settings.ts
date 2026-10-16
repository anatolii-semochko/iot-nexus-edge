import type { MigrationBuilder } from "node-pg-migrate";

// System-wide settings a person changes in the UI (nexus-edge-aquarium
// AGENTS_TO_DO.md 2026-10-16, tech debt 11): one row per key, a JSON value,
// who / when. The first: `dnp.migrations.apply` - "auto" (a project's
// pending migrations are applied when the api starts) or "confirm" (they
// wait for a person - Service -> Database -> Migrations).
// Also `library_items.version` - a DNP's version from its library.json
// (optional; GET /dnp shows it, "0" when unset).
export const up = (pgm: MigrationBuilder): void => {
  pgm.addColumn("library_items", { version: { type: "text" } });
  pgm.createTable("system_settings", {
    key: { type: "text", primaryKey: true },
    value: { type: "jsonb", notNull: true },
    updated_by: { type: "integer", references: "users", onDelete: "SET NULL" },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
};

export const down = (pgm: MigrationBuilder): void => {
  pgm.dropColumn("library_items", "version");
  pgm.dropTable("system_settings");
};
