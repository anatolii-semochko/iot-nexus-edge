# Chemistry and Wastewater

The metal shop's chemistry and wastewater (the demo's factory, 2026-11-19 - the "Chemistry and wastewater" zone of
the shop's plan).

- **The demand:** the line (`lineProcessId`) - each finished bar went through every bath of the recipe: its
  drag-out out of each dosed bath and into the wastewater; the shift (`shift` - `fromH`, `toH`, `days`; default
  weekdays 6-22) - the rinses' overflow (`demand.rinseShiftLMin`, `rinseNightLMin`).
- **Tanks** (`tanks[]` - node type `chemical-tank`, device `level`): `key`, `name`, `capacityL`, `reorderPct` (a
  warning; ordered that day, the simulation's delivery of `lotL` the next morning from 8:00), `criticalPct` (a critical message). The
  metrics - the level, today's litres, the recent rate (a 7-day average) and the days it lasts.
- **Dosing** (`dosing[]` - device `pump`): `bath` (the line's bath by its name), `tank`, `volumeL`, `targetGl`,
  `bandGl`, `concentrateGl`, `pumpLMin`, `dragOutL`. A drag-out takes the solution out (the bath topped up with
  water - the concentration falls); the pump on under the band's bottom, off at its middle; an empty tank stops it.
- **Wastewater** (`wastewater` - node type `wastewater-treatment`, devices `level`, `ph`, `flow`, `sludge`, `pump`,
  `naoh`, `acid`, `press`): the collection tank (`collectionL`; the transfer pump on over `startPct`, off under
  `stopPct`, a warning over `highPct`, the time to full when the inflow beats the pump), the neutralization
  (`neutralL`; the raw water's `inflowPh`, the caustic pump under `lowPh`, the acid one over `highPh`), the
  flocculant (`flocMlPerM3`), the settler (`sludgePerM3L`, `settlerSludgeL`), the filter press (a cycle of
  `pressMin` over `pressAtPct` of the settler; its cloth's pressure drop `dpPerCycleBar` a cycle, a warning over
  `dpLimitBar`), the discharge (the treated flow; its permit pH 6.5-9).
- **Metrics:** the tanks, the dosed baths, the wastewater (with the press's `pressEndAt` for the panel's timer),
  today (m³ treated, the caustic, the flocculant, the press's cycles, the litres dosed); **series**
  `chem.wastewaterPh`, `chem.collectionPct`, `chem.tank.<key>.pct`; **WEM** - a tank under its reorder level
  (warning) or its critical one (critical), the collection tank over its high level, the discharge out of its pH
  limits, the press's cloth over its limit.
