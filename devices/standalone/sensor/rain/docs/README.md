# Rain

Atomic sensor device - single `Float32` reading, `%`. Added
2026-10-19 for the "weather-node" outdoor station.

## Behavior

- Pure sensor - **read-only** for the platform (`capabilities.readOnly:
  true`); it only reports its current reading.
- A `backend: virtual` instance takes its value from `PUT
  /devices/:id/simulate` (the Dev Simulator) or `.../simulate-auto` (a
  simulation process - the `weather-control` process makes a simulated
  weather node follow the forecast).

## Physical mapping (future firmware)

Target hardware: a resistive rain plate (FC-37 / YL-83 type) on an ADC input - the wetter the plate, the lower its resistance; the node maps the reading to 0 (dry) - 100 % (fully wet). It tells "raining now", not an amount (no rain gauge).

## Used by

The weather panel and the planners (rain - no sun); a simulated weather node follows the forecast's precipitation.
