---
title: "The light"
description: "The light by Wh per day - spectrum, curves, seasons, programs."
order: 1
---

Most light controllers set a power level and a schedule; the light a tank
really gets in a day then depends on the curve, the spectrum and the season -
and smoothing the day lowers it unnoticed. Here the starting point is the
**target energy per day (Wh/D)**: everything else is computed back from it.

- **Spectrum profiles** - the share of each channel;
- **day curves** - the shape of the day;
- **week, month and year profiles** and **programs** - the seasons;
- a per-minute, per-channel table keeps the spectrum and the curve's shape
  while hitting the day's Wh exactly;
- the **fast test** and the light's own panel.

The light node is designed to keep each channel's power whatever the load
(constant power, feedback) and to report when a load cannot reach it.

