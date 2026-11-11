import type { MigrationBuilder } from "node-pg-migrate";

// The heating planner's plan (CORE Library package devices/processes/heating-planner/, iot
// AGENTS_TO_DO.md 2026-10-29, P1): the latest plan of each heating-planner process - for each heating
// system it plans, the slots ahead (the need, the heat pumps' heat and units, the electricity, the
// store, the rooms' offset, the money) and its sums (jsonb, the package's shape).
export const up = (pgm: MigrationBuilder): void => {
  pgm.createTable("heating_plans", {
    process_id: { type: "integer", primaryKey: true, references: "processes", onDelete: "CASCADE" },
    made_at: { type: "timestamptz", notNull: true },
    data: { type: "jsonb", notNull: true },
  });
};

export const down = (pgm: MigrationBuilder): void => {
  pgm.dropTable("heating_plans");
};
