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

## MCP

Dieselben Werkzeuge für jeden MCP-Client (z. B. Claude Code): Streamable HTTP
unter `/api/mcp`, mit einem Bearer-Token aus Service -> Konfiguration -> AI ->
MCP-Zugriff. Ein Token wird einmal angezeigt; nur sein Hash wird gespeichert.
