---
title: "Extending"
description: "Your own devices, nodes and processes - a target project on the Nexus Edge core."
order: 7
---

The core stays as it is; a **target project** builds on it - its own
packages (DNP), migrations, commands, process kinds, UI and AI support - and
can build on another target project in turn (e.g. a project on top of the
aquarium packages).

## A new project

```
make new-project
```

asks for the display name and the folder (anywhere - `.env` records where the
core is), and generates the project from `templates/target-project/`: its own
git repository, the compose files, the UI image, the Makefile, empty
`plugins/` and `migrations/`. Then, in the new folder:

```
make up-all
```

## What a project adds

- **Device and node types** - a package with its contract, the EdgeX device
  profile, safety rules, and its controls and simulator in the UI.
- **Process kinds** - `make add-process-kind KIND=<a template kind>
  TARGET=<project> [NEW_KIND=<name>]` copies a process template into the
  project's `plugins/`; the process gets its config schema, commands, state,
  its scene and avatars for the Dashboard.
- **Migrations** - seed data and tables, applied at the API's start.
- **UI** - a package's `ui/register.js` registers its panels and Dashboard
  components; its texts are translated in its own `ui/locales/`.
- **AI support** - a package's manifest declares the work types its instances
  get and which of them may run on a schedule; its prompts and tools.

## Translations

The interface's texts are English keys in `t('...')`. For new code:

```
node scripts/i18n-wrap.mjs <your package's ui folder>
node scripts/i18n-check.mjs --write --plugins <your project>/plugins
```

then fill the language files (`ui/locales/uk.json`, `de.json`, `es.json`).

The full guide - `docs/CREATING_A_TARGET_PROJECT.md` in the core's repository.
