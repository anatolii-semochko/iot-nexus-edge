# Chemical Tank (with a dosing pump)

A concentrate's storage tank of a surface-treatment shop (an IBC of sulphuric acid, caustic soda, a degreaser, a dye or a sealing additive): its level probe and the dosing pump that feeds a bath from it. Reports the level; its dosing pump switched on / off. Driven by the `chem-wastewater` process (simulated - the baths' drag-out, the dosing, the deliveries).

Added 2026-11-19 for the metal shop's "Chemistry and wastewater" zone (the demo's factory). Off-the-shelf
equipment - no firmware of ours; read over Modbus TCP once the device service has a Modbus transport,
`backend: virtual` (simulated) until then.

## Devices

| Device (type) | Meaning |
|---|---|
| `level` | the tank's level, % |
| `relay` | the dosing pump into its bath |
