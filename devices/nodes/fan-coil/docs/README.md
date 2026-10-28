# Fan Coil (wall-mounted)

A wall-mounted hydronic fan coil - a room's heat / cold consumer on the water circuit. Reference: Daikin FWT (wall-mounted, 2-pipe, heating and cooling, 3 fan speeds, about 2 - 5 kW). Reports the room temperature and humidity, the fan's electric power and speed; its valve opens / closes remotely. Driven by the `heating-control` process (simulated - the heat it gives from the water and the room temperatures and the fan speed).

Added 2026-10-20 for heating / cooling. Off-the-shelf equipment - no
firmware of ours; read over Modbus TCP once the device service has a Modbus
transport, `backend: virtual` (simulated) until then.

## Reference model

**Daikin FWT** (Daikin Europe): wall-mounted hydronic fan coil unit, 2-pipe, heating and cooling, 3 fan speeds, capacities about 2 - 5 kW by size, a motorised valve kit for remote on / off (figures - the manufacturer's datasheet, rounded).

The node type is the readings and the switches, not the brand - any device
giving the same fits.

## Devices

| Device (type) | Meaning |
|---|---|
| `temperature` | room temperature, C |
| `humidity` | room humidity, % |
| `relay` | valve open / closed (remote on / off) |
| `power` | fan electric power, kW |
| `rotational-speed` | fan speed, rpm |

Each device type occurs once - the process takes each by its role from its config (by id).
