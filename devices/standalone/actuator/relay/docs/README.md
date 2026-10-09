# Relay

Generic controllable relay - single Bool actuator (on/off).

## Behavior

Single value, `Bool`: true = contact closed (load on). Commanded by a control process (`PUT /devices/:id/auto`), overridable manually (Dual Devices Model).

## Physical mapping (future firmware)

A relay or SSR channel. I2C relay boards are the preferred target (one node drives many relays off two pins) over bare GPIO relays. The node's own fail-safe state for each relay (on loss of the orchestrator) is a property of the node type, documented there. `heater`/`cooler` are older semantic wrappers of the same single Bool actuator.

## Provisioning

Manually wired: a static EdgeX device-list entry (target-project
`extra-res/devices/`) plus a Postgres seed migration, same pattern as
every other device type. No `canId` yet - every instance is virtual
for now (see nexus-edge AGENTS.md section 87, CAN addressing per
instance).
