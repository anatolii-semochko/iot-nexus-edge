/**
 * Energy - atomic sensor, independent library Device type (AGENTS.md
 * section 7/30/32), added 2026-10-19 (the energy packages - energy counters). Reports its current
 * value, never accepts commands; no forbidden-state rules of its own
 * (safety.yaml).
 */
export const energyContract = {
  deviceType: 'energy',
  readOnly: true,
  valueType: 'Float32',
  units: 'kWh',
  description: 'Energy counter',
}
