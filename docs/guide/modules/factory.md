---
title: "Factory"
description: "A metal shop from the bar to the pallet - the zones, the anodizing line's hoist, the CNC, the chemistry and the wastewater."
order: 4
---

![The metal shop's plan](screen:factory-shop)

The factory module runs a small metal shop that makes aluminium parts from the
bar stock to the pallet: the blanks are sawn, machined on CNC, anodized on a
line with an automatic hoist, dried, checked and packed. Its panel - Dashboard
-> Factory -> Metal shop - is the shop's plan with its seven zones. Each zone's
main figures stand on its floor as gauges: the anodize bath's and the oven's
temperatures, the compressed air, the bar stock, the OEE, the passed share, the
chemicals' and the wastewater's levels. A gauge is green in its band and
yellow out of it. A zone's outline lights up under the pointer, and a click
opens the zone's window - its own picture, the figures, a table, the day's
charts. Under the plan each zone has its card (a coloured dot for its state,
the figures that matter now) that opens the same window. Why a shop is
automated this way and what it is worth - the site's
[Factory](/solutions/factory/) section.

The pictures move with the shop: the hoist carries the bars, over each bar a
ring counts its step down; the CNC doors rise for a setup, the head works
behind the glass, the status light shows the state; the saw feeds the bar and
cuts, sparks flying from the cut; in the chemistry dots run along the pipes
while their pumps work. On each bath's front its heater's coil glows while it
heats (the anodize bath's cooling coil glows blue), a tube shows its level and
a drop its concentration (a plus while the dosing pump adds). The compressor,
the chiller and the oven have a status light: green blinking at work, yellow
standing by, red blinking on a fault.

## The anodizing line

![The anodizing line's window](screen:factory-line)

Eight baths by the recipe - degrease, rinse, etch, rinse, anodize, rinse, dye,
seal. The window shows each bath's temperature (an arrow - heating or
cooling) and the bar in it with its step's timer; the line's power, the
rectifier's current, voltage and density, the coating of the bar in the
anodize bath, the bars, parts and kWh of the day; the baths' table and charts.

The hoist plays each move as a timeline: it travels only with the bar up and
lifts or lowers it only standing over a bath; it comes to a bar `leadS`
seconds (default 10) before its time ends and waits over the bath. The
rectifier's current follows the bar's area and the density; the coating is
counted from the ampere-hours.

## CNC machining and the saw

![The CNC machining's window](screen:factory-cnc)

Each machine's state - running, setup, waiting, tool change - its program,
the parts done of the job, the cycle and the tool's life left, the OEE of the
day; the power and the parts as charts. The saw cuts the blanks for the
machine with the fewest; the bar stock's metres are counted and a delivery
comes under its minimum.

## Chemistry and wastewater

![The chemistry and wastewater's window](screen:factory-chem)

The concentrates' tanks - each one's level, the litres a day and the days it
lasts; a warning to reorder under its reorder level, a critical message before
the dosing stops. Every bar lifted out of a bath carries some solution out:
the bath's dosing pump adds the concentrate back when the bath falls out of
its band. The wastewater: the rinses' overflow into the collection tank, the
transfer pump by its levels, the neutralization's pH held by the caustic and
the acid pumps, the settler's sludge pressed in the filter press, the
discharge; warnings for the collection tank's level, the discharge's pH and
the press's cloth.

## Energy and the AI

The shop is one of the site's loads: its electricity goes into the Energy Field's balance through its own
meter, the Energy Ledger keeps its account, and the panel shows the day's peak - the highest 15-minute
average, as the grid bills it. The line heats its baths by the electricity's price: in the cheap hours each
heated bath is stored to the top of its band (the cooled anodize bath to its bottom), in the dear hours it
rides the band's other edge - the band itself is never left; the line's window shows the mode.

The AI Assistant knows the whole shop: the shift's state and what comes next (the jobs' ends and setups, tool
changes, the stock and the chemicals to order), one batch's whole way from the line to QC, and what is off
now with its figures - ask it for a shift's report, a batch's report or the cause of a warning.

## The processes

The shop is a set of processes, each with its own settings (Processes -> the
process -> its settings button):

- **anodizing-line** - the baths (their nodes, roles, volumes, set points),
  the recipe (the bath and the minutes of each step), the line (`pitchMm`,
  `speedMmS`, `liftS`, `dripS`, `leadS`, `loadEveryMin`, the bar's area and
  parts, the current density);
- **machining** - the materials, the jobs (program, part, material, blank,
  quantity, cycle, setup), the machines, the saw, the shift;
- **chem-wastewater** - the tanks, the dosing (the bath, its tank, the target
  and band, the concentrate, the pump, the drag-out), the wastewater
  treatment's levels, pH band, settler and press;
- **drying-oven**, **quality-control**, **shop-utilities** (the compressor,
  the chiller, the DI water) and **metal-shop** - the shop's summary: its
  electricity at the grid's price, the batches in work.
