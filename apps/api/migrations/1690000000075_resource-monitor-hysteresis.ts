import type { MigrationBuilder } from "node-pg-migrate";

// Resource Monitor hysteresis (orchestrator resourceMonitor.ts): a raised
// warning / error holds until its metric falls `hysteresis` units (% or C)
// below the threshold - a value hovering at a threshold no longer raises a
// new message on every crossing. 2 for the existing monitors; one set by a
// person is kept.
export const up = (pgm: MigrationBuilder): void => {
  pgm.sql(`
    UPDATE processes
    SET config = config || jsonb_build_object('hysteresis', 2)
    WHERE kind = 'resource-monitor' AND NOT (config ? 'hysteresis')
  `);
};

export const down = (pgm: MigrationBuilder): void => {
  pgm.sql(`
    UPDATE processes
    SET config = config - 'hysteresis'
    WHERE kind = 'resource-monitor'
  `);
};
