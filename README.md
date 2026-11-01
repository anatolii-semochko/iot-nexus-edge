# Nexus Edge

*An edge automation platform that runs real equipment - and gets better at it
every day from its own data, with AI at every step.*

Nexus Edge is the open core of a layered platform for automation on site:
one gateway for every device and bus, a domain model of the whole
installation, an event bus mirroring the physical ones, processes that
control, a simulator that can stand in for any part, a web UI for people and
an AI assistant - all reading the same data in one place. Real systems are
composed from a Library of packages (devices, nodes, processes): a house with
solar and storage, a business with tenants, a fleet of aquariums, a plant.

It runs unattended on modest hardware (a Raspberry Pi class computer),
fully containerised, with no cloud needed for local operation.

- **Live demo:** demo.nexus-edge.tech (being prepared) - green energy,
  heating and aquariums on simulated equipment.
- **Site and docs:** nexus-edge.tech

## What it is for

The platform is general; what it gives every system on it:

- **Saving money and resources** - decisions against prices, forecasts and
  the equipment's wear, and the figures that prove the saving.
- **Full automation** - processes that run the equipment on their own, with
  safety rules no command can break.
- **Autonomy of each node** - a node keeps doing its job on its own; the
  platform coordinates, it is not a single point of failure.
- **Extension and decentralisation** - add a package, a node, a site; a
  target project extends the core without forking it.
- **Learning from its own data** - every value and decision recorded, and
  used to decide better tomorrow.

### Green energy - the first example

Not "charge the battery when the sun shines": all the resources together -
the grid, PV and wind, the batteries, the heat storage - by strategy, against
day-ahead prices and weather forecasts.

- Strategies - least cost, self-sufficiency, reserve (e.g. before a storm),
  peak shaving (a business's capacity charge), sales above a price - kept
  fixed, or chosen **automatically by similar days**: each morning the system
  takes the strategy that was best on the most similar recorded days.
- A 15-minute plan ahead; the forecasts corrected by what the panels, the
  turbines and the consumption really did.
- **The day's review** - every day compared in hindsight with the best
  strategy on the day as it was; the **Ledger** - what was saved and paid, a
  day, a month, a year, per account (private, business, tenants).
- **Heating** as part of energy - heat pumps with staged starts, tanks as
  heat storage (store when cheap or sunny, hold off when dear - SG-Ready),
  a heating planner using the rooms' comfort margin in the dear hours.
- Island mode, outage reserve, day notes (holidays, outages, maintenance).

### Aquariums - low-level, niche control

The light counted the right way - a target of **Wh per day**, with spectrum
templates, power curves and seasons computed back from it; CO2 by pH, dosing,
water changes, filters, maintenance - a tank designed to run for months on
its own.

### More to come in the demo

A paint shop with pneumatics and automation, an open farm field, a
greenhouse with automatic processes and visual control.

## AI at every step - and under control

- One **AI Assistant** for the whole system and for each package instance:
  install, configure, watch, analyse, control, propose, report. The AI button
  on a card opens the conversation about that object.
- **Access levels** per area - Off / Confirm (a person accepts each change) /
  Auto (done by its own `ai-agent` account, logged); roles and scopes limit
  what it sees.
- Scheduled runs - e.g. the AI's day plan for energy and heating; proposals
  with a reason and a saving.
- **MCP** - the same tools for any external agent (`/api/mcp`, bearer tokens).
- OpenAI, Anthropic or a **local model** (Ollama, LM Studio, vLLM) - the data
  can stay on site; keys encrypted.

## The platform

```
 devices --> nodes --> bus (CAN, MQTT, ...) --\
                                              >-- device-service --> EdgeX --> Devices API
 virtual devices --> virtual nodes -----------/                                   |
                                                                                   v
                       UI (WebSocket push) <-- event bus (RabbitMQ) <-- processes / simulator / AI
```

- **One gateway** - EdgeX Foundry underneath, a custom Go device-service for
  CAN (a `PhysicalTransport` interface - the next bus is a package, not a
  rewrite), MQTT for network nodes.
- **Dual Devices Model** - each node or device physical or simulated,
  switched live; a model state validator rejects physically forbidden states
  before they reach the hardware.
- **Processes** - the orchestrator's control loop, simulation processes,
  process configs with a schema, commands, groups.
- **Warnings / errors / messages** - levels, groups, sound and LED signalling
  on the operator's node, a notification centre.
- **Time series** - TimescaleDB with continuous aggregates; logs with authors.
- **Users and access** - roles over objects and sections, scopes, a guest role,
  server-side sessions.
- **Dashboard** - a tree of folders, avatars and components, per role.
- **Multilingual** - the interface in English, Ukrainian, German, Spanish.
- **Service** - system stamps (backup / restore), logs, host commands.

## The Library (DNP)

Device / Node / Process packages, public and private. A system is composed
from them; a target project adds its own packages, migrations, UI and AI
manifests without forking the core - see `docs/CREATING_A_TARGET_PROJECT.md`.
In this repository: the energy field, the grid connection, the energy ledger,
heating control and the heating planner, weather control, the AI analyzer,
and the node types of the core.

## Tech stack

| Layer | Choice |
|---|---|
| Runtime | Node.js 22, TypeScript, pnpm workspaces + Turborepo |
| Backend | Fastify, Pino |
| Storage | PostgreSQL 16 + TimescaleDB, Redis 7 |
| Messaging | RabbitMQ 4, WebSocket gateway |
| Hardware hub | EdgeX Foundry 4.0 (Palau), a Go device-service |
| UI | React + Vite (based on the CoreUI admin template), i18next |
| AI | OpenAI / Anthropic / OpenAI-compatible APIs, MCP |

## Quick start

Requirements: Docker with Compose v2. Everything builds and runs in
containers.

```
cp .env.example .env
make up-all
```

This starts the platform (PostgreSQL, Redis, RabbitMQ, orchestrator, api,
messaging-gateway, ui) with the EdgeX core and the device-service. The first
login is `admin` with `ADMIN_DEFAULT_PASSWORD` from `.env` - change it before
running anywhere reachable. All targets - the `Makefile`.

## Repository layout

```
apps/      orchestrator, api, messaging-gateway, ui, device-service
devices/   the Library: node types and process packages (with their UI)
plugins/   a target project's own packages go here (empty in the core)
templates/ the target-project template
docs/      architecture notes, the target-project guide
scripts/   tooling (e.g. the interface's translations)
```

## Status

Actively developed. `AGENTS.md` is the living technical reference (how it
works, per feature); `docs/DEVELOPMENT_LOG.md` - the dated history of the
decisions. Planned, not built yet: several buses at once, an automated test
suite beyond the unit tests, the demo's industry examples.

## License

Apache License 2.0 - see `LICENSE` and `NOTICE`. Use, modify and distribute,
also commercially; keep the licence and the notices, mark your changes.
Private packages built on the core may stay private. `apps/ui` is based on
the CoreUI Free React Admin Template (MIT) - see
`apps/ui/THIRD-PARTY-LICENSE-CoreUI.txt`.

Created by Anatolii Semochko.
