# Air Compressor (screw, with receiver)

A screw air compressor with its air receiver: load / unload control between its pressure band, an idle run-on, then a stop. Reports the receiver pressure and the electric power; switched on / off. Driven by the `shop-utilities` process (simulated - the receiver filled by the compressor, emptied by the shop).

Added 2026-11-19 for the metal shop's utilities (the demo's factory). Off-the-shelf equipment - no firmware
of ours; read over Modbus TCP once the device service has a Modbus transport, `backend: virtual` (simulated)
until then.

## Devices

| Device (type) | Meaning |
|---|---|
| `pressure` | receiver pressure, bar |
| `power` | electric power, kW |
| `relay` | the compressor on / off |
