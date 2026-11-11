# Rotational Speed

Atomic sensor device - single `Float32` reading, `rpm`. Added
2026-10-19 (the energy packages - wind turbine rotors).

## Behavior

- Pure sensor - **read-only** for the platform (`capabilities.readOnly:
  true`); it only reports its current reading.
- A `backend: virtual` instance takes its value from `PUT
  /devices/:id/simulate` (the Dev Simulator) or `.../simulate-auto` (a
  simulation process).

## Physical mapping

A rotor's speed from a turbine's controller / generator frequency - e.g. a Braun Antaris small wind turbine (rated 420 rpm on the 3.5 kW model).

## Used by

`energy-field` (the wind turbines; the scene spins each rotor at its own speed).
