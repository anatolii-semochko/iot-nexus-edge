# Heating Planner

Plans the heating systems' heat pumps ahead - all of them together. For
every slot of the Energy Ledger's plan (15 minutes), each heating-control
system gets: how much heat (or cold) its heat pumps make, with how many
units, and how far its rooms may sit off their setpoint (the comfort
margin). Each heating-control executes its slot; the Ledger takes the
heating's planned electricity into its own plan.

P1 (2026-10-29): the model, the plan, its execution; P2: the plan's page
and its Dashboard card; P3: the strategies; P4: the AI and the day's notes.

## Config

- `ledgerProcessId` - the energy-ledger whose plan it plans on (its slots,
  buy / sell prices, planned grid exchange, heating signal).
- `heatingProcessIds` - the heating-control systems it plans.
- `timeZone`, `intervalSeconds` (60), `replanMinutes` (15).
- `comfortK` (0.5) - how far a room may sit off its setpoint in the dear
  hours (heating - below, cooling - above), K.
- `comfortModulation` (0.6) - the heat pumps' comfortable share of their
  output: fewer units, lower, longer.
- `startPenaltyEur` (0.2) - a heat pump's start (the inrush, the wear);
  `unitHourEur` (0.01) - a running unit-hour (fewer units rather than more);
  `boostCtKwh` (5) - over the comfort modulation, per kWh of electricity
  (the peak); `comfortCtKwhH` (1) - per kWh of the rooms' margin in use and
  hour (the margin is for the dear hours, not for always); `holdOffCtKwh`
  (10) - the Ledger's signal 1 (hold off), per kWh.
- `store` - the tanks' useful band the plan uses (their average): heating
  35-55 C, cooling 7-16 C.

## The model (`model.ts`, pure)

- The need of a slot: each room's loss to the outside at its setpoint
  (`room.uaKwK` x the difference to the forecast outdoor temperature) less
  its gains (`gainsKw` in the working hours, 15 % else); cooling - the loss
  the other way plus the gains. The day's notes (P4): the Ledger's holiday /
  day-off - a Sunday's gains, its working weekend - a working day's; a
  heating's room-closed (its window or day; no units - every room) - the
  room's setpoint set back by the heating's `control.closedSetbackK` (4 K)
  in the slots it covers (the slot's `setbackK`).
- The store: the tanks between `store.minC` and `store.maxC` and, under
  them, the rooms' comfort margin (their `capacityKwhK` x `comfortK`) - one
  level, the tanks first.
- The money: the electricity - the heat over the COP (the Carnot model at
  the tanks' temperature + 5 K: a cooler store is cheaper to fill) - the
  Ledger's planned export first at its sell price (the sun's surplus, with
  the heating it counted in that slot), the rest at the buy price; the
  penalties above; the need not covered - 2 EUR per kWh.
- The choices of a slot: none; n units at the comfort modulation; n units
  matching the need (they modulate); all at full power.
- Dynamic programming over the store's level (60 steps) and the units
  running; the store's change at the end - a surplus at the horizon's mean
  cost of heat x 0.85, a deficit at full, the rooms' margin left in use at
  its holding cost.
- Each slot: `needKw`, `heatKw`, `units`, `modulation`, `electricKw`,
  `storeKwh`, `tankC`, `roomOffsetK`, `costEur`, `baselineEur` (the same
  need made when needed at a mid-band store - the band control's). The
  plan's `energyEur` (its electricity), `baselineEur`, `savingEur`.

## The strategies (`strategies.ts`, pure)

Each shapes what the model sees; every one is planned for each system and
valued in the real money (the real prices - the sun's surplus at the sale
price - no penalties), so they compare fairly:

- `cost` - Least cost: the weights as configured.
- `gentle` - Gentle: a start x5, a unit-hour x3, over the comfort
  modulation x4 - as few starts and as low a power as possible.
- `comfort` - Comfort: no comfort margin - the rooms always at their
  setpoint, the tanks alone carry the dear hours.
- `sun` - The sun: the surplus worth nothing on the grid (sale price 0),
  the tanks may go 8 K hotter (cooling - 4 K colder) - the sun's heat stored.

Each result: `energyEur`, `baselineEur`, `savingEur`, `starts` (each unit
counted), `unitHours`, `comfortKh` (the rooms off their setpoint, K-h),
`maxOffsetK`, `sunKwh` (the electricity from the surplus). Config
`strategy: { key, selection }` - selection `fixed` (the key) or `cheapest`
(the least electricity's at each plan). Commands (POST
/processes/:id/commands, processes.control): `setStrategy` `{ key }`,
`setSelection` `{ selection }` - each patches the config and plans at once.
The plan carries `strategy`, `strategies` (the sums over the systems) and
each system's own `strategy` and `strategies`.

## The AI (P4)

`library.json` `ai` - the planner's instances get the assistant; its own
work type **Heating Plan** (`heating-plan`, `prompts/heating-plan.md`,
scheduled): today's strategy and comfort margin checked against the day's
notes, the forecast, the prices and the sun - `config.propose` on the
planner's `strategy` / `comfortK` under its AI Config level (Auto / Confirm
/ Off), `daynote.propose` for a missing note; its answer's `Summary:` line.
The tool `heatingPlanner.plan` - the plan's sums, the strategies compared,
each system's slot now and steps (`slots: true` - every slot). GET
`/heating-planner/:id/summary` - today's plan in a sentence: the AI's
Heating Plan today (its Summary) over the planner's own (`metrics.summary`
- the strategy, the saving, the starts, the rooms, the sun); the page shows
it on top (`PlanSummary` - "AI" / "Plan", the conversation's link).

## The run

Every `intervalSeconds`: the Ledger's plan read; a new plan made when
`replanMinutes` passed, the Ledger made a new plan, the config changed, and
at the first round after a start. The systems one after another, each
taking the sun's surplus the earlier ones left; a system off (its mode or
control) - nothing planned. The units: the system's heat pumps not
`disabled` and not in maintenance (a day note). Without a Ledger plan -
nothing planned (a warning), the heatings keep their own band control.

