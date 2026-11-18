/**
 * Level - atomic sensor, independent library Device type (AGENTS.md
 * section 7/30/32), added 2026-11-18 for the metal shop's anodizing line.
 * Reports its current value, never accepts commands; no forbidden-state
 * rules of its own (safety.yaml).
 */
export const levelContract = {
  deviceType: 'level',
  readOnly: true,
  valueType: 'Float32',
  units: '%',
  description: 'Level sensor',
}
