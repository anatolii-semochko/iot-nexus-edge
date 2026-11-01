---
title: "Betrieb"
description: "Nexus Edge betreiben - Voraussetzungen, der erste Start, die Einstellungen, die Hardware, Sicherungen und Updates."
order: 8
---

## Voraussetzungen

- Ein Linux-Rechner - für einen Standort genügt ein Rechner der Raspberry-Pi-Klasse;
- Docker mit Compose v2 - alles wird in Containern gebaut und betrieben.

## Der erste Start

```
cp .env.example .env
make up-all
```

Damit startet die Plattform (PostgreSQL mit TimescaleDB, Redis, RabbitMQ, der
Orchestrator, die API, das Messaging-Gateway, die UI) mit dem EdgeX-Kern und
dem Device-Service. Melden Sie sich als `admin` mit `ADMIN_DEFAULT_PASSWORD`
aus `.env` an und ändern Sie es sofort, wenn der Rechner von außen erreichbar
ist.

## Einstellungen

Alle Einstellungen stehen in `.env` (siehe `.env.example` - jeder Wert ist
kommentiert): die Ports, die Passwörter, die Zeitzone des Hosts (`TZ`), die
Grenzen (Upload-Größen, die Sprachen der Oberfläche), der
Verschlüsselungsschlüssel der KI, die Host-Befehle. Nichts ist fest
eingebaut.

## Hardware

Knoten am CAN-Bus brauchen den CAN-Adapter des Hosts am Device-Service;
Netzwerkknoten nutzen den MQTT-Broker. Solange ein Knoten nicht verdrahtet
ist, betreiben Sie ihn simuliert - Knoten -> seine Zeile -> simuliert.

## Sicherungen und Updates

- Service -> Datenbank -> **Systemstempel**: die Konfiguration (Geräte,
  Knoten, Prozesse, Benutzer, Gruppen) als Zustand speichern, herunterladen,
  anwenden oder wieder hochladen - mit vorheriger Kompatibilitätsprüfung.
- Protokolle: herunterladen oder bis zu einem Datum löschen.
- Ein Update: die neue Version holen und erneut `make up-all` - die
  Migrationen laufen beim Start der API; die Daten bleiben.
