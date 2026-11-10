---
title: "Processes"
description: "The processes - running, stopping, their panels, groups and settings."
order: 3
---

![The Processes page](screen:processes)

Every process with its kind, state and warnings. The tabs: **All**,
**Controllable** (started and stopped by people), **Permanent** (always
running - the system's own), **Dashboard** (the processes' summaries) and
**Settings**.

- **The row** - expand it for the process's panel (its scene, controls and
  figures); start, stop, simulate.
- **Settings** - each kind's settings, checked against its schema; a change
  made by someone else in the meantime is refused, not overwritten.
- **Groups** - process groups and tab groups.

![A process expanded - its panel](screen:processes-expanded)

## A process's settings popup

The first button on a process's row opens its settings - one popup for
everything about it, saved together:

- **Tabs** - the tabs (tab groups) of this page the process shows in;
- **Message Casting Groups** - the groups its warnings and errors go to (who
  hears them, how they beep - the Settings tab below);
- **Acts as** (the people's administrator only) - a person the process works
  for: what it does "as the person" gets that person's rights and their name in
  the logs (e.g. a maintenance process doing a technician's work); **No one** -
  the process acts as itself;
- **its own block** - what the kind adds: a module's working settings (the
  energy field's groups, units and strategy, a heating system's heat pumps,
  tanks and rooms, the weather's place and forecast), each checked against the
  kind's schema (see the module's page); a small kind's own (e.g. which
  annunciator slot shows which message).

An aquarium keeps its settings in its own **Service** popup on the Dashboard
(the tank's card -> Service).

![The processes' settings](screen:processes-settings)

The system's settings live here too: message levels (beeps, repeats), message
groups and signal timing, heartbeat thresholds, data logging.