- PUT `/heating-planner/:id/plan` (the table `heating_plans`, migration
  101) - `{ madeAt, ledgerMadeAt, systems: [{ processId, name, mode, units,
  storeKwh, marginKwh, energyEur, baselineEur, savingEur, slots }],
  electricity: [{ t, kw }] }`.
- GET `/heating-planner/:id/plan` - the whole plan; GET
  `/heating-planner/:id/now?heating=<processId>` - a system's slot now and
  the next four (what heating-control executes).
- Metrics: `madeAt`, `ledgerMadeAt`, `horizonH`, `systems[]` (each its slot
  now - heat, units, electricity, the rooms' offset, the tanks - and its
  sums), `totals`.

## The execution (heating-control `plannerProcessId`)

Each round the system reads its slot now: the units (the first of its
start order), their power together (`stageUnits`), the rooms' offset on
their setpoints. Not followed - the band control instead - when there is no
slot now, the plan is over 2 hours old, it is for the other mode, the
planner didn't answer, or the tanks are out of their safe range (heating:
under the coldest tank's `tMinC` + 5 K - the band charges them; over the
hottest allowed `tMaxC` - 2 K - no more heat; cooling: over the band's
start + 2 K). The heating's metrics `plan` - `{ source: "planner", heatKw,
units, roomOffsetK, madeAt }` or `{ source: "band", why }`; the scene - "by
the plan" / "by the band".

## The Ledger (`heatingPlannerProcessId`)

At each plan it makes, the Ledger takes the planner's `electricity` as the
heating's part of the forecast (its degree-hour model otherwise); each of
its slots says which (`heatKw`). The planner's own new plan never makes the
Ledger plan again - the planner follows the Ledger, not the other way.

## UI

`HeatingPlanScene` - the process row's panel and the Dashboard component
`heatingPlanner.plan`: the plan's KPIs (made at, the horizon, its
electricity, by the band, the saving and its share, the heat pumps now, the
rooms now); the system's switch (all of them - summed - or one; kept per
viewer); `PlanChart` over the horizon - the prices (buy, sale) with the
Ledger's signal (hold off grey, store green), the heat planned (bars) over
the rooms' need (a dashed line) with the sun's surplus (yellow), the units,
the store (one system - its tanks' C, all - their kWh), the rooms off their
setpoint, now; the plan in words (its runs: from, to, the units, the mean
heat and price, the rooms' margin); the systems' table (a row opens its
system); the strategies' cards (`Strategies` - each one's electricity,
saving, starts, the rooms off, the sun's heat; "best"; a click follows it;
the choice Fixed / Cheapest - the system's own figures when one is shown).
`HeatingPlanAvatar` (`summary`) - the card picture: the next 24 h's
heat under the price, the saving, the heat now and the units. The data -
`usePlan` (read again on a new plan - the live metrics' `madeAt` - and every
5 minutes). Each slot of the plan also carries `sellCtKwh`, `signal`,
`cheapKw` for the chart.
