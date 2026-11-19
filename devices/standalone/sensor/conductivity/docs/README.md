# Conductivity

Atomic sensor device - single `Float32` reading, `uS/cm`. Added
2026-11-19 for the metal shop's utilities (the wastewater's pH, the DI
water's conductivity).

## Behavior

- Pure sensor - **read-only** for the platform (`capabilities.readOnly:
  true`); it only reports its current reading.
- A `backend: virtual` instance takes its value from `PUT
  /devices/:id/simulate` (the Dev Simulator) or `.../simulate-auto` (a
  simulation process - the `shop-utilities` process makes the simulated
  utilities' readings).
