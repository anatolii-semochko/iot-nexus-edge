# Energy Field (process kind)

CORE Library process kind, loaded automatically in every project
(orchestrator `devices/processes/*/process.ts`, api `.../api.ts`, UI
`.../ui/register.js` - AGENTS.md section 82). A site's **own generation and
storage**: PV blocks, small wind turbines, one battery array and the site's
consumption, balanced against the grid. Depends on `weather-control` (the
forecast) and `energy-grid` (the prices, the limits, the meter). Public; a
project seeds its instance (the nodes and one process).

## Items (the config)

| Config | Node type (reference model) | Params |
|---|---|---|
| `pvBlocks[]` | `pv-inverter` (SMA Sunny Tripower 10.0) | `kWp`, `acKw`, `yieldFactor` (orientation, shading, a roof) |
| `turbines[]` | `wind-turbine` (Braun ANTARIS 3.5 / 6.5 kW) | `ratedKw`, `cutInMs`, `ratedMs`, `cutOutMs`, `ratedRpm`, `hubHeightM` |
| `batteries[]` | `battery-storage` (TESVOLT TS HV 70 + SMA Sunny Tripower Storage 60) | `capacityKwh`, `maxChargeKw`, `maxDischargeKw`, `nominalV` |
| `consumer` | `power-meter` (Janitza UMG 96-PA) | `profile` - `baseKw`, `weekdayPeakKw`, `weekendPeakKw`, `workFrom`, `workTo` |
| `loadProcessIds` | - | processes whose electricity is part of the site's consumption - their metrics' `electricKw` added to a simulated consumer's profile (e.g. `heating-control`) |
| `ledgerProcessId` | - | the `energy-ledger` whose plan Auto follows - its slot's battery power (discharge above the reserve, within the array's limits); no fresh plan - the rules on the prices |
| `simulation.pvLosses` | - | a simulated fault the forecast doesn't know: PV block nodeId -> the share it really gives (e.g. 0.78 - soiled); the learning and the AI's anomalies find it. Each block / turbine's `todayKwh` is in the metrics |
| `consumer.subMeters` | `power-meter` (Janitza UMG 96-PA) | the rooms' / areas' meters: `nodeId`, `name`, `share` (a simulated one - its share of the profile's consumption), `withLoads` (plus the loadProcessIds' electricity - e.g. the heating plant's room: `true` - all of them, or a list of their process ids), `of` (a main meter - a building's - summing those sub-meters' node ids on top); metrics `subMeters[]` - kW, `todayKwh`, `todayEur`; series `field.meter.<nodeId>.kw`; Dashboard component `energyField.meter` (`params.nodeId`) |

Each item: `nodeId`, `name`, `group` (one level - `groups: [{ key, name }]`).
Its devices are found by type on its node (GET /devices). One consumer - the
distribution over buildings is a later package's.

## The run (every `simulation.intervalSeconds`, default 30)

1. The items' readings. A **simulated** item (its node Simulated) gets them
   from the models (`model.ts`):
   - PV: radiation x kWp x performance ratio 0.86 x the temperature
     coefficient (-0.4 %/C over 25 C of the cells, the cells warmer than the
     air with the sun), x `yieldFactor`, capped by the inverter's AC power;
   - wind: the forecast's 10 m wind at the hub (power law, 0.2), each turbine
     with its own slow gusts (+-25 %), the cubic power curve between cut-in
     and the rated wind, braked over cut-out ("storm"); rpm with the wind;
   - consumption: the profile - base at night and on closed days, the peak
     in working hours (an hour's ramps, a lunch dip on working days), the
     weekend's own peak; +-3 % noise.
2. The **dispatch** of the battery array (`dispatch`), the strategy's mode:
   - `auto` - rules on the energy-grid's prices (the slot's rank among the
     next 24 h): a surplus is stored, the rest sold; a deficit covered from
     the batteries above the outage reserve; a cheap quarter of the day -
     the site buys and (`gridChargeAllowed`) the batteries charge from the
     grid; a dear quarter - the surplus and the stored energy above the
     reserve are sold (`exportAllowed`). The coming planner (energy-ledger)
     will set the day's targets instead;
   - `manual` - the battery power the operator set (`manualBatteryKw`, +
     discharge / - charge);
   - `island` - no grid: the batteries balance; not covered - shed (an
     error), surplus - held back.
   Always within SoC `socMinPct`..`socMaxPct` and the connection's limits
   (the grid process's `limits`): over the export limit - less discharge,
   more charge, then the PV held back (curtailed); over the import limit -
   more discharge. The array's power is split over the enabled units by
   their headroom; a simulated unit's SoC follows (97 % one-way efficiency),
   its DC voltage / current / temperature with it.
3. The site's balance (`gridKw` - + import / - export) is written to the
   grid meter's power device; energy-grid integrates its registers and
   prices it.
4. The items' switches (`relay`, AUTO) follow `disabled`.
5. WEM: load shed (island) - error, critical; batteries below the reserve,
   a turbine braked by a storm, generation held back, no forecast -
   warnings.
6. Metrics: `mode`, `decision` (why - for people and the AI), `strategy`,
   `totals` (pvKw, windKw, loadKw, batteryKw, gridKw, curtailedKw, shedKw,
   socPct), `price` (now, rank), `weather`, `groups`, `pv[]`, `wind[]`,
   `batteries[]`, `consumer`, `today` (kWh of each flow, self-sufficiency
   %); time series `field.pvKw`, `windKw`, `loadKw`, `batteryKw`, `gridKw`,
   `socPct` (5-minute means).

## Commands (POST /processes/:id/commands - processes.control)

`setMode {mode}`, `setManualPower {kw}`, `setExport {allowed}`,
`setReserve {pct}`, `setEnabled {nodeId, enabled}` - each patches the
config (kept) and takes effect at once.

With an Energy Ledger linked (`ledgerProcessId`) the reserve and selling
switches are the Ledger's operating parameters - the scene sends them to
it (`setOperating`, `replan`) with a day note. Control on the field is
enough: the manifest's `access.linked` (library.json) opens those Ledger
commands and its day notes to whoever operates the field, nothing else of
the Ledger (nexus-edge AGENTS.md, "A linked process's commands").

## API, AI

- The config schema (`api.ts`) - config edits and command patches checked.
- AI tool `energy.field` - the state now (`items: true` - every block /
  turbine / battery). Changes - the commands, through the control proposal.

## UI

- **The scene** - Dashboard component `energyField.scene` ("Energy";
  `ui/EnergyFieldScene.jsx`, the user's mockup images/AQUARIUM V16-V19.png
  and the reviewed one 2026-10-19): the sun's and the wind's widgets
  (weather-control's shared `SunWidget` / `WindWidget` - the figures now,
  the last day and the next as a curve, a click - the detailed charts); the
  generation by groups - every PV block and turbine with its power over it
  (its rotor turning at its own speed slowed x6), off grey, a storm amber; the icons' size by their count, the rows wrapping
  by the width; the grid (phases, frequency, buy / sell, the zone; the
  voltage sign pink / red blinking / grey; the tariff's gauge - one
  segment per tariff zone, the needle in the zone now, the prices in its
  tooltip) -> the control block -> the consumer (the row stacks on a narrow
  scene); the battery array (each tile: its power, the current's triple
  arrows - red over the limit - and the battery with its % and kWh inside,
  the fill green / yellow / red, a small pink bolt while charging). The
  flows: three chevrons running the way the energy goes, faster with more
  power, a slow pulse; no power - three still grey dots. Three colours only
  (2026-10-25): orange - against us (import, supply, discharge), green - for
  us (generation, export, charge), light grey - no flow; the figure and its
  word in the same colour. The AI's mark before the scene's title. Red -
  a critical state (`alerts.ts`, the metrics' `alerts`, config `alerts`):
  the import at the connection's limit / over the ledger's peak limit / well
  over the plan's, the consumption well over the plan's, a unit over its
  rating (the reason in the tooltip). The blocks'
  summary lines (Generation, Batteries) - the core's `SummaryLine`.
- **The control block**: the mode (Auto / Manual / Island), the
  decision, the next 24 hours' prices (cheap - charge, dear - sell, now),
  today (generated, bought, sold, the balance in EUR, self-sufficiency),
  "Grid connected" (Island), "Selling allowed", the outage reserve - the
  process's commands (processes.control).
- **Popups**: every device - its readings, today's chart (the field's
  series; the batteries - SoC and power), "In operation" (`setEnabled`);
  the grid, the consumer.
- **Settings** (the engineer's - Processes -> Settings,
  `ui/EnergyFieldSettingsSection.jsx`): the groups (one level, generation
  or batteries) and the units' assignment, the batteries' hard band, the
  critical states' thresholds. The scene groups the units by them - none
  used: all together; some: by groups, the rest in "Other".
- **The reserve and selling** belong to the Energy Ledger (`ledgerProcessId`):
  the scene's switches ask "Adapt the plan?" and send the ledger's
  `setOperating` (/ `replan`); the field reads the ledger's values over its
  own; its `setExport` / `setReserve` are passed on to the ledger.
- **Card picture** (`ui/EnergyFieldAvatar.jsx`, the avatar "summary"):
  grid, batteries, wind, consumer, sun, today's balance - the state in the
  colour, the bolt while charging, the turbines at their mean speed.
- Light and dark themes (CSS variables in `ui/fieldIcons.jsx`), reduced
  motion respected. Rubber: container queries stack the middle row and
  the weather blocks when narrow.
- **The process panel** (`ui/EnergyFieldPanel.jsx`) - the engineer's view:
  the mode, manual power, export, totals, today, the battery table, the
  groups' items with their switches.

## Flows: states, details, limits; temporary changes (2026-10-25)

- Each main flow has its state on hover (what flows, at what price, for or
  against us, an error / a warning with the reason) and opens its details
  on a click: the grid (left), the consumption (right), the generation (top
  - a new popup: PV and wind now, today, held back; PV and wind charts; a
  composite icon), the batteries together (bottom - charge, power, today in
  / out; the array's charge and power charts).
- Critical states have two levels (`alerts.ts`): red - an error (the
  connection's limit, the ledger's peak limit, a unit over its rating),
  yellow - a warning (the import / the consumption well over the plan).
  The grid's and the consumption's charts draw them as light dashed lines
  (`SeriesChart` `limits`; `ui/useFlowLimits.js`): red - the import /
  export limits and the peak limit (one far above the day's values named at
  the edge), yellow - the plan's expected import / consumption plus the
  tolerance over the day (the ledger's samples and plan).
- An operating change on the scene (the reserve, selling, the grid
  connection) asks Why (optional) and For (until changed / 20 min / 1 h / 4
  h / to the day's end / other - a number and min or hours) and whether to
  adapt the plan. The reason goes with the command (the command log) and to
  a day note of the process (the AI reads it); For - the process itself
  puts the previous value back at the time (`reverts` in its config: the
  ledger for the reserve / selling, the field for its mode), no AI needed.

