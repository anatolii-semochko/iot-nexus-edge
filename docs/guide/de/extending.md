---
title: "Erweitern"
description: "Eigene Geräte, Knoten und Prozesse - ein Zielprojekt auf dem Kern von Nexus Edge."
order: 7
---

Der Kern bleibt, wie er ist; ein **Zielprojekt** baut darauf auf - eigene
Pakete (DNP), Migrationen, Befehle, Prozessarten, UI und KI-Unterstützung -
und darauf kann wiederum ein weiteres aufbauen (z. B. ein Projekt auf den
Aquarium-Paketen).

## Ein neues Projekt

```
make new-project
```

fragt nach dem Anzeigenamen und dem Ordner (beliebig - `.env` hält fest, wo
der Kern liegt) und erzeugt das Projekt aus `templates/target-project/`: ein
eigenes Git-Repository, die Compose-Dateien, das UI-Image, das Makefile, leere
`plugins/` und `migrations/`. Dann im neuen Ordner:

```
make up-all
```

## Was ein Projekt hinzufügt

- **Geräte- und Knotentypen** - ein Paket mit Vertrag, EdgeX-Geräteprofil,
  Sicherheitsregeln und seinen Bedienelementen und dem Simulator in der UI.
- **Prozessarten** - `make add-process-kind KIND=<eine Vorlagenart>
  TARGET=<Projekt> [NEW_KIND=<Name>]` kopiert eine Prozessvorlage in
  `plugins/` des Projekts; der Prozess erhält sein Konfigurationsschema,
  Befehle, Zustand, seine Szene und Avatare für das Dashboard.
- **Migrationen** - Startdaten und Tabellen, beim Start der API angewendet.
- **UI** - `ui/register.js` eines Pakets registriert seine Panels und
  Dashboard-Komponenten; seine Texte werden in den eigenen `ui/locales/`
  übersetzt.
- **KI-Unterstützung** - das Manifest eines Pakets deklariert die
  Arbeitsarten seiner Instanzen und welche davon nach Zeitplan laufen dürfen;
  seine Prompts und Werkzeuge.

## Übersetzungen

Die Texte der Oberfläche sind englische Schlüssel in `t('...')`. Für neuen
Code:

```
node scripts/i18n-wrap.mjs <der ui-Ordner Ihres Pakets>
node scripts/i18n-check.mjs --write --plugins <Ihr Projekt>/plugins
```

dann die Sprachdateien füllen (`ui/locales/uk.json`, `de.json`, `es.json`).

Die vollständige Anleitung - `docs/CREATING_A_TARGET_PROJECT.md` im
Repository des Kerns.
