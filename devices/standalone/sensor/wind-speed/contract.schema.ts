/**
 * Wind Speed - atomic sensor, independent library Device type (AGENTS.md
 * section 7/30/32), added 2026-10-19 for the "weather-node" outdoor
 * station. Reports its current value, never accepts commands; no
 * forbidden-state rules of its own (safety.yaml).
 */
export const windSpeedContract = {
  deviceType: 'wind-speed',
  readOnly: true,
  valueType: 'Float32',
  units: 'm/s',
  description: 'Wind speed sensor',
}
