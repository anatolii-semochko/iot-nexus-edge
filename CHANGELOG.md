# Changelog

The notable changes of Nexus Edge, newest first. The dated decisions behind
them - `docs/DEVELOPMENT_LOG.md`; how everything works - `AGENTS.md`.

## 1.0.0 - the first public release (2026-11-12)

The open core of the platform, as the public demo runs it.

### The platform

- **One gateway** for every device and bus - EdgeX Foundry with a Go
  device-service (CAN through a `PhysicalTransport` interface, MQTT for network
  nodes, virtual devices for the simulation).
- **The model** - nodes and devices with their roles, every one physical or
  simulated and switched live; a model state validator refusing a physically
  forbidden state before it reaches the hardware; a node keeping its own safety
  limits with no link to the server.
- **Processes** on the orchestrator's tick - config sections checked against a
  JSON schema (a change made meanwhile by someone else refused, not
  overwritten), commands, metrics, warnings / errors / messages with levels,
  groups and the operator's sound and LED signalling; a process may act as a
  person.
- **History** - TimescaleDB series with continuous aggregates, logs with their
  authors, backups (system stamps) and restore.
- **People and access** - roles over objects (package instances) and sections,
  one permission catalog for the API, the UI and the AI, server-side sessions, a
  guest with its own roles and public links, service accounts.
- **The Dashboard** - a tree of folders, avatars and components per role;
  popups with the live status and charts, the Library model, the photo, the map;
  a target project's own components.
- **The interface** in English, Ukrainian, German and Spanish; light and dark;
  the user guide built in (one source with the site and the AI).

### The AI Assistant

- An assistant for the whole system and one per package instance - install,
  configure, watch, analyse, control, propose, report; Off / Confirm / Auto per
  area; scheduled runs (the day plans, the daily report).
- **MCP** for external agents - each token with its own service account whose
  roles decide what it reads and changes; every call logged; no raising its own
  rights.
- OpenAI, Anthropic or a local OpenAI-compatible model; keys encrypted; daily
  token limits per connection and per account; the usage by day (guests,
  schedules, people) in Logs -> AI usage.

### The Library (public packages)

- **Energy** - the energy field (PV, wind, batteries in groups, per-unit yield
  factors, strategies, island mode), the grid connection (day-ahead prices,
  limits), the energy ledger (the money by day and account, the day plan by
  prices and the forecast, similar days, tenants).
- **Heating** - heating control (heat pumps with staged starts, buffer tanks,
  rooms, SG-Ready from the ledger) and the heating planner (strategies against
  the prices and the sun).
- **Weather** - the station with the forecast.
- The AI analyzer, a threshold monitor example, the core's node types (heat
  pump, buffer tank, fan coil, power and grid meters, PV inverter, wind turbine,
  battery storage, weather node, alarm annunciator, control node, AI camera) and
  standalone devices.

### For target projects

`make new-project` - a project of its own on the core (its packages,
migrations, UI, AI manifests, its own guide pages merged into the guide);
`docs/CREATING_A_TARGET_PROJECT.md`.
