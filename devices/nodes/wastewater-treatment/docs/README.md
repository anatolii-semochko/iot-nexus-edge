# Wastewater Treatment (neutralization)

The wastewater neutralization of a surface-treatment shop: a mixed tank taking the rinses' overflow, its pH probe and flow meter, the acid and the caustic dosing pumps. Reports the pH and the flow; its dosing pumps switched on / off. Driven by the `shop-utilities` process (simulated - the rinses' acid drag-out, the dosing).

Added 2026-11-19 for the metal shop's utilities (the demo's factory). Off-the-shelf equipment - no firmware
of ours; read over Modbus TCP once the device service has a Modbus transport, `backend: virtual` (simulated)
until then.

## Devices

| Device (type) | Meaning |
|---|---|
| `ph` | the tank's pH |
| `flow-rate` | the inflow, l/min |
| `relay` | the caustic (NaOH) dosing pump |
| `relay` | the acid (H2SO4) dosing pump |
