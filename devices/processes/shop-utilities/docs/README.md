# Shop Utilities

The metal shop's utilities (the demo's factory, 2026-11-19, step 6).

- **The demand:** the shift (`shift` - `fromH`, `toH`, `days`; default weekdays 6-22) sets the compressed air's
  demand (`demand.airShiftM3Min` wandering over the shift, `airNightM3Min` - the leaks), the rinses' inflow to the
  wastewater and the DI water drawn; the line (`lineProcessId`) - its cooling coils' heat (`coolingKw`) for the
  chiller, each finished bar a drag-out into the wastewater and a DI make-up.
- **Compressed air** (`compressor` - node type `air-compressor`): loaded below `loadBar`, unloaded above
  `unloadBar`, off after `idleMin` unloaded; the receiver (`receiverM3`) filled by `fadM3Min`, emptied by the demand.
- **Chiller** (`chiller` - `process-chiller`): runs on the shift or while the coils cool; the return over the supply
  by the load, its electricity - the load over its COP plus its pumps and fans.
- **Wastewater** (`wastewater` - `wastewater-treatment`): the inflow mixes the tank towards the rinses' pH, a bar's
  drag-out drops it; the caustic pump on under `lowPh`, the acid one over `highPh`.
- **DI water** (`di` - `di-water`): the conductivity grows with the water drawn; over `limitUScm` the other column
  takes over, this one regenerates `regenMin`.
- **Metrics:** each unit's state, today (kWh of the compressor and the chiller, the caustic dosed, the DI water);
  **series** `util.airBar`, `util.wastewaterPh`, `util.chillerKw`, `util.powerKw`; **WEM** - the air under its band,
  the wastewater out of its discharge limits (pH 6.5-9), the DI water over its limit.
