# Timed output

Output that turns itself off - a command is an on-window in milliseconds, the node ends it on its own.

## Behavior

Single value, `Uint32` milliseconds - an ON window, not a state:
- writing N > 0 switches the output on for N ms, counted by the node
  from the moment it receives the command; the node switches it off
  itself when the window ends, with or without the orchestrator;
- writing 0 switches it off immediately;
- the node acts on a CHANGE of the value only - re-writing the same
  value does nothing. To start the same window again write 0 first;
  to extend a running window (a lease kept alive by a process),
  alternate between N and N+1.

Used where a lost connection must never leave something running:
a dose of a fertilizer pump ("channel X, N ms"), a fresh-water
valve ("open at most T s"), a CO2 valve held open by a lease.

## Physical mapping (future firmware)

Any switched output (relay, MOSFET, solenoid driver). The window timer runs in firmware.

## Provisioning

Manually wired: a static EdgeX device-list entry (target-project
`extra-res/devices/`) plus a Postgres seed migration, same pattern as
every other device type. No `canId` yet - every instance is virtual
for now (see nexus-edge AGENTS.md section 87, CAN addressing per
instance).
