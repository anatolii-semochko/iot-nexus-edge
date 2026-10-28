# PV Inverter (string block)

A block of PV modules wired as one string group to its three-phase string inverter - the unit of control on a generation field (many modules, one point to watch and switch). Reference model SMA Sunny Tripower 10.0 (STP10.0-3AV-40: 10 kW AC, up to 15 kWp DC, two MPP trackers, Modbus TCP / SunSpec). Reports its AC power, its yield register and the DC voltage; its operation is switched on / off. Driven by the `energy-field` process (simulated - from the weather forecast's solar radiation).

Added 2026-10-19 for the energy packages. Off-the-shelf equipment - no
firmware of ours; read over Modbus TCP once the device service has a Modbus
transport, `backend: virtual` (simulated) until then.

## Reference model

**SMA Sunny Tripower 10.0** (STP10.0-3AV-40, SMA Solar Technology AG, Germany): 10 kW AC, max. PV generator 15 kWp, 2 MPP trackers, MPP range 320-800 V, max. efficiency 98.3 %, three-phase 230 / 400 V, Modbus TCP (SunSpec), IP65.

- Operating manual: https://files.sma.de/downloads/STP8-10-3AV-40-BE-en-18.pdf

The node type is the readings and the switch, not the brand - any device
giving the same fits.

## Devices

| Device (type) | Meaning |
|---|---|
| `power` | AC power, kW (>= 0) |
| `energy` | yield register, kWh |
| `voltage` | DC (string) voltage, V |
| `relay` | operation on / off |
