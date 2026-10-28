# Power

Atomic sensor device - single `Float32` reading, `kW`. Added
2026-10-19 (the energy packages - active power at a measuring point).

## Behavior

- Pure sensor - **read-only** for the platform (`capabilities.readOnly:
  true`); it only reports its current reading.
- Signed by the measuring point's own convention, stated by its consumer (`energy-grid`: + from the grid, - to the grid).
- A `backend: virtual` instance takes its value from `PUT
  /devices/:id/simulate` (the Dev Simulator) or `.../simulate-auto` (a
  simulation process).

## Physical mapping

The total active power of a meter / power analyser / inverter (e.g. Janitza UMG 604-PRO sum of three phases, Modbus TCP).

## Used by

`energy-grid` (the connection point's import / export), later the Energy Field's strings, turbines, battery and consumer.
