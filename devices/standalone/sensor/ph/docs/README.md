# pH

Atomic sensor device - single `Float32` reading, `pH`. Added 2026-11-19 for
the metal shop (the wastewater's pH, the DI water's conductivity); the
aquarium's pH sensor since the same day too (its own copy of this type, from
2026-10-09, merged into this one - the EdgeX resource `PH` its devices were
registered with).

## Behavior

- Pure sensor - **read-only** for the platform (`capabilities.readOnly:
  true`); it only reports its current reading.
- A `backend: virtual` instance takes its value from `PUT
  /devices/:id/simulate` (the Dev Simulator) or `.../simulate-auto` (a
  simulation process - the `chem-wastewater`, `shop-utilities` and the
  aquarium's simulation processes make the simulated readings).

## Physical mapping

A glass pH electrode with an isolated pH interface board, temperature-compensated by its own temperature probe when present; for the wastewater - an industrial digital pH sensor (e.g. Modbus).
