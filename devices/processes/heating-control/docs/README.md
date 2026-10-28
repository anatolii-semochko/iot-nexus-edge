# Heating Control (process kind)

CORE Library process kind, loaded automatically in every project
(orchestrator `devices/processes/*/process.ts`, api `.../api.ts`, UI
`.../ui/register.js` - AGENTS.md section 82). A site's **heating / cooling
on water**: air / water heat pumps charge buffer tanks, the rooms' fan coils
draw from them - three blocks, each with optional groups. Uses
`weather-control` (the outdoor temperature and humidity) and, for the money,
`energy-grid` (the slots' purchase prices). Public; a project seeds its
instance (the nodes and one process). Added 2026-10-20.

## Items (the config)

| Config | Node type (reference model) | Params |
|---|---|---|
| `heatPumps[]` | `heat-pump` (Vaillant aroTHERM plus 12 kW) | `ratedHeatKw` (A7/W35), `ratedCoolKw` (A35/W18), `nominalFlowLpm`, `fanRatedRpm`, `carnotEfficiency` (0.45), `minModulation` (0.3) |
| `tanks[]` | `buffer-tank` (Vaillant allSTOR plus 800 l) | `volumeL`, `tMinC` (0 % stored), `tMaxC` (100 %), `lossKwK` (0.0035) |
| `consumers[]` | `fan-coil` (Daikin FWT) | `ratedKw` (at 50 K water - room, full fan), `fanRatedW`, `fanRatedRpm`, `room` - `uaKwK`, `capacityKwhK`, `gainsKw`; `setpointC` (the room's own, over the control's) |

Each item: `nodeId`, `name`, `group` (`groups: [{ key, name, block }]`,
block - `pumps` / `tanks` / `consumers`), `model`, and `devices` - its
devices by role (ids: a heat pump `flowTemp`, `returnTemp`, `outdoorTemp`,
`flowRate`, `heatPower`, `heatEnergy`, `power`, `energy`, `fanSpeed`,
`relay`; a tank `topTemp`, `middleTemp`, `bottomTemp`; a fan coil
`temperature`, `humidity`, `valve`, `power`, `fanSpeed`) - several devices of
one type on a node, so never by type or name.

`control`: `mode` - `auto` (heating below `heatBelowC` 15 C outside, cooling
above `coolAboveC` 24 C, as it was between - the hysteresis), `heating`,
`cooling`, `off`; `setpointC` - `heating` 21 / `cooling` 24; `tank` -
`heating` start 42 / stop 50 C, `cooling` start 14 / stop 9 C (the tanks'
average); `tankRoomC` 15 (the tanks' room - their standing loss).
`ledgerProcessId` - the energy-ledger whose signal (SG-Ready) the tanks
follow: 3 - start 5 K earlier, stop 8 K hotter (within `tMaxC` - 5; cooling -
3 K colder), 1 - start 6 K later (cooling 4 K); the metrics' `signal`.

## The run (every `simulation.intervalSeconds`, default 30)

1. The mode; a change stops the tanks' charging (the band is the other one).
2. The readings by role. A **simulated** item (its node Simulated) gets them
   from the models (`model.ts`):
   - heat pump: the output at the outdoor temperature (less heat in the cold,
     less cold in the heat); the units staged - as few as the tanks' need
     takes, the one with the least run hours leading (one runs longer rather
     than all briefly; more join for a large need or the cheap tariff's
     charge), the running ones at one modulation (at least `minModulation`); the water from the tanks'
     bottom (heating) / top (cooling), the flow temperature from the flow
     and the output; the COP / EER - the Carnot COP of the refrigerant's
     temperatures (5 K past the water and the air) x `carnotEfficiency`,
     1.2..7; the fan's speed with the modulation;
   - tanks: one store of all the readable tanks (the average weighted by
     volume); the heat pumps' heat in, the consumers' out, shared by volume;
     the standing loss to their room; top / bottom around the average with
     the flows (stratification); stored = V x 1.163 Wh/(l K) x (T avg - `tMinC`),
     100 % at `tMaxC`;
   - rooms: each fan coil's thermostat with a hysteresis - it starts working
     when the room is 0.3 K short of its setpoint and stops once it reached
     it (idle - the fan stands); while working the fan is proportional over
     1.5 K, at least a quarter; its output from the water (the tanks' top / bottom) and
     the room's temperatures and the fan (only in its direction); the room's
     balance - the fan coil, the gains (people, computers - the working
     hours), the loss to the outside; the humidity from the outside air's,
     dried by heating, condensed on a cooling coil.
   A reading not readable now (a device not ready) - that item sits the
   round out, never integrated on a guess.
3. The switches (relay, AUTO): a heat pump's operation and a fan coil's
   valve - on unless `disabled` or the mode `off`.
4. **Today** (in the metrics, restored after a restart): heat and cold made,
   heat delivered to the rooms, the heat pumps' and the fans' electricity;
   with the grid's prices - the cost and two baselines for the Energy
   Ledger: direct electric heating (the delivered heat at COP 1) and heat
   pumps without tanks (the delivered heat at the COP of the moment it's
   needed; its electricity `noStorageKwh` too) - what the system saves.
5. WEM: errors - frost in a room or a tank (< 5 C); warnings - a tank over its
   `tMaxC`, a COP / EER under 2, the tanks nearly empty while heating, no
   forecast.
6. Metrics: `mode`, `control`, `charging`, `electricKw` (the Energy Field's
   `loadProcessIds` add it to the site's consumption), `outdoor` (now, in 3
   h), `totals`, `lines` (pumps - tanks, tanks - consumers: warm / cold C,
   kW), `price`, `groups`, `pumps[]`, `tanks[]` (each also `chargeKw` - + charged /
   - drawn, `flowing`), `consumers[]`, `today`;
   series `heat.outdoorC`, `heat.heatKw`, `heat.electricKw`,
   `heat.consumersKw`, `heat.cop`, `heat.tankPct`, `heat.tanksKw` (the
   tanks' net: + storing / - giving back) (5 min).

## Commands

POST /processes/:id/commands (`processes.control`): `setMode` `{ mode }`
(auto / heating / cooling / off), `setSetpoint` `{ mode, c, nodeId? }`
(heating / cooling; a room's own with `nodeId`, else the default),
`setEnabled` `{ nodeId, enabled }` (a heat pump / a fan coil). Each patches
the config (kept) and is applied at once.

## AI

Tool `heating.status` - the state now (`items: true` - every unit).

## UI

`HeatingScene` - the process row's panel and the Dashboard component
`heatingControl.scene` (the outdoor temperature's widget on top - weather-
control's `TemperatureWidget`; the heat pumps, the tanks, the consumers,
each with its summary line; between them the water lines - their gauges
and the heat over time, a day / a week (`HeatTrend`); unit popups). The
powers count one way - the heat or the cold alike, up from zero (the pumps'
and the lines' gauges, the pumps' and the rooms' charts); only a tank's gauge
and chart have their zero in the middle (it takes and gives back); coloured limits only where they mean something (the
supply water, a tank's frost / top temperature, over the rating). `HeatingRoom` - the Dashboard component
`heatingControl.room` (`params.nodeId` - the room's fan coil): its valve,
temperature, humidity, setpoint + / -, working / idle and what it gives now,
the room's heat meter today (`consumers[].todayKwh`), the mode and the
Energy Ledger's signal. `HeatingAvatar` - the card picture: a heat pump, a
tank, a fan coil with their figures.

## Settings and notes (2026-10-25)

- **Settings** (the engineer's - Processes -> Settings,
  `ui/HeatingSettingsSection.jsx`, processes.config): the groups of each
  block (heat pumps, tanks, fan coils; one level) and the units'
  assignment, the auto mode's thresholds (`heatBelowC`, `coolAboveC`), the
  tanks' bands (heating / cooling start / stop) and their room's
  temperature. The scene shows each block by its groups - none used: all
  together; some: by groups, the rest in "Other". The operation (the mode,
  the setpoints, a unit on / off) stays on the scene.
- **The heating today** - the scene's notes block (the core's day notes of
  this process): maintenance (its heat pumps / tanks / fan coils, a
  window), a room closed, other. The Energy Ledger's plan and the AI see
  them, and the heating reacts itself (read every 2 minutes - its own notes
  and its ledger's): maintenance - the named units out in the window (a
  heat pump makes nothing, a fan coil off); a room closed - its setpoint set
  back by `control.closedSetbackK` (4 K; heating lower, cooling higher; no
  units named - every room); a holiday / a day off (the ledger's notes) - no
  working-hours gains in the rooms, a working weekend - the gains as on a
  working day. The metrics' pumps / consumers carry `maintenance` / `closed`.

