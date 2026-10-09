/**
 * Relay - atomic actuator, independent library Device type
 * (AGENTS.md section 7/30/32), added 2026-10-09 (AGENTS_TO_DO.md 2026-10-09, virtual aquarium modules).
 *
 * Generic controllable relay - single Bool actuator (on/off).
 */
export const relayContract = {
  deviceType: 'relay',
  readOnly: false,
  valueType: 'Bool',
  description: 'Generic controllable relay - single Bool actuator (on/off)',
}
