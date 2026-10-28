# Battery Storage (pack + inverter)

One commercial battery storage unit: a battery pack with its three-phase battery inverter. Reference: TESVOLT TS HV 70 (Germany; 67 kWh, lithium NMC prismatic cells, 1C, up to 98 % battery efficiency, 6,000 cycles) with SMA Sunny Tripower Storage 60 (60 kW AC, DC 575-1000 V, Modbus TCP). Reports the state of charge, the DC voltage and current, the AC power (+ discharge to the site / - charge) and the temperature; its contactor switches it on / off. Driven by the `energy-field` process (the dispatch; simulated - the SoC integrates the power).

Added 2026-10-19 for the energy packages. Off-the-shelf equipment - no
firmware of ours; read over Modbus TCP once the device service has a Modbus
transport, `backend: virtual` (simulated) until then.

## Reference model

**TESVOLT TS HV 70** (TESVOLT AG, Germany): 67 kWh (14 modules) / 76 kWh (16), lithium NMC prismatic (Samsung SDI), 1C, up to 98 % battery efficiency, 6,000 cycles at 1C (100 % DoD, 70 % EoL), -10..50 C; with the **SMA Sunny Tripower Storage 60** battery inverter: 60 kVA AC, DC 575-1000 V.

- TS HV 70 datasheet: https://www.tesvolt.com/_media/05%20SERVICE/03%20Downloads/A-Serie/TS_HV_70/Datenblatt/RD.TI.004.E.ENG_Datasheet_TSHV_v.F.01.pdf
- Sunny Tripower Storage 60 datasheet: https://www.tesvolt.com/_media/05%20SERVICE/03%20Downloads/SMA_STPS_60/STPS60-DS-en-24.pdf

The node type is the readings and the switch, not the brand - any device
giving the same fits.

## Devices

| Device (type) | Meaning |
|---|---|
| `state-of-charge` | state of charge, % |
| `voltage` | DC voltage, V |
| `current` | DC current, A (+ discharge / - charge) |
| `power` | AC power, kW (+ discharge / - charge) |
| `temperature` | pack temperature, C |
| `relay` | contactor on / off |
