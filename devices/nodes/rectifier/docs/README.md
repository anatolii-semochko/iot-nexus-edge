# Rectifier (anodizing / plating)

A DC rectifier for anodizing or plating: a thyristor or switch-mode power supply, current-controlled, a few thousand amperes at up to 20-30 V. Reports its output voltage and current; switched on / off, its current set by the line. Driven by the `anodizing-line` process (simulated - the bath's voltage from the current density).

Added 2026-11-18 for the metal shop's anodizing line (the demo's factory). Off-the-shelf equipment - no
firmware of ours; read over Modbus TCP once the device service has a Modbus transport, `backend: virtual`
(simulated) until then.

## Devices

| Device (type) | Meaning |
|---|---|
| `voltage` | output voltage, V |
| `current` | output current, A |
| `relay` | output on / off |
