import type { MigrationBuilder } from "node-pg-migrate";

// The operational days' notes for every process (iot AGENTS_TO_DO.md 2026-10-25, "notes by panel"): the
// Energy Ledger's table becomes the core's `day_notes` - each note the process it belongs to (the energy
// field - technical, the ledger - the logic, a heating - its rooms and plant); a heating's `room-closed` added.
export const up = (pgm: MigrationBuilder): void => {
  pgm.renameTable("ledger_day_notes", "day_notes");
  pgm.dropConstraint("day_notes", "ledger_day_notes_kind_check");
  pgm.addConstraint("day_notes", "day_notes_kind_check", {
    check: "kind IN ('outage', 'holiday', 'day-off', 'workday', 'maintenance', 'room-closed', 'other')",
  });
  pgm.renameConstraint("day_notes", "ledger_day_notes_source_check", "day_notes_source_check");
};

export const down = (pgm: MigrationBuilder): void => {
  pgm.sql("DELETE FROM day_notes WHERE kind = 'room-closed'");
  pgm.dropConstraint("day_notes", "day_notes_kind_check");
  pgm.addConstraint("day_notes", "ledger_day_notes_kind_check", { check: "kind IN ('outage', 'holiday', 'day-off', 'workday', 'maintenance', 'other')" });
  pgm.renameConstraint("day_notes", "day_notes_source_check", "ledger_day_notes_source_check");
  pgm.renameTable("day_notes", "ledger_day_notes");
};
