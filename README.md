# NexusEdge — Open Edge Automation Platform

*Powered by EdgeCore Runtime.*

An edge-first, modular automation platform for controlling physical (and
simulated) hardware — heating, lighting, aquarium equipment, industrial
nodes, and anything else that speaks a bus protocol. The platform itself is
not an application: it's the reusable core (device registry, real-time
messaging, orchestration, admin UI) that domain-specific systems get built
on top of. The first such system, a Smart House controller, lives in its
own separate repository.

Everything here is designed to run unattended on constrained hardware
(Raspberry Pi class), fully containerized, with no cloud dependency for
local operation.

## Screenshots

| Processes / Orchestration | Dev Simulator |
|---|---|
| ![Processes page](docs/images/processes.png) | ![Dev Simulator page](docs/images/simulator.png) |

The **Processes** page runs a real 1-second control loop (a temperature
controller driving a virtual heater/cooler pair) with a live, independent
safety monitor watching the same device. The **Dev Simulator** lets you
drive every virtual device's sensors by hand — no physical hardware
required to develop or demo against.

## What's actually built

This is a working vertical slice, not a scaffold — every item below runs
end-to-end today, verified live in a running container stack (see
`../AGENTS_TO_DO.md` for the full, dated build log):

- **EdgeX Foundry integration** (Palau 4.0.2) with a **custom Go
  device-service** (`apps/device-service`) written against the EdgeX
  Device SDK — no official EdgeX service supports CAN bus, so this was
  built from scratch, with a `PhysicalTransport` interface so the next bus
  (RS485, Modbus, MQTT...) is a new package, not a rewrite.
- **Dual Devices Model** — every device resource is independently
  `AUTO` (orchestrator-driven) or `MANUAL` (UI override), with a
  **Model State Validator** that rejects physically forbidden combined
  states (e.g. heating and cooling the same zone at once) before they ever
  reach the hardware.
- **Virtual Node Runtime** — physical vs. virtual is a per-device
  config flag handled inside the same device-service process, so
  developing and testing new device types never requires real hardware.
- **Event-driven messaging** — a RabbitMQ topic exchange plus a
  dedicated WebSocket gateway (`apps/messaging-gateway`) push every state
  change to the UI in real time, filtered per-client by routing-key
  pattern.
- **Orchestrator with real control logic** (`apps/orchestrator`) — a
  1-second tick loop, demonstrated with a temperature controller and an
  independent safety monitor that flags critical states across the whole
  UI.
- **Users and access** — server-side sessions (a JWT in an
  httpOnly/`SameSite=Strict` cookie; absolute and idle limits), bcrypt
  passwords, avatars. Roles are tables of object x level (view / control /
  configure) over the DNP instances and the system sections, with their
  own Dashboard cards, pages and AI token limit; a person acts in one of
  their roles at a time ("Act as", checked by the server on every
  request). An optional built-in guest replaces the sign-in page with a
  read-only (or as configured) view, with links into its roles
  (`?account=`).
- **A universal pagination/filtering toolkit** for admin tables (debounced
  search, page-size control, client-side pagination) — built once, reused
  across every list view in the app.
- **Multiple real device types end-to-end** (starting with
  `devices/standalone/actuator/light-regulator`) — contract schema,
  EdgeX device profile, safety rules, and both a production and a
  dev-simulator UI component, the convention every device type since
  has followed.
- **Simulation processes** — a third process type that generates a
  plausible value for a readOnly device over time (e.g. ramping a
  simulated sensor toward its target), gated behind two independent
  switches (an operator's own ON/OFF plus the target device's own
  simulated-mode flag) so a simulation can never run against what looks
  like live hardware.
- **Admin Service page** — System Stamps (snapshot/restore the whole
  device/node/process/user configuration as a file, with a
  compatibility check before ever applying one), log download and a
  Clear Logs form (up to a date, per DNP instance, with volumes),
  and host Shutdown/Restart over D-Bus (`systemd-logind`), all
  admin-gated and env-flagged off by default.
- **Time series** — logged values (devices and process metrics) in one
  TimescaleDB store, each series with its recording policy (period / on
  change / deadband / stale), hourly and daily continuous aggregates so a
  year's chart reads a few hundred rows; written by the Data Logger.
- **Change events** — a Postgres trigger notifies every config-relevant
  row change; the api relays it onto the bus and the orchestrator's
  processes drop their caches at once (no TTL waits).
