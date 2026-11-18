# Hoist (line gantry)

An automatic hoist of a surface-treatment line: a gantry carriage running along the baths, lifting the flight bars of parts out of one bath and lowering them into the next. Reports its position along the line; its lift up / down. Driven by the `anodizing-line` process (simulated - travel and lift times).

Added 2026-11-18 for the metal shop's anodizing line (the demo's factory). Off-the-shelf equipment - no
firmware of ours; read over Modbus TCP once the device service has a Modbus transport, `backend: virtual`
(simulated) until then.

## Devices

| Device (type) | Meaning |
|---|---|
| `position` | the carriage's position along the line, mm |
| `relay` | the lift - up (a bar carried) / down |
