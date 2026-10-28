# Flow Rate

Atomic sensor device - single `Float32` reading, `l/min`. Added
2026-10-20 (heating / cooling).

## Behavior

- Pure sensor - **read-only** for the platform (`capabilities.readOnly:
  true`); it only reports its current reading.
- A `backend: virtual` instance takes its value from `PUT
  /devices/:id/simulate` (the Dev Simulator) or `.../simulate-auto` (a
  simulation process).

## Physical mapping

The flow sensor of a heat meter or a heat pump's hydraulic module (vortex / ultrasonic), or a circulation pump's own flow estimate.

## Used by

`heating-control` (the circuits' flow; the heat power = flow x 4.18 kJ/(kg K) x the temperature difference).
