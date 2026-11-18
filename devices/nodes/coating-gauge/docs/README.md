# Coating Thickness Gauge

A coating thickness gauge at a QC station: an eddy-current probe for anodic coatings on aluminium
(non-conductive coatings on a non-ferrous base), its readings over a network interface. Reports each measured
point's thickness in µm. Driven by the `quality-control` process (simulated - the points around the batch's
coating).

Added 2026-11-18 for the metal shop (the demo's factory). Off-the-shelf equipment - no firmware of ours;
`backend: virtual` (simulated) until the device service has its transport.

## Devices

| Device (type) | Meaning |
|---|---|
| `thickness` | the last measured point, µm |
