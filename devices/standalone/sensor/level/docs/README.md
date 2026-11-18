# Level

Atomic sensor device - single `Float32` reading, `%`. Added
2026-11-18 for the metal shop's anodizing line (a bath's level, the hoist's
place along the line).

## Behavior

- Pure sensor - **read-only** for the platform (`capabilities.readOnly:
  true`); it only reports its current reading.
- A `backend: virtual` instance takes its value from `PUT
  /devices/:id/simulate` (the Dev Simulator) or `.../simulate-auto` (a
  simulation process - the `anodizing-line` process makes a simulated
  line's readings).
