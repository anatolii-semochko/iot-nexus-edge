# Thermal Power

Atomic sensor device - single `Float32` reading, `kW`. Added
2026-10-20 (heating / cooling).

## Behavior

- Pure sensor - **read-only** for the platform (`capabilities.readOnly:
  true`); it only reports its current reading.
- Signed: + heat delivered (heating), - heat taken away (cooling).
- A `backend: virtual` instance takes its value from `PUT
  /devices/:id/simulate` (the Dev Simulator) or `.../simulate-auto` (a
  simulation process).

## Physical mapping

A heat meter (calculator with a flow sensor and a pair of temperature probes - e.g. on the heat pump's flow / return, an M-Bus / Modbus heat meter), or a heat pump controller's own heat output value.

## Used by

`heating-control` (the heat pumps' heat output; the heat flows between the blocks).
