# Energy Ledger (process kind)

CORE Library process kind, loaded automatically in every project
(orchestrator `devices/processes/*/process.ts`, api `.../api.ts`, UI
`.../ui/register.js` - AGENTS.md section 82). The site's **energy and money
journal**, what the system saves, and **the batteries' plan**. Reads
`energy-field`, `energy-grid`, `heating-control` and `weather-control`.
L1 (the journal) 2026-10-20, L2 (the plan), L3 (the
strategies, L4 (the learning), L5 (the AI's daily report) 2026-10-21; the
day's review 2026-10-25.

## Config

`fieldProcessId`, `gridProcessId`, `heatingProcessIds[]`, `timeZone`,
`intervalSeconds` (60), `saveMinutes` (5 - how often the day goes to the
journal), `accounts[]` (the cost accounts, below).

## The run

1. The sources' "today" counters - the field (consumption, PV, wind,
   charge / discharge, curtailed), the grid (import, export, cost,
   revenue), the heatings (their electricity, the rooms' heat, the
   baselines); the day grows by their increments since the last run (a
   counter that went down - its source's new day), so every figure covers
   the same time; a ledger started mid-day marks the day `partial`. A
   source without its "today" for this date now (the API just restarted -
   no metrics yet) keeps its last counters this run - never a false new day
   that would count its whole day again.
2. Its own integral: the whole consumption x the slot's purchase price
   ("all bought" - the baseline); the weather (sun kWh/m², wind average /
   max, temperature min / max); the peak import.
3. The day goes to the journal (`ledger_days`, migration 081 - PUT
   `/energy-ledger/:id/days/:day`, internal service only) every
   `saveMinutes` and when it closes (`final`).
4. Metrics: today's record, the bridge, the KPIs.

## The savings bridge (`ledger.ts`, pure)

Without the system (the consumption without the heating bought at the
slots' prices + the rooms' heat by direct electric heating) - **heat pumps**
(direct electric heating - heat pumps without tanks) - **heat storage**
(without tanks - the heating's real electricity at the slots' prices) -
**own energy** (all bought - the grid's cost: PV, wind, batteries) -
**sales** (the grid's revenue) = **paid** (cost - revenue). The EUR steps
sum exactly; the kWh steps too (paid - import less export). KPIs: saved
EUR / %, self-sufficiency, own use of the generation, battery cycles,
average purchase price.

## The plan (L2 - `forecast.ts`, `plan.ts`, pure)

- The slots - from now to the last priced day-ahead slot (15 minutes; the
  first one from now to its end): the prices (energy-grid), the generation
  - the field's own models (`pvPower`, `turbinePower` at the hub) on the
  weather forecast, the enabled units; the consumption - the field's
  profile plus the heating's electricity (`kwPerK` x the kelvins under 18 C
  outside - learnt from the last 14 recorded days' heating electricity over
  their degree-hours).
- The optimiser - dynamic programming over the array's SoC (1 % steps):
  each slot's purchases less sales plus the wear (`wearCtKwh`, 3 ct per kWh
  discharged), the one-way efficiency, the SoC band (the field's strategy:
  `socMinPct` / reserve .. `socMaxPct`), charging from the grid only when
  allowed, the connection's limits (over the import limit - never), a
  negative sale price - the surplus held back; the energy left at the end
  valued at the horizon's median purchase price. ~200 slots in ~15 ms.
- Re-made (`plan` in the config): none yet, every `intradayMinutes` (60),
  on new day-ahead prices (the horizon grew), when the SoC drifted over
  `deviationPct` (10) from the plan's; stored in `ledger_plans` (migration
  082 - PUT / GET `/energy-ledger/:id/plan`).
- The metrics' `planNow` (the slot now) - the energy field's Auto follows
  it (`ledgerProcessId` - its battery power within the array's limits,
  discharge above the reserve); `plan` - the sums and the next steps
  (`planSteps` - charge / discharge / hold runs, a pause up to 30 min
  between two runs of one action merged).

## Strategies (L3 - `strategies.ts`, pure)

Each shapes what the optimiser sees; every strategy's plan is valued in
the real money for the same hours (the cards):
- `cost` - least money (the plan as above);
- `selfSufficiency` - every grid kWh equally dear, sales worth nothing, no
  charging from the grid;
- `reserve` - the floor at `reserveHighPct` (80), under it weighs 50 ct per
  missing kWh and hour - the array climbs there and stays;
- `peakShaving` - the import over `peakLimitKw` costs `peakPenaltyCtKwh`
  (200) more per kWh (a business's capacity charge); offered only with a
  limit set;
- `sales` - a sale under `sellThresholdCt` (15) worth nothing.
The floor is soft in every strategy (2 ct per missing kWh and hour - an
array left under the reserve by an outage climbs back when that's cheap).

`strategy.selection`: `fixed`, or `propose` - on new day-ahead prices the
strategy the forecast finds cheaper by over `minGainEur` (1) is proposed
(`POST .../strategy-proposal` -> the core's `proposeConfig`) under the
ledger's AI instance: its Config level is the permission - Auto applies it
at once, Confirm makes a card (Logs -> AI Proposals) to accept, Off - none.
Commands `setStrategy { key }`, `setSelection { selection }`
(processes.control) - the plan re-made at once; `setOperating {
reservePct?, exportAllowed?, gridChargeAllowed?, replan }` (the energy scene's
switches), `replan`.

## The learning (L4 - `learning.ts`, pure)

- A sample per 15-minute slot (`ledger_samples`, migration 083 - PUT / GET
  `.../samples`): the plan's forecast PV, wind and consumption against the
  slot's actual means, the prices, the SoC at its start, the local weekday /
  hour / month.
- The corrections (from the last 4 weeks, applied by the forecast): the PV
  factor - this month's actual / forecast (else all months'), the wind
  factor, the consumption by weekday and hour (the mean difference, from 2
  samples a cell) - 0.5..1.5 for the factors.
- The day's record: `accuracy` (generation / consumption: 1 - the error over
  the actual energy), `strategy` (the one it ran), `hindsight` (when the day
  closes - every strategy planned on the day as it was, from its first SoC:
  their money, the best one).
- The samples carry the array's actual power (`batA`, since 2026-10-25) -
  the day as it ran valued in the plan's money (the review below).
- `selection` "propose": a strategy best in hindsight on 60 % of at least 5
  recent days is proposed first; else the forecast's comparison.
- Shown: the Plan view's "What the ledger learnt" (today's accuracy, the PV
  / wind corrections, the largest consumption corrections), the day's
  accuracy and strategy / hindsight in the Journal, the month's table.

## The day's review (`review.ts`, pure - 2026-10-25)

When a day closes, without the AI (the system decides on its own): every
strategy planned on the day as it really was (a perfect forecast) from its
first SoC, in the plan's money, the energy left in the batteries at the end
valued at the day's median purchase price; the day as it ran the same way
(the samples' `batA`). **Could have saved** (`regretEur`) = as it ran - the
best; split into **the forecast's part** (as it ran - the strategy it ran
with a perfect forecast; the plan's execution too) and **the strategy's
part** (that one - the best). The forecast's PV / wind / consumption kWh
against the actual; the parameters on the best strategy - a reserve 10
points lower (not under the field's `socMinPct`), charging from the grid if
it is off - each over `strategy.minGainEur`; the recommendation (the
strategy, the parameters, the reasons in words). The day's record also
gets `dayType` (weekday, working) and `prices` (min / avg / max / spread,
the average sale) on every save; `hindsight` is the review's figures. Shown
in the Journal's day ("What the day could have done better"); the AI's
`ledger.history` (`days: true`) and the daily report explain it.

## The operational days' notes (`notes.ts`, pure - 2026-10-25)

What is known about a day - today or ahead - that the plan weighs: the core's
`day_notes` (migration 088 -> 090; api `dayNotes.ts`), each note of the
process it belongs to - every panel its own: the energy field's technical
ones (`outage` - no grid in its window: the plan's slots island, the
batteries charged ahead, the reserve theirs to use down to the field's
`socMinPct`, what can't be carried shed at 10 EUR/kWh; `maintenance` - its
nodes out in its window: their PV / wind none, the batteries' power less by
their share), this ledger's logic (`holiday` / `day-off` - the consumption
by the profile's day off; `workday` - a working weekend's as a working
day's) and its heatings' (`maintenance`, `room-closed` - for the heating's
own logic later). `other` anywhere. No window - the whole local day. The
plan reads its own, its field's and its heatings' (GET `.../notes` - the
three together, with `summary`); a change re-plans ("the day's notes
changed"); the day's type (`dayTypeOf`) goes to the record and the metrics.

Who writes them: the ledger itself - the public holidays of `calendar`
(`country` ISO 3166, `region`; `aheadDays` 14) once a day (POST
`.../notes/sync`, idempotent; a dismissed one stays dismissed, an edited one
is the editor's); people - each panel's block (`DayNotes`, the core's
`/processes/:id/day-notes`, processes.control): the Energy scene "The plant
today", the Ledger "Today's operation" (with the day's type and the day's
description in words), a heating "The heating today"; the AI - the core's
`daynote.propose` (its Control level), the read tool `ledger.notes`; every
AI conversation is told today's and tomorrow's notes of the whole site.

## The similar days (`similar.ts`, pure - 2026-10-25)

A day's features: the sun kWh/m², the wind's average, the mean temperature,
working or not (its notes first), the purchase prices' average and spread,
the month. The distance - the differences over their scales (1.5 kWh/m², 2.5
m/s, 5 K, 5 ct, 8 ct; a missing feature doesn't make a day nearer), the
season's circular months / 2, a working / day-off mismatch 1.5. The nearest
closed days (the last 365, distance <= 3, 5 of them) are then ordered by how
they went: the least left on the table (their review), then the largest
saving. `analogChoice` - the strategy best in hindsight on most of them
(weighted 1 / (1 + distance)), at least 3 days and half the weight; else
none.

`strategy.selection` "analog": once a day (the day's first plan) and when
the day's notes change, today's features from the forecast (the weather's
hourly rows, the day-ahead prices) -> the similar days -> their strategy
applied by the ledger itself (its config patched, the plan re-made) - no AI
needed; none agreed - the strategy kept. The metrics' `analogs` (today's
features, the days, the choice), the day's record `analog`; the Plan view
shows them; the AI's `ledger.similarDays` (today's, or any recorded day
against the days before it). The review knows the day's outages (its slots
islanded as the plan did).

## Who manages what, the AI's day plan (stage D - 2026-10-25)

The energy field is the plant and its hard limits (`socMinPct`, `socMaxPct`,
export); the ledger manages the energy - its strategy and the operating
parameters the plan keeps: `strategy.reservePct` (the outage reserve) and
`strategy.gridChargeAllowed` over the field's own when set. The plan's slot
now (`planNow`) carries `floorPct` - the reserve, in an outage's slot the
field's `socMinPct` - and the field following the plan discharges down to it.

The day's description: the metrics' `summary` - the ledger's own words (the
strategy and why, the day's notes, the batteries' next moves, the expected
saving; `autoSummary`, no AI); the AI's - the work type `day-plan`
(`prompts/day-plan.md`, scheduled by the calendar - e.g. from 06:00 every
2 hours, the calendar's "every N hours"): it reads the notes, the plan, the
similar days, the forecast, the prices and yesterday's review, proposes the
strategy / the reserve / grid charging through `config.propose` on the
ledger (its Config level: Auto - applied, Confirm - a card) and a missing
note through `control.propose`; its answer's `Summary:` line is today's
description (GET `.../notes` - `summary`: the AI's of today over the
ledger's own) - the Energy scene's day block shows it ("AI" / "Plan", a link
to the run).

## The heating's signal (SG-Ready)

Per slot: 3 - "run more" (a cheap quarter of the next 24 h or the forecast
generation over the consumption), 1 - "hold off" (the dearest tenth, at
most 2 h in a row), 2 - normal; the metrics' `heatingNow`.
`heating-control` with `ledgerProcessId` follows it: 3 - its tanks charge
earlier and hotter (within their limit), 1 - start later (the tanks carry
the rooms).

## The AI's daily report (L5)

The package's AI manifest (`library.json` `ai`) adds the work type
`daily-report` (prompt `prompts/daily-report.md`) to the standard ones and
lets the calendar schedule it: yesterday in money and energy (the bridge,
self-sufficiency, accuracy, the strategy and the hindsight), the month so
far, the anomalies, today's plan, proposals only with clear evidence (a
strategy through `config.propose` - the instance's Config level decides).
The tool `ledger.anomalies`: a PV block under 85 % of its group's median
kWh per kWp today (soiling, shading, a failed string - maintenance), a
turbine under 70 % of its neighbours per rated kW, the forecast's accuracy
low (generation < 75 %, consumption < 85 %), the batteries under their
reserve, more than 5 % of the generation held back, a room 1.5 K off its
setpoint. The energy field's metrics carry each block's / turbine's
`todayKwh` for it.

## The cost accounts (`accounts.ts`, pure)

Who the energy is for (2026-10-23): `accounts[]` - `key`, `name`, `kind`
(`private` - the owner's own, `business`, `tenant` - a let unit: what to
re-bill it; no invoices made), `meters` (power-meter node ids - the energy
field's sub-meters), `heat` (`[{ processId, nodeIds? }]` - a heating's fan
coils' heat meters; no `nodeIds` - the system's whole delivered heat). An
account's day: its meters' `todayKwh` / `todayEur` (the slots' purchase
prices) plus its heat at its system's cost of heat today (the system's
`costEur` / `deliveredKwh` - so a plant's whole electricity is shared by its
heat meters). A meter that already includes a heating plant
(`withLoads`) carries that heat - its account lists no heat of that system.
`otherEur` - the site's all-bought money less the accounts' sum. Computed
each run from the sources' today (all of this date's - else the last run's
kept), in the metrics (`accounts`) and in the day's record (`data.accounts`);
a period's - `addAccounts` of its days.

## Routes, AI

`GET /energy-ledger/:id/period?period=day|month|year&day=YYYY-MM-DD` - the
period's days and its sum (record, bridge, KPIs, `accounts`; no `day` - the
ledger's today in its time zone); `GET .../days?from&to`; `GET .../plan`. AI tools
`ledger.history`, `ledger.plan`, `ledger.anomalies`, `ledger.notes`,
`ledger.similarDays`.

## UI

`LedgerScene` - the process row's panel and the Dashboard component
`energyLedger.scene`, two views. Plan (`PlanView`): what the plan saves to
its end, the chart (buy / sell prices, the forecast generation and
consumption, the batteries' charge / discharge, the SoC, the heating's
signal, now), the strategies' cards (choose one, the selection fixed /
proposed), the steps.
Journal: Day / Month / Year with browsing, the saving in big
figures, the bridge (EUR or kWh), the key figures, who the energy was for
(`AccountsView` - private / business / to re-bill to tenants / other, the
accounts' table), the month's calendar (the
days coloured by their saving), the days' / months' table.

## Settings (S3 - 2026-10-25)

The engineer's section (Processes -> Settings, `ui/LedgerSettingsSection.jsx`,
processes.config): the operating parameters (the outage reserve, selling,
charging from the grid - over the energy field's; the operator switches them
on the Energy scene too), the strategies' parameters (the reserve strategy's
level, the peak limit and its penalty, the sale threshold, the gain a change
needs), the plan (its interval, the drift, the batteries' wear and
efficiency), the holidays' calendar (country, region, days ahead). The
cost accounts - in the config (JSON) for now.

## Tenants, the card picture, the plan's windows (2026-10-25)

- **Tenants** (the scene's view; GET `/energy-ledger/:id/tenants?period=day|
  week|month|year|all&day=`): the let units (the tenant accounts) - each
  one's electricity and heat (kWh, EUR) and what it is to pay over the
  period, the closed days only (the current month grows once a day); a year
  / all - each month's "to pay" too.
- **The card picture** (`ui/LedgerAvatar.jsx`, avatar "summary"): saved
  today (EUR), efficiency (the saving's share), self-sufficiency, paid
  today, what the plan still saves, the strategy.
- **The plan's chart** shades the day notes' windows: an outage (red - no
  grid), maintenance (yellow - the batteries' power less). The heating's
  electricity forecast counts its notes too (`heatingFactor`): heat pumps
  out (their rated share), rooms closed (their fan coils' share at 60 %).
- The scene's title with the AI's mark on a Dashboard page (not in the
  process row).

