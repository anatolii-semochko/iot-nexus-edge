# Frequency

Atomic sensor device - single `Float32` reading, `Hz`. Added
2026-10-19 (the energy packages - the grid frequency).

## Behavior

- Pure sensor - **read-only** for the platform (`capabilities.readOnly:
  true`); it only reports its current reading.
- A `backend: virtual` instance takes its value from `PUT
  /devices/:id/simulate` (the Dev Simulator) or `.../simulate-auto` (a
  simulation process).

## Physical mapping

The grid frequency from a meter / power analyser (e.g. Janitza UMG 604-PRO, Modbus TCP).

## Used by

`energy-grid` (50 Hz +-0.2 Hz in normal operation; outside - a grid disturbance).
