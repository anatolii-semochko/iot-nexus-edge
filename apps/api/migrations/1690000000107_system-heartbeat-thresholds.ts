import type { MigrationBuilder } from "node-pg-migrate";

// The platform's own two watchers - Resource Monitor and Heartbeating Control - run heavier ticks than
// the rest (a whole-fleet read each tick) and on a loaded server miss 3-6 ticks now and then: with the
// old default (warning at 3, error at 10) they raised a warning every few minutes that cleared a tick
// later (prod, 2026-11-09: ~570 in 48 h, the longest silence 6 ticks). Warning at 10, error at 30.
// Only rows still holding the old default change - a threshold someone set by hand stays.
const OLD = { stoppable: false, warning: { numberSkippedTicks: 3, level: 1 }, error: { numberSkippedTicks: 10, level: 1 } };
const NEW = { stoppable: false, warning: { numberSkippedTicks: 10, level: 1 }, error: { numberSkippedTicks: 30, level: 1 } };
const KINDS = "('resource-monitor', 'heartbeat-control')";

export const up = (pgm: MigrationBuilder): void => {
  pgm.sql(
    `UPDATE processes SET heartbeat_control = '${JSON.stringify(NEW)}'::jsonb
     WHERE kind IN ${KINDS} AND heartbeat_control = '${JSON.stringify(OLD)}'::jsonb`,
  );
};

export const down = (pgm: MigrationBuilder): void => {
  pgm.sql(
    `UPDATE processes SET heartbeat_control = '${JSON.stringify(OLD)}'::jsonb
     WHERE kind IN ${KINDS} AND heartbeat_control = '${JSON.stringify(NEW)}'::jsonb`,
  );
};
