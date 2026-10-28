# Wind Turbine

A wind turbine (horizontal axis, permanent-magnet generator) with its grid inverter. Reference models: small - Braun Windturbinen ANTARIS 3.5 kW (rotor 3.5 m, rated 3.7 kW at 420 rpm, cut-in 2 m/s, cut-out 15 m/s) and ANTARIS 6.5 kW (rotor 5.3 m); mid-size - Northern Power Systems NPS 100C-24 (95 kW). Reports its power, its yield register and the rotor speed; switched on / off (off - braked). Driven by the `energy-field` process (simulated - the power curve from the forecast's wind speed at the hub height).

Added 2026-10-19 for the energy packages. Off-the-shelf equipment - no
firmware of ours; read over Modbus TCP once the device service has a Modbus
transport, `backend: virtual` (simulated) until then.

## Reference model

**Braun Windturbinen ANTARIS** (BRAUN Windturbinen GmbH, Germany) - 3.5 kW: rotor 3.5 m (9.6 m2), 3 blades, direct drive, permanent-magnet synchronous generator, rated 3.7 kW at 420 rpm, cut-in 2 m/s, cut-out 15 m/s; 6.5 kW: rotor 5.3 m.

- ANTARIS 3.5 kW: https://braun-windturbinen.com/en/products/antaris-small-wind-turbines/antaris-3-5-kw/
- Data: https://en.wind-turbine-models.com/turbines/1945-braun-windturbinen-antaris-3.5kw

**Northern Power Systems NPS 100C-24** (Northern Power Systems, USA; widely installed in Europe for farms and businesses) - rated 95 kW, rotor 24.4 m, 3 blades, direct drive (no gearbox), permanent-magnet generator, variable speed up to 59 rpm, hub heights 30 / 37 m, cut-in 3 m/s, rated at about 12 m/s, cut-out 25 m/s (the manufacturer's datasheet).

The node type is the readings and the switch, not the brand - any device
giving the same fits.

## Devices

| Device (type) | Meaning |
|---|---|
| `power` | power, kW (>= 0) |
| `energy` | yield register, kWh |
| `rotational-speed` | rotor speed, rpm |
| `relay` | operation on / off (off - braked) |
