---
title: "Common elements"
description: "What works the same on every page - tables, filters, long lists, popups, charts, rights, dates."
order: 1
---

Every page of Nexus Edge is built from the same parts. What is written here
holds everywhere, so the other pages describe only what is their own.

## Tables and filters

![A table with its filters - Logs](screen:common-table)

- **The filter row** above a table: selects (a device, an action, a person),
  a **search** (it waits until you stop typing, then filters), a **From / To**
  period. The yellow **reset** button on the right clears them all.
- **What you set stays**: the filters, the search, the page size, the open
  tab and the expanded rows are kept in this browser - a refresh or a return
  to the page shows it as you left it. Only the page number starts again.
- **Pages** under the table: the page size, "showing X-Y of Z", the page
  numbers.
- **A row that opens** (an arrow at its start) shows its details under it; the
  arrow in the header opens or closes every row of the page.
- **The colours of a row**: red - an error is active, yellow - a warning, a
  blue tint - simulated (only for those who may see the simulation).

## Long lists - search by a part of a word

![A long list with its search - a role's members](screen:common-checklist)

Every long list in a form (roles, devices, rooms, cards) has a search above it:
type any part of a word - "pump" finds "Heat pump 03" and "pumps". **Selected
only** shows only what is ticked; the counter says how many of how many are
selected.

## Popups

![A device's popup - Status, Model, Photo, Map](screen:common-unit-popup)

- **A device's or a room's popup** opens from the Dashboard, the scenes and the
  tables. Its tabs: **Status** (the live picture, the readings, the charts and
  the controls), **Model** (the node type from the Library - its picture and
  data), **Photo** (the real unit, when it has one), **Map** (where it stands,
  when placed). A tab that has nothing to show is not there.
- **Size**: a popup with tabs or charts takes the whole window and keeps its
  size when you switch tabs, so nothing jumps; the room goes first to the
  charts, then to the photo, then to the map. A small popup (a question, one
  field) and a popup opened from another one are smaller.
- **The AI button** in a popup's header asks the assistant about exactly this
  unit - the conversation starts with it as the subject.
- **Settings popups** (a process's Config, a card's settings) save with
  **Save**; **Cancel** or the cross leaves without changes. When someone else
  saved the same settings meanwhile, Save is refused with a note - reopen to
  see their version.

## Charts

- In a popup the charts take the room the window leaves - each as wide as the
  dialog, together as tall as it lets them; on a phone - one under another.
- A chart's **label** names it; its **legend** names every line in it; a named
  limit (a threshold, a target) is drawn as its own line with a legend.
- A value that goes both ways (a battery's charge and discharge, import and
  export) has its zero in the middle, the same range up and down.
- The values are the stored history, not a guess: a gap in a line is a gap in
  the data (the device was off or not read).

## Rights - what you see and what you may do

- A page, a tab or a button you have no right for is **not shown** at all.
- Changing anything (a setting, a command, a note) is written in the logs with
  your name and the role you act in.
- With several roles you act in one at a time - switch it in the menu under
  your name (Users -> Roles explains the roles).

## Dates, numbers and units

- **Dates** read as people say them: "Today, 08:15", "Yesterday, 22:30", then
  the date.
- **The key values** a person looks for first - power, energy, money, the
  temperature - are larger and bolder than the text around them, with their
  unit (kW, kWh, EUR, ct/kWh, °C).
- The interface's **language** and **theme** (light, dark, as the system) are
  yours - your profile keeps them (Getting started -> Profile).
