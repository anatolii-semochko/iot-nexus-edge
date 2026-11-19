# CNC Machining Centre

A CNC machining centre (a vertical milling centre with its tool changer) of a job shop: its controller reports the spindle's electric power and speed and whether its cycle runs (its signal tower's green). Driven by the `machining` process (simulated - the programs' cycles, the setups, the tools' life).

Added 2026-11-19 for the metal shop (the demo's factory). Off-the-shelf equipment - no firmware of ours;
read over Modbus TCP / its controller's interface once the device service has the transport, `backend: virtual`
(simulated) until then.

## Devices

| Device (type) | Meaning |
|---|---|
| `power` | spindle and drives' electric power, kW |
| `rotational-speed` | spindle speed, rpm |
| `relay` | the cycle running (the signal tower's green) |
