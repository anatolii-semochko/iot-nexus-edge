---
title: "Access levels"
description: "Off, Confirm and Auto - what the assistant may change, and who decides."
order: 2
---

![The instances - Service -> Config -> AI](screen:service-config-ai)

Service -> Config -> AI -> the instances: the whole system's assistant and one
per module instance (an energy field, a heating system, a tank). A row:

- **Connection** - the model it talks to; **- (off)** - the assistant is off for
  this instance: no conversations, its scheduled runs are skipped;
- **Read** - it may read the system: states, logs, series, configs,
  documentation;
- **Config** - process settings; **Control** - commands and manual values;
  **Install** - packages, nodes, devices (the whole system's instance only);
- **Report** - it may write reports and proposals to the developers;
- **Logs** - the conversations are logged with their full payload (the system
  prompt, every tool call and its result);
- **Calendar** - its scheduled runs.

Each area of each instance has a level:

- **Off** - the assistant does not touch it;
- **Confirm** - it proposes; a person with the right accepts or rejects each
  change (the proposal card shows what and why);
- **Auto** - it applies the change itself, as the `ai-agent` account; every
  change is logged with its author.

Which objects the assistant may read and change at all is set by the roles of
its account `ai-agent` - by default the role **AI Assistant** (every object,
configuration included). Narrow that role in Users -> Roles, or give the
account other roles in Users, to keep the assistant away from a part of the
site; a role with every right (Administrator, System service) is refused. The
levels above then say how it acts on what the roles allow.

An MCP client has its levels on its own token and its rights from its own
account's roles (Connections and MCP).

Roles limit what a person - and the assistant working for them - can see and
do.

