# Process Chiller

An air-cooled process chiller: it cools the water / glycol loop of process baths' cooling coils (the anodize bath). Reports the supply and the return temperatures and the electric power; switched on / off. Driven by the `shop-utilities` process (simulated - the heat it takes from the coils, its COP).

Added 2026-11-19 for the metal shop's utilities (the demo's factory). Off-the-shelf equipment - no firmware
of ours; read over Modbus TCP once the device service has a Modbus transport, `backend: virtual` (simulated)
until then.

## Devices

| Device (type) | Meaning |
|---|---|
| `temperature` | supply temperature, C |
| `temperature` | return temperature, C |
| `power` | electric power, kW |
| `relay` | the chiller on / off |
