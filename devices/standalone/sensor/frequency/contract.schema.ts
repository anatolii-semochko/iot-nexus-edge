/**
 * Frequency - atomic sensor, independent library Device type (AGENTS.md
 * section 7/30/32), added 2026-10-19 (the energy packages - the grid frequency). Reports its current
 * value, never accepts commands; no forbidden-state rules of its own
 * (safety.yaml).
 */
export const frequencyContract = {
  deviceType: 'frequency',
  readOnly: true,
  valueType: 'Float32',
  units: 'Hz',
  description: 'Frequency measurement',
}
