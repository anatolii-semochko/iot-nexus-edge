# Process Bath (surface treatment)

A process bath of a surface-treatment line (degreasing, etching, anodizing, dyeing, sealing, rinsing): a polypropylene tank with its electric immersion heater and / or a cooling coil, a temperature probe and a level sensor. Driven by the `anodizing-line` process (simulated - the heat balance of the bath).

Added 2026-11-18 for the metal shop's anodizing line (the demo's factory). Off-the-shelf equipment - no
firmware of ours; read over Modbus TCP once the device service has a Modbus transport, `backend: virtual`
(simulated) until then.

## Devices

| Device (type) | Meaning |
|---|---|
| `temperature` | bath temperature, C |
| `level` | filling, % |
| `heater` | the immersion heater on / off |
| `cooler` | the cooling coil's valve open / shut (the anodize bath, from the chiller) |
