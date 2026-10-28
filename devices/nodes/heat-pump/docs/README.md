# Heat Pump (air / water)

An air / water heat pump outdoor unit (monobloc) with its controller. Reference: Vaillant aroTHERM plus (Germany; 12 kW class, natural refrigerant R290, heating and cooling, flow up to 75 C, outdoor -25..+46 C). Reports the flow, return and outdoor temperatures, the water flow, the heat output (+ heating / - cooling) with its counter, the electric power with its counter and the fan speed; switched on / off. Driven by the `heating-control` process (simulated - the COP from the outdoor and the flow temperature).

Added 2026-10-20 for heating / cooling. Off-the-shelf equipment - no
firmware of ours; read over Modbus TCP once the device service has a Modbus
transport, `backend: virtual` (simulated) until then.

## Reference model

**Vaillant aroTHERM plus** (Vaillant GmbH, Germany): air / water monobloc heat pump, outputs 3.5 - 12 kW (the reference here - the 12 kW model, VWL 125/6 A), natural refrigerant R290, inverter compressor, heating and active cooling, flow temperature up to 75 C, outdoor operating range -25..+46 C; Modbus TCP through the system controller's gateway (figures - the manufacturer's datasheet, rounded).

The node type is the readings and the switches, not the brand - any device
giving the same fits.

## Devices

| Device (type) | Meaning |
|---|---|
| `temperature` | flow temperature, C |
| `temperature` | return temperature, C |
| `temperature` | outdoor temperature (the unit's own sensor), C |
| `flow-rate` | water flow, l/min |
| `thermal-power` | heat output, kW (+ heating / - cooling) |
| `thermal-energy` | produced heat counter, kWh |
| `power` | electric power, kW |
| `energy` | electric energy counter, kWh |
| `rotational-speed` | fan speed, rpm |
| `relay` | operation on / off |

Two or three devices share a type (the temperatures) - the process takes each by its role from its config (`flowTempDeviceId`, `returnTempDeviceId`, ... - by id, never by name).
