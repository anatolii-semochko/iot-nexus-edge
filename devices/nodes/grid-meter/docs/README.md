# Grid Meter

The meter at the site's **connection to the public grid** - one three-phase
power analyser that tells what flows in and out. Added 2026-10-19 for the
energy packages (`energy-grid`, the Energy Field, Heating).

## Reference model

**Janitza UMG 604-PRO** (Janitza electronics GmbH, Germany) - a power
quality analyser for switchboards: three phases, accuracy class 0.2S,
Ethernet with Modbus TCP (port 502), Modbus RTU, an embedded web server.

- Datasheet: https://www.janitza.com/files/download/datasheets/UMG-604/janitza-db-umg604pro-en.PDF
- Technical details: https://www.janitza.com/en/products/umg-604-pro/technical-details
- The Modbus address list is published by Janitza with the device documents.

Any meter giving the same readings fits (e.g. a utility smart meter behind
a Smart Meter Gateway via its local interface); the node type is the
readings, not the brand.

## Devices

| Device (type) | Reads |
|---|---|
| `voltage` x3 | L1, L2, L3 phase voltage, V |
| `frequency` | grid frequency, Hz |
| `power` | total active power, kW - **+ import from the grid, - export to it** |
| `energy` x2 | the import and export registers, kWh (only grow) |

## Transport

Modbus TCP - the device service has no Modbus transport yet, so an
instance is `backend: virtual` (EdgeX virtual devices) and, simulated, is
driven by the `energy-grid` process (voltages and frequency around their
nominal values) and the site's balance (the power and the registers - the
Energy Field package).
