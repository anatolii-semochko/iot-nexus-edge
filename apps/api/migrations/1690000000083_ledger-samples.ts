import type { MigrationBuilder } from "node-pg-migrate";

// The Energy Ledger's learning (CORE Library package devices/processes/
// energy-ledger/, L4): one sample per 15-minute slot - the plan's forecast
// (PV, wind, consumption) against the slot's actual means, its prices, the
// array's SoC at its start, its local weekday / hour / month (jsonb, the
// package's shape). The forecast's corrections and accuracy, the hindsight
// strategies come from them.
export const up = (pgm: MigrationBuilder): void => {
  pgm.createTable("ledger_samples", {
    process_id: { type: "integer", notNull: true, references: "processes", onDelete: "CASCADE" },
    t: { type: "timestamptz", notNull: true },
    data: { type: "jsonb", notNull: true },
  });
  pgm.addConstraint("ledger_samples", "ledger_samples_pkey", { primaryKey: ["process_id", "t"] });
};

export const down = (pgm: MigrationBuilder): void => {
  pgm.dropTable("ledger_samples");
};
