---
title: "Operations"
description: "Running Nexus Edge - requirements, the first start, the settings, the hardware, backups and updates."
order: 8
---

## Requirements

- A Linux machine - a Raspberry Pi class computer is enough for a site;
- Docker with Compose v2 - everything builds and runs in containers.

## The first start

```
cp .env.example .env
make up-all
```

This starts the platform (PostgreSQL with TimescaleDB, Redis, RabbitMQ, the
orchestrator, the API, the messaging gateway, the UI) with the EdgeX core and
the device-service. Sign in as `admin` with `ADMIN_DEFAULT_PASSWORD` from
`.env`, and change it at once if the machine is reachable from elsewhere.

## Settings

All settings are in `.env` (see `.env.example` - every value has a comment):
the ports, the passwords, the host's time zone (`TZ`), the limits (upload
sizes, the interface's languages), the AI's encryption key, the host commands.
No setting is hard-coded.

## Hardware

Nodes on the CAN bus need the host's CAN adapter attached to the
device-service; network nodes use the MQTT broker. Until a node is wired, run
it simulated - Nodes -> its row -> simulated.

## Backups and updates

- Service -> Database -> **System stamps**: save the configuration (devices,
  nodes, processes, users, groups) as a state, download it, apply or upload
  one back - with a compatibility check first.
- Logs: download them, or clear them up to a date.
- An update: pull the new version and `make up-all` again - the migrations run
  at the API's start; the data stays.
