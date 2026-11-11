---
title: "Energy"
description: "The energy field, the grid connection and the Energy Ledger - strategies, the plan, the review and what was saved."
order: 1
---

![Energy](screen:energy-overview)

Three packages work together:

- **Energy Field** - the site's generation (PV blocks, wind turbines), the
  batteries, the consumption and the grid point: the live scene and the basic
  controls.
- **Grid Connection** - the prices (market or fixed, tariff zones), the import
  and export limits, the connection's quality.
- **Energy Ledger** - the plan for the hours ahead, the strategies, the
  review of each day, the accounts and what was saved.

## The scene

The energy scene shows the flows between the generation, the grid, the
batteries and the consumption, with the power on each arrow and today's
figures. Click a block for its details and today's chart. The colours of the
prices: green - good for us, yellow - middle, red - not (by the quarters of
the next 24 hours' prices).

The controls (for those allowed to control):

- **Auto / Manual / Island** - the batteries follow the plan, run at the power
  you set, or the site runs off the grid on its own generation and batteries;
- **Grid connected**, **Selling allowed**, the **outage reserve** (the charge
  kept for an outage) - each change for a while (20 minutes, an hour, four
  hours, to the day's end, until changed), with an optional reason; the plan
  can adapt to it.

![The energy field's settings](screen:config-energy-field)

The field's settings - Processes -> Energy Field -> the settings button: the groups (generation or batteries) and which unit is in which; the batteries' charge bands (good from, fair from, the lowest and the highest charge); the critical states drawn red on the scene (over the plan by % or kW, over a rating). The strategy - on the field's panel (Auto / Manual / Island, the reserve); a unit's yield factor - in its popup on the scene.

## Day notes

Notes tell the plan about the day: a public holiday or a working weekend (the
consumption as a day off or a working day), a grid outage (no import or export
in its window - the batteries charged ahead), maintenance (units out, less
battery power), a closed room. Notes ahead show on the scene and in the plan.
