import type { MigrationBuilder } from "node-pg-migrate";

// Resource Monitor hold time (orchestrator resourceMonitor.ts, after 075's
// hysteresis): a raised warning / error clears only after its metric stayed
// below for `holdSeconds` - a CPU temperature swinging by 20 C within seconds
// under load no longer raises a new message on every swing. 60 for the
// existing monitors; one set by a person is kept.
export const up = (pgm: MigrationBuilder): void => {
  pgm.sql(`
    UPDATE processes
    SET config = config || jsonb_build_object('holdSeconds', 60)
    WHERE kind = 'resource-monitor' AND NOT (config ? 'holdSeconds')
  `);
};

export const down = (pgm: MigrationBuilder): void => {
  pgm.sql(`
    UPDATE processes
    SET config = config - 'holdSeconds'
    WHERE kind = 'resource-monitor'
  `);
};
