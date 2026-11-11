# Thermal Energy

Atomic sensor device - single `Float32` reading, `kWh`. Added
2026-10-20 (heating / cooling).

## Behavior

- Pure sensor - **read-only** for the platform (`capabilities.readOnly:
  true`); it only reports its current reading.
- A counter: never decreases (a reset - a new meter).
- A `backend: virtual` instance takes its value from `PUT
  /devices/:id/simulate` (the Dev Simulator) or `.../simulate-auto` (a
  simulation process).

## Physical mapping

The energy register of a heat meter (MID heat meter on a heat pump's or a building circuit's flow / return), or a heat pump controller's produced-heat counter.

## Used by

`heating-control` (produced / consumed heat - the Energy Ledger's heat account).
