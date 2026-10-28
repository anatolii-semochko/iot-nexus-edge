# Voltage

Atomic sensor device - single `Float32` reading, `V`. Added
2026-10-19 (the energy packages - grid phases, DC buses, battery packs).

## Behavior

- Pure sensor - **read-only** for the platform (`capabilities.readOnly:
  true`); it only reports its current reading.
- A `backend: virtual` instance takes its value from `PUT
  /devices/:id/simulate` (the Dev Simulator) or `.../simulate-auto` (a
  simulation process).

## Physical mapping

One measured voltage of a meter, a power analyser, an inverter or a BMS - e.g. one phase of a Janitza UMG 604-PRO at the grid connection, read over Modbus TCP (a Modbus transport is not in the device service yet - virtual until then).

## Used by

`energy-grid` (the three phases at the connection point; EN 50160 - 230 V +-10 %), later the Energy Field's DC buses and battery packs.
