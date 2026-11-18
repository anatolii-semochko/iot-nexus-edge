# Thickness

Atomic sensor device - single `Float32` reading, `um` (µm). Added
2026-11-18 for the metal shop's anodizing line (a coating thickness gauge at QC).

## Behavior

- Pure sensor - **read-only** for the platform (`capabilities.readOnly:
  true`); it only reports its current reading.
- A `backend: virtual` instance takes its value from `PUT
  /devices/:id/simulate` (the Dev Simulator) or `.../simulate-auto` (a
  simulation process - the `quality-control` process makes a simulated
  line's readings).
