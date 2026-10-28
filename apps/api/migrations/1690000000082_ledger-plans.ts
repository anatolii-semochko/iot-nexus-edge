import type { MigrationBuilder } from "node-pg-migrate";

// The Energy Ledger's plan (CORE Library package devices/processes/
// energy-ledger/, L2): the latest plan of each energy-ledger process - the
// slots ahead (the forecast, the prices, the batteries' power, the grid,
// the SoC, the money), its steps and its sums (jsonb, the package's shape).
export const up = (pgm: MigrationBuilder): void => {
  pgm.createTable("ledger_plans", {
    process_id: { type: "integer", primaryKey: true, references: "processes", onDelete: "CASCADE" },
    made_at: { type: "timestamptz", notNull: true },
    data: { type: "jsonb", notNull: true },
  });
};

export const down = (pgm: MigrationBuilder): void => {
  pgm.dropTable("ledger_plans");
};
