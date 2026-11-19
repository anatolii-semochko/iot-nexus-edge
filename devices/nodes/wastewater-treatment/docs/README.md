# Wastewater Treatment

The wastewater treatment of a surface-treatment shop: the collection tank taking the rinses' overflow (its level, the transfer pump), the neutralization (its pH probe, the acid and the caustic dosing pumps), the settler (its sludge level), the filter press, the discharge's flow meter. Reports the levels, the pH and the flow; its pumps and the press switched on / off. Driven by the `chem-wastewater` process (simulated - the rinses' acid drag-out, the dosing, the sludge).

Added 2026-11-19 for the metal shop's utilities (the demo's factory); the whole treatment line since the "Chemistry
and wastewater" zone (2026-11-19, `chem-wastewater`). Off-the-shelf equipment - no firmware
of ours; read over Modbus TCP once the device service has a Modbus transport, `backend: virtual` (simulated)
until then.

## Devices

| Device (type) | Meaning |
|---|---|
| `level` | the collection tank's level, % |
| `relay` | the transfer pump (the collection tank into the treatment) |
| `ph` | the neutralization's pH |
| `relay` | the caustic (NaOH) dosing pump |
| `relay` | the acid (H2SO4) dosing pump |
| `level` | the settler's sludge, % |
| `relay` | the filter press |
| `flow-rate` | the discharge, l/min |