- **Process configs with a schema** — a process kind registers a JSON
  Schema (edits checked server-side, served to UIs); per-section change
  stamps refuse an edit over someone else's newer one; one-shot commands
  go through a process command channel, not the config.
- **Dashboard cards** — one tree of folders and components (each bound
  to a named process instance), configured in Service -> Config ->
  Dashboard; components bring their own avatars for the cards.
- **DNP API** — the installed DNPs (Library catalog and project plugins,
  versions), core and project migrations (applied once each at start);
  nodes (with the devices their type declares) and devices registered at
  run time - in the registry and in EdgeX, no restart.
- **Nexus Edge AI Assistant** — a messenger with an agent per entity (the
  whole system or a DNP instance) and work type: it reads the system
  through a tool gateway (states, WEM, logs, time series, configs, the
  docs), proposes config / control / install changes within its access
  levels (Off / Confirm with Accept-Reject cards / Auto), runs scheduled
  analyses with linked warnings, reports to the developers. OpenAI,
  Anthropic or an OpenAI-compatible local model; keys encrypted. The same
  tools as an **MCP server** (`/api/mcp`, bearer tokens) for Claude Code
  or any MCP client.

Deliberately **not** done yet, and documented as such rather than left
quiet: an automated test suite beyond the unit tests of the access
mapping and a few modules.

## Architecture

```
Physical Device -> Node -> Bus Transport (CAN first)   --\
                                                            >-- device-service --> EdgeX --> Devices API --> Orchestrator <-> UI
Virtual Device  -> Virtual Node -> Virtual Node Runtime --/
```

The Devices API also pushes every state change onto a RabbitMQ event bus;
`apps/messaging-gateway` fans it out to the UI over WebSocket, so the
browser never polls. The UI reaches the Devices API directly for
per-device control and the Orchestrator directly for starting/stopping
automation processes — two separate concerns, two separate channels.

## Tech stack

| Layer | Choice |
|---|---|
| Runtime | Node.js 22, TypeScript, pnpm workspaces + Turborepo |
| Backend HTTP | Fastify, Pino logging |
| Storage | PostgreSQL 16 + TimescaleDB (registry, time series), Redis 7 (live state + Dual Devices Model) |
| Messaging | RabbitMQ 4 (`nexus.events` topic exchange), `@fastify/websocket` |
| Hardware hub | EdgeX Foundry Palau 4.0.2, no-security profile |
| Device driver | Go, EdgeX Device SDK |
| UI | React + Vite, CoreUI Free Admin Template |

## Repository layout

```
apps/           orchestrator, api, messaging-gateway, ui, device-service — the deployable platform services
packages/       shared libraries (empty for now)
plugins/        protocol/device-driver/UI/storage/AI plugins (empty for now)
devices/        device/node type definitions for physical & virtual devices,
                see AGENTS.md section 7
examples/       example configurations (empty for now)
docs/           architecture vision (PROJECT_MASTER-1.1.md) and screenshots
```

## Requirements

- Docker + Docker Compose v2
- Node.js 22 is pinned for the workspace (`.nvmrc`), but all builds and
  services run inside containers — a local Node/pnpm install is not
  required.

## Quick start

```
cp .env.example .env
make up-all
```

This starts the platform services (PostgreSQL, Redis, RabbitMQ,
orchestrator, api, messaging-gateway, ui) together with the EdgeX Foundry
core stack and its custom device-service. Default login is `admin` /
whatever you set `ADMIN_DEFAULT_PASSWORD` to in `.env` — change it before
running this anywhere reachable.

See `Makefile` for all available targets and `AGENTS.md` section 20 for
details.

## Project status & docs

This is an actively developed platform, not a finished product.
`docs/DEVELOPMENT_LOG.md` is the distilled, dated history of what was
decided and why; `AGENTS.md` is the living technical reference (rules,
architecture, per-feature design notes) - trust it over the log if the
two ever disagree; `docs/PROJECT_MASTER-1.1.md` is the original
architecture/vision document, kept for historical context and flagged
where it's since diverged. Read in that order for, respectively: *what
happened and why*, *how it works*, and *where it started from*.

(The project is also steered day-to-day in `../AGENTS_TO_DO.md`, a
local, gitignored working journal in Ukrainian one level up - shared by
this repo and its sibling target-project repos, not part of any of their
git histories, mentioned here only so its absence from a clone isn't a
surprise.)

## License

Apache License 2.0 — see `LICENSE`. `apps/ui` is based on the CoreUI Free
React Admin Template (MIT) — see `apps/ui/THIRD-PARTY-LICENSE-CoreUI.txt`.
