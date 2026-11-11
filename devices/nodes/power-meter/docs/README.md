# Power Meter

A three-phase power meter on a feeder - what a consumer (a building, a distribution board, the whole site) draws. Reference model Janitza UMG 96-PA (Janitza electronics GmbH, Germany; Modbus RTU, Ethernet / Modbus TCP option, a MID-certified variant for billing). Reports the active power and the energy register. In `energy-field` - the site's consumption (simulated - a consumption profile by the time of day and the weekday).

Added 2026-10-19 for the energy packages. Off-the-shelf equipment - no
firmware of ours; read over Modbus TCP once the device service has a Modbus
transport, `backend: virtual` (simulated) until then.

## Reference model

**Janitza UMG 96-PA** (Janitza electronics GmbH, Germany): three-phase power analyser for 96 x 96 mm panels, Modbus RTU (RS-485, up to 115 kbps), Ethernet modules, MID variants (UMG 96-PA-MID) for billing.

- User manual: https://www.manualslib.com/manual/1435399/Janitza-Umg-96-Pa.html
- Manual (Janitza): https://assets.janitza.com/ce18jq9ih0x6/0c5a496d4d065c49f6fb49/a3cae3ba5bf941ada63160681ddc5112/janitza-bhb-umg96pa-fw1-en.pdf

The node type is the readings and the switch, not the brand - any device
giving the same fits.

## Devices

| Device (type) | Meaning |
|---|---|
| `power` | active power, kW (>= 0) |
| `energy` | energy register, kWh |
