# Band Saw (bar stock)

An automatic band saw cutting bar stock into blanks for the machining: a feed vise, the blade's drive, its power meter. Reports the electric power and the blade's speed; its cutting switched on / off. Driven by the `machining` process (simulated - the cuts, the blade's wear).

Added 2026-11-19 for the metal shop (the demo's factory). Off-the-shelf equipment - no firmware of ours;
read over Modbus TCP / its controller's interface once the device service has the transport, `backend: virtual`
(simulated) until then.

## Devices

| Device (type) | Meaning |
|---|---|
| `power` | electric power, kW |
| `rotational-speed` | the blade wheel's speed, rpm |
| `relay` | cutting on / off |
