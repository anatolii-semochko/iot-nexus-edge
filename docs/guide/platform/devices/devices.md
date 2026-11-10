---
title: "Devices"
description: "The devices - their values, modes, simulation, logging and heartbeat control."
order: 2
---

![The Devices page](screen:devices)

Every device with its node, type, value and the time it was read; overdue
values are highlighted.

- **The value** - live (pushed, no refresh needed); the units; a device you may
  control - its manual value or command.
- **Auto / Manual** - a device's resource follows the processes (Auto) or a
  person's value (Manual); safety rules refuse a forbidden combination.
- **The row** - expand it for the info (backend, EdgeX name and status,
  capabilities, created), the value's settings, the media (a camera's images),
  data logging and heartbeat control for it.
- **Simulated** - a simulated device's value can be set in place.
- **Groups** - device groups for the business view.

![A device expanded - its info and settings](screen:devices-expanded)

## A device's settings

The row's settings button:

- **Name**; **Node** - the node it belongs to (or none - a standalone device);
- **Physical ID** - its address on the bus or in EdgeX, for the real unit;
- **Device Groups** - the business groups it is in;
- **Background color when active** - how its row and tile light up when on;
- **Simulate** - whether this device is played by the simulation.

A camera's device has a **Media** tab: the latest image, the stored ones,
**Upload image** and **Delete image** (with everything stored with it).
