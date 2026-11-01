---
title: "Strategies"
description: "The Energy Ledger's strategies, how one is chosen and proposed, and when the plan is made again."
order: 1
---

The Ledger plans the batteries in 15-minute slots against the day-ahead
prices and the forecasts:

| Strategy | What it does |
|---|---|
| Least cost | Charge when energy is cheap or free, give it back when it is dear |
| Self-sufficiency | As little from the grid as possible - no charging from the grid |
| Reserve | The batteries kept high - ready for an outage (e.g. before a storm) |
| Peak shaving | The import kept under the peak limit - a business's capacity charge |
| Sales | The stored energy sold only above the price threshold |

The strategy is **fixed** (you choose it) or chosen by **similar days**: each
morning, and when the day's notes change, the Ledger takes the strategy that
was best on the most similar recorded days - the weather, the prices, the
day's type, the season. No AI is needed for it.

When new day-ahead prices make another strategy cheaper by more than the
threshold, it is **proposed** - applied at once or waiting for your Accept,
by the Ledger's AI access level (Auto / Confirm / Off).

The plan is made again every few minutes, on new prices, on a change of the
day's notes, and when the batteries' charge drifts from the plan.

