# DI Water (ion exchange)

A deionized water unit of a surface-treatment line: two ion-exchange columns feeding the final rinse and the make-up of the baths, its conductivity probe; regenerated when the conductivity rises. Reports the conductivity; its regeneration switched on / off. Driven by the `shop-utilities` process (simulated - the columns loaded by the water drawn, the regeneration).

Added 2026-11-19 for the metal shop's utilities (the demo's factory). Off-the-shelf equipment - no firmware
of ours; read over Modbus TCP once the device service has a Modbus transport, `backend: virtual` (simulated)
until then.

## Devices

| Device (type) | Meaning |
|---|---|
| `conductivity` | the DI water's conductivity, µS/cm |
| `relay` | the regeneration on / off |
