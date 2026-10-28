# State of Charge

Atomic sensor device - single `Float32` reading, `%`. Added
2026-10-19 (the energy packages - battery storage).

## Behavior

- Pure sensor - **read-only** for the platform (`capabilities.readOnly:
  true`); it only reports its current reading.
- A `backend: virtual` instance takes its value from `PUT
  /devices/:id/simulate` (the Dev Simulator) or `.../simulate-auto` (a
  simulation process).

## Physical mapping

The SoC a battery management system reports - e.g. a TESVOLT TS HV 70 through its SMA Sunny Tripower Storage 60 inverter (Modbus TCP).

## Used by

`energy-field` (the battery array: dispatch limits - the minimum, the outage reserve, the maximum).
