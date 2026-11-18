# Drying Oven (batch)

A batch drying / curing oven of a metal shop: an insulated chamber with its electric heater bank and
circulation fan, a temperature probe in the air stream and the heaters' power meter. Reports the chamber
temperature and the heaters' electric power; its heaters switched on / off. Driven by the `drying-oven`
process (simulated - the chamber's heat balance, the door opened for every load).

Added 2026-11-18 for the metal shop (the demo's factory) - the parts' drying after the anodizing line.
Off-the-shelf equipment - no firmware of ours; read over Modbus TCP once the device service has a Modbus
transport, `backend: virtual` (simulated) until then.

## Devices

| Device (type) | Meaning |
|---|---|
| `temperature` | chamber temperature, C |
| `heater` | the heater bank on / off |
| `power` | the heaters' electric power, kW |
