/**
 * Conductivity - atomic sensor, independent library Device type (AGENTS.md
 * section 7/30/32), added 2026-11-19 for the metal shop's utilities.
 * Reports its current value, never accepts commands; no forbidden-state
 * rules of its own (safety.yaml).
 */
export const conductivityContract = {
  deviceType: 'conductivity',
  readOnly: true,
  valueType: 'Float32',
  units: 'uS/cm',
  description: 'Conductivity sensor',
}
