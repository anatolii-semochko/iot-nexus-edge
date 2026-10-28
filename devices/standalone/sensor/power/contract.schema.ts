/**
 * Power - atomic sensor, independent library Device type (AGENTS.md
 * section 7/30/32), added 2026-10-19 (the energy packages - active power at a measuring point). Reports its current
 * value, never accepts commands; no forbidden-state rules of its own
 * (safety.yaml).
 */
export const powerContract = {
  deviceType: 'power',
  readOnly: true,
  valueType: 'Float32',
  units: 'kW',
  description: 'Active power measurement',
}
