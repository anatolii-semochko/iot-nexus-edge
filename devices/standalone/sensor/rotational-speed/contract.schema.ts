/**
 * Rotational Speed - atomic sensor, independent library Device type (AGENTS.md
 * section 7/30/32), added 2026-10-19 (the energy packages - wind turbine rotors). Reports its current
 * value, never accepts commands; no forbidden-state rules of its own
 * (safety.yaml).
 */
export const rotationalSpeedContract = {
  deviceType: 'rotational-speed',
  readOnly: true,
  valueType: 'Float32',
  units: 'rpm',
  description: 'Rotational speed',
}
