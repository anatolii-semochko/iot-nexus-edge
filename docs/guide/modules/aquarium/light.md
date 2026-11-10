---
title: "The light"
description: "The light by Wh per day - the control frame, the spectrum, curve, day, week, month and year editors, the fast test."
order: 1
---

Most light controllers set a power level and a schedule; the light a tank
really gets in a day then depends on the curve, the spectrum and the season -
and smoothing the day lowers it unnoticed. Here the starting point is the
**target energy per day (Wh/D)**: everything else is computed back from it.

Everything below is in the aquarium's **Service - Main Light** (the Service
button on the aquarium's panel); each luminaire has its own library of
templates.

## The levels

- **Spectrum profiles** - the share of each channel;
- **day curves** - the shape of the day;
- **daily profiles** - a curve painted with spectra, period by period;
- **week, month and year profiles** - which day runs when: the seasons;
- one template is **active**; the system scales it so the day gives exactly
  the Wh/D target - a per-minute, per-channel table keeps the spectrum and
  the curve's shape;
- the **fast test** plays any template on the luminaire in seconds.

The light node keeps each channel's power whatever the load (constant power,
feedback) and reports when a load cannot reach it.

## Control

![The light's Control tab](screen:aq-light-control)

The light now and what runs it:

- **Active template** - its type (a day curve, a daily profile, a week, a
  month or a year) and the template itself; the power button silences AUTO
  only (manual and the test keep working). **Smooth / Raw** - how the active
  template is computed.
- **Fast test** - a duration (seconds) and the play button: the whole day of
  the active template on the luminaire, the chart's "now" line running
  through it.
- **The frame** - the mode (AUTO, MANUAL, TEST, OFF), **Wh/D** (the target),
  **Max** (today's peak - plant / all, after the scaling), the server's
  clock, the live power of the plant channels and of all the light.
- **The chart** - today's light band (its colour through the day) and the
  power curves - all the light (yellow) and the plant channels (green); the
  red line - now, the blue ones - the periods' borders.

A blinking Wh/D - the active template can't reach the target without its
spectrum shifting; a blinking template - one of its periods clips a channel.
Each with a short note under the frame.

On the Dashboard the aquarium's panel shows the same light as a compact
strip over the tank: the mode, the clock, the live power, the band and the
curve.

## The templates' tables

Every level (Year, Month, Week, Day, Day Curves, Spectrum Profiles) is a
table of its templates:

- **Preview** - the template's day in small (a spectrum - its colour);
- **Smooth** - Smooth or Raw;
- **Max** - the peak power (plant / all) at the template's own scale;
- **Total** - its Wh per day (all / plant) at its own scale;
- **Max Total** - the most Wh per day it can give without clipping a
  channel - a target above it is flagged;
- the row's buttons: **default** (the star - what a new template starts
  from), **delete**, **test** (plays it on the luminaire), **expand** (its
  editor).

A tab's badge counts its templates in conflict (a channel clipped).

## Spectrum profiles

![The spectrum templates](screen:aq-light-spectrum)

The list: each template's **icon**, **name**, its **preview** (the colour the
luminaire gives), **Power** (all / plant, W - what it draws at every moment of
the day at its own spectrum), **Total** (the Wh a whole day at that power
would give, all / plant - before any Wh/day scaling) and **Max Total** (the
most Wh per day it can reach by uniform scaling before a channel clips).

![The spectrum editor - Sunny Day](screen:aq-light-spectrum-edit)

![The spectrum editor - Tropical Sun](screen:aq-light-spectrum-edit-2)

