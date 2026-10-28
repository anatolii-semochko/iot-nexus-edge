/**
 * Voltage - atomic sensor, independent library Device type (AGENTS.md
 * section 7/30/32), added 2026-10-19 (the energy packages - grid phases, DC buses, battery packs). Reports its current
 * value, never accepts commands; no forbidden-state rules of its own
 * (safety.yaml).
 */
export const voltageContract = {
  deviceType: 'voltage',
  readOnly: true,
  valueType: 'Float32',
  units: 'V',
  description: 'Voltage measurement',
}
