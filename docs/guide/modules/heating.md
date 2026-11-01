---
title: "Heating"
description: "Heat pumps, tanks, fan coils and rooms - the heating control and the heating planner."
order: 2
---

![Heating](screen:heating-overview)

## Heating control

A heating system is its heat pumps, the tanks (heat storage), the fan coils
and the rooms. The scene shows the outdoor air, the heat pumps, the heat
storage and the rooms, with the heat flows between them; a block opens its
details and charts.

- **The mode** - heating, cooling, or automatic by the outdoor temperature
  (heat below the first, cool above the second; between them it keeps what it
  was doing); off.
- **Staged starts** - only as many heat pumps run as the tanks need; the next
  to start is the least run (the wear spread evenly) or by your priority; they
  start and stop one by one, never all the inrush currents at once.
- **The tanks** - two exchangers (in from the heat pumps, out to the rooms),
  the stratification, the stored heat over the lowest useful temperature.
- **The rooms** - each with its setpoint, its fan coil and valve; a room
  closed by a day note is set back.
- **The Energy Ledger's signal (SG-Ready)** - when energy is dear the heat
  pumps hold off and the tanks carry the rooms; when it is cheap or the sun
  gives more than the site takes, the tanks store more heat.

## The heating planner

The planner makes the heat pumps' plan ahead, slot by slot, for every heating
system - the heat, the units, the store, the rooms' comfort margin - against
the prices, the sun and the Ledger's signal, and shows what it saves against
the plain band control.

| Strategy | What it does |
|---|---|
| Least cost | The heat made when energy is cheapest; the rooms' comfort margin used in the dear hours |
| Gentle | As few starts and as low a power as possible - the heat pumps' wear and the peaks spared |
| Comfort | The rooms always at their setpoint - the tanks alone carry the dear hours |
| The sun | The sun's surplus stored as heat - the tanks filled higher while it shines |

The strategy is **fixed** (you choose it) or **cheapest** - at each plan, the
one with the least electricity. The AI can make the day's heating plan on a
schedule.
