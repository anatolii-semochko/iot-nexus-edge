# Wind Speed

Atomic sensor device - single `Float32` reading, `m/s`. Added
2026-10-19 for the "weather-node" outdoor station.

## Behavior

- Pure sensor - **read-only** for the platform (`capabilities.readOnly:
  true`); it only reports its current reading.
- A `backend: virtual` instance takes its value from `PUT
  /devices/:id/simulate` (the Dev Simulator) or `.../simulate-auto` (a
  simulation process - the `weather-control` process makes a simulated
  weather node follow the forecast).

## Physical mapping (future firmware)

Target hardware: a cup anemometer with a reed / Hall pulse output (e.g. the common 3-cup anemometers of the SparkFun / Misol weather kits, ~2.4 km/h per pulse per second); the node counts pulses over a window and reports the mean speed.

## Used by

The energy packages (wind turbines' power from the wind speed) and the weather panel; a simulated weather node follows the forecast.
