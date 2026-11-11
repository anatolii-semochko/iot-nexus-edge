import type { MigrationBuilder } from "node-pg-migrate";

// The Energy Ledger's journal (CORE Library package
// devices/processes/energy-ledger/): one row per energy-ledger process and
// local day - the day's energy, money and baselines, the weather, the
// strategy, the AI's summary (jsonb, the package's shape); `partial` - the
// ledger started after the day began; `final` - the day closed.
export const up = (pgm: MigrationBuilder): void => {
  pgm.createTable("ledger_days", {
    process_id: { type: "integer", notNull: true, references: "processes", onDelete: "CASCADE" },
    day: { type: "date", notNull: true },
    data: { type: "jsonb", notNull: true },
    partial: { type: "boolean", notNull: true, default: false },
    final: { type: "boolean", notNull: true, default: false },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.addConstraint("ledger_days", "ledger_days_pkey", { primaryKey: ["process_id", "day"] });
};

export const down = (pgm: MigrationBuilder): void => {
  pgm.dropTable("ledger_days");
};
