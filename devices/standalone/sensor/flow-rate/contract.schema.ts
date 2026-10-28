/**
 * Flow Rate - atomic sensor, independent library Device type (AGENTS.md
 * section 7/30/32), added 2026-10-20 (heating / cooling). Reports its
 * current value, never accepts commands; no forbidden-state rules of its
 * own (safety.yaml).
 */
export const flowRateContract = {
  deviceType: 'flow-rate',
  readOnly: true,
  valueType: 'Float32',
  units: 'l/min',
  description: 'Volume flow measurement',
}
