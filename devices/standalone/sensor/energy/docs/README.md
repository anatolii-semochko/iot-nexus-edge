# Energy

Atomic sensor device - single `Float32` reading, `kWh`. Added
2026-10-19 (the energy packages - energy counters).

## Behavior

- Pure sensor - **read-only** for the platform (`capabilities.readOnly:
  true`); it only reports its current reading.
- A counter: only grows (a meter register); a period's energy is the difference of two readings (the time series' counter kind).
- A `backend: virtual` instance takes its value from `PUT
  /devices/:id/simulate` (the Dev Simulator) or `.../simulate-auto` (a
  simulation process).

## Physical mapping

An energy register of a meter / power analyser (e.g. Janitza UMG 604-PRO import / export registers, Modbus TCP) or of an inverter.

## Used by

`energy-grid` (import and export registers at the connection point), later the Energy Field's generation and consumption counters.
