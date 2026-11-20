# Conductivity

Atomic sensor device - single `Float32` reading, `uS/cm`. Added 2026-11-19 for
the metal shop (the wastewater's pH, the DI water's conductivity); the
aquarium's EC sensor since the same day too (its own copy of this type, from
2026-10-09, merged into this one - the EdgeX resource `Conductivity` its devices were
registered with).

## Behavior

- Pure sensor - **read-only** for the platform (`capabilities.readOnly:
  true`); it only reports its current reading.
- A `backend: virtual` instance takes its value from `PUT
  /devices/:id/simulate` (the Dev Simulator) or `.../simulate-auto` (a
  simulation process - the `chem-wastewater`, `shop-utilities` and the
  aquarium's simulation processes make the simulated readings).

## Physical mapping

A two- or four-electrode conductivity cell with its transmitter, temperature-compensated; for the DI water - a low-range cell (µS/cm).
