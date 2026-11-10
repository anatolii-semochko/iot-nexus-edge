---
title: "Verbindungen und MCP"
description: "Die Modellverbindungen, die Limits und der MCP-Zugriff für externe Agenten."
order: 4
---

Service -> Konfiguration -> AI: die Modellverbindungen - OpenAI, Anthropic
oder ein OpenAI-kompatibler lokaler Server (Ollama, LM Studio, vLLM - die
Daten bleiben vor Ort); der Schlüssel wird verschlüsselt gespeichert und nie
angezeigt; ein Antwortlimit und ein Tageslimit an Tokens pro Verbindung;
Tokens pro Person und Tag (Benutzer).

## MCP - Ihre eigenen Agenten

![MCP-Zugriff - die Tokens, ihre Konten und Stufen](screen:service-config-mcp)

Dieselben Werkzeuge für jeden MCP-Client (Claude Code, Claude Desktop, ein Agent
auf einem Raspberry Pi): Streamable HTTP unter `/api/mcp` mit einem
Bearer-Token. Service -> Konfiguration -> AI -> MCP-Zugriff -> **+ Token**:

- **Name** - der Client, z. B. "Claude Code - Laptop". Ein Token pro Client:
  Jeder bekommt sein eigenes **Dienstkonto** (`mcp-<name>` unter Benutzer) -
  ohne Passwort, es meldet sich nie an, nur sein Token wirkt.
- **Rollen seines Kontos** - was es lesen und ändern darf und auf welchen
  Objekten, genau wie die Rollen einer Person (Benutzer -> Rollen). Die Rolle
  eines Energiebetreibers zeigt ihm nur die Energieprozesse - die anderen sieht
  es nicht. Eine Rolle mit allen Rechten (Administrator) ist nie erlaubt; die
  Rollen lassen sich später unter Benutzer ändern wie bei einer Person.
- **Konfiguration / Steuerung / Installieren** - was mit einer Änderung
  geschieht, die seine Rollen erlauben: **Auto** - sofort angewendet, sein Konto
  ist in den Protokollen der Urheber; **Bestätigen** - ein Vorschlag wartet auf
  eine Person (Protokolle -> KI-Vorschläge); **Aus** - nicht angeboten.
  Installieren (neue Knoten, Geräte, Prozesse) ist nie Auto. Eine Stufe, deren
  Recht die Rollen nirgends geben, ist aus, egal was gewählt ist.

Das Token wird einmal angezeigt, mit dem Befehl `claude mcp add ...` zum
Verbinden; gespeichert wird nur sein Hash. Seine Zeile: das Konto und seine
Rollen, die Stufen (dort änderbar), die letzte Nutzung, aktiviert, widerrufen
(das Konto geht mit). Ein Agent kann nie jemandes Rollen ändern, auch die eigenen
nicht, und nimmt nie Vorschläge an. Jeder seiner Aufrufe - Protokolle ->
MCP-Aufrufe.
