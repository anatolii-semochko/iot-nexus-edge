# Buffer Tank (heat storage)

A heating / cooling buffer tank - stratified water heat storage between the heat pumps and the consumers. Reference: Vaillant allSTOR plus (Germany; multifunction buffer 300 - 2000 l, the reference here - 800 l, VPS 800). Reports the water temperature at the top, the middle and the bottom; the stored heat (kWh, %) is computed by the `heating-control` process from them and the tank's volume and useful temperature range.

Added 2026-10-20 for heating / cooling. Off-the-shelf equipment - no
firmware of ours; read over Modbus TCP once the device service has a Modbus
transport, `backend: virtual` (simulated) until then.

## Reference model

**Vaillant allSTOR plus** (Vaillant GmbH, Germany): multifunction buffer tank, 300 - 2000 l (the reference - 800 l, VPS 800/3-5), stratified charging and discharging, high-grade insulation, sensor wells at several heights (figures - the manufacturer's datasheet, rounded).

The node type is the readings and the switches, not the brand - any device
giving the same fits.

## Devices

| Device (type) | Meaning |
|---|---|
| `temperature` | top water temperature, C |
| `temperature` | middle water temperature, C |
| `temperature` | bottom water temperature, C |

All three devices are temperatures - the process takes each by its role from its config (`topTempDeviceId`, `middleTempDeviceId`, `bottomTempDeviceId` - by id, never by name). Stored heat = V x 1.163 Wh/(l K) x (T avg - T min useful), 100 % at T max.
