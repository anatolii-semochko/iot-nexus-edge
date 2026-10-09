/**
 * Timed output - atomic actuator, independent library Device type
 * (AGENTS.md section 7/30/32), added 2026-10-09 (AGENTS_TO_DO.md 2026-10-09, virtual aquarium modules).
 *
 * Output that turns itself off - a command is an on-window in
 * milliseconds, the node ends it on its own.
 */
export const timedOutputContract = {
  deviceType: 'timed-output',
  readOnly: false,
  valueType: 'Uint32',
  units: 'ms',
  description: 'Output that turns itself off - a command is an on-window in milliseconds, the node ends it on its own',
}
