/**
 * Current - atomic sensor, independent library Device type (AGENTS.md
 * section 7/30/32), added 2026-10-19 (the energy packages - battery and DC currents). Reports its current
 * value, never accepts commands; no forbidden-state rules of its own
 * (safety.yaml).
 */
export const currentContract = {
  deviceType: 'current',
  readOnly: true,
  valueType: 'Float32',
  units: 'A',
  description: 'Current measurement',
}