The editor (the row's expand button):

- **Icon** - an emoji or a symbol: the template's mark in the list and in the
  daily profiles' period selects;
- **Name** and **Description**;
- the **preview** - the mixed colour of the channels as set below;
- **Power** - the sum of all the enabled channels (W): type it or step it by
  0.5 W; a change moves every channel in proportion, keeping the spectrum.
  The + button goes grey once a channel is at its maximum - the template
  can't grow without changing its spectrum;
- **Test** - plays what is in the form right now on the luminaire, before
  saving (the list row's own test plays the saved template);
- a **slider for each enabled main channel** - the channel's colour and name
  (from the luminaire's channels), from 0 to the channel's maximum power,
  0.1 W steps, the watts beside it. Moving one channel changes the Power;
  the plant channels are marked in the luminaire's settings;
- **Save** / **Cancel**.

The default template (the star) and the last one can't be deleted.

## Day curves

![The day curves](screen:aq-light-curves)

The list: the **preview** (the day's shape), **Smooth** or **Raw**, the
**Step**, **Max** (the peak power the curve declares), **Total** (its Wh per
day at its own power) and **Max Total** (the most Wh per day by uniform
scaling before a channel clips).

![The day curve editor - Summer Day](screen:aq-light-curves-edit)

![The day curve editor - Siesta](screen:aq-light-curves-siesta)

The editor:

- **Name** and **Description**;
- **Step** - the points' grid: 1, 5, 10, 15, 20, 30 or 60 minutes;
- **Smooth** / **Raw** - the calculation: smooth changes between the points
  or steps;
- the chart's **zoom** - Fit, 2x, 4x, 8x, 16x: a fine step packs many points
  into the chart; zoom in to grab them (the chart then scrolls sideways);
- **Test** - the spectrum template to play the curve with (a curve has no
  spectrum of its own), the duration (seconds) and the play button;
- **the chart** - drag a point up or down to set its power; every curve is
  drawn against the same ceiling, so curves compare at a glance;
- **Total** - the day's Wh at the curve's own power, updated as you drag;
- **Save** / **Cancel**.

The default curve and one a daily profile uses can't be deleted (assign the
profile another curve first).

## Daily profiles

![The daily profiles](screen:aq-light-day)

The list: the **preview** (the light's colour through the day), **Smooth** or
**Raw**, **Max** and **Total** (all / plant) and **Max Total** (all / plant).
A blinking row - a period clips a channel.

![The daily profile editor - Summer Day](screen:aq-light-day-edit)

![The daily profile editor - Siesta](screen:aq-light-day-siesta)

The editor:

- **Name** and **Description**;
- **the curve** - the day's shape the profile takes its power from;
- **Smooth** / **Raw** - the chart's line and the calculation;
- **the step** - how coarsely the periods' borders snap and move (1 to 60
  minutes); only an editing aid, not saved, independent of the curve's own
  step;
- the chart's **zoom** (Fit ... 16x) and **Test** (the duration and the play
  button - the whole day in seconds);
- **the chart** - the colour band over the curve (the light's colour through
  the day), the blue lines - the periods' borders, the green line - the
  plant channels;
- **the periods** - each a start time (type it, or the - / + buttons move it
  by the step), its **spectrum template**, **move up / down**, **remove**;
  the first starts at 00:00; **Add Period** adds one. A period that clips a
  channel is highlighted, with a note under the table;
- **Save** / **Cancel**.

The demo's **Siesta** profile: moonlight, a sunrise, a sunny plant morning
(09:00-13:00), a cloudy three-hour siesta (Overcast, then Rainy Day), a
sunny afternoon (16:00-20:00), a sunset, a moonlit evening - the 4-3-4 day.
The active profile and the last one can't be deleted.

## Week, month and year profiles - the seasons

![The week profile - Work week & weekend](screen:aq-light-week)

- **Week** - a daily profile for every weekday. The demo's *Work week &
  weekend*: Siesta on the working days, Demo Day at the weekend.

![The month profile - Algae break](screen:aq-light-month)

- **Month** - periods from a day of the month, each a daily profile or a
  week. The demo's *Algae break*: the work week for three weeks, then ten
  days of Siesta.

![The year profile - Seasons](screen:aq-light-year)

- **Year** - periods from a date, each a daily profile, a week or a month.
  The demo's *Seasons*: a short Winter Day from December to February, the
  month's rhythm in spring and autumn, a long Summer Day from June to
  August.

A season changes the day's shape, not its dose: the Wh/D target is the same
all year. A shorter day with the same dose needs more power - if the
luminaire can't give it, the template's Max Total is under the target and
the Control tab says so.

## The target - Wh per day

![The aquarium's parameters - the light's Wh per day](screen:aq-settings-parameters)

The day's light energy is set in the aquarium's **Settings - Parameters**
(Wh/D). Change it - every template follows at once: the same shape and
spectrum, more or less light.
