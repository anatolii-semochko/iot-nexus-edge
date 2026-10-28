# Current

Atomic sensor device - single `Float32` reading, `A`. Added
2026-10-19 (the energy packages - battery and DC currents).

## Behavior

- Pure sensor - **read-only** for the platform (`capabilities.readOnly:
  true`); it only reports its current reading.
- Signed by the measuring point's own convention, stated by its consumer (`energy-field` batteries: + discharge, - charge).
- A `backend: virtual` instance takes its value from `PUT
  /devices/:id/simulate` (the Dev Simulator) or `.../simulate-auto` (a
  simulation process).

## Physical mapping

A battery's DC current from its BMS / inverter, or a current of a meter / power analyser.

## Used by

`energy-field` (the battery packs).
