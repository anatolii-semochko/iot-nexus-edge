---
title: "Connections and MCP"
description: "The model connections, the limits, and MCP access for external agents."
order: 4
---

Service -> Config -> AI: the model connections - OpenAI, Anthropic or an
OpenAI-compatible local server (Ollama, LM Studio, vLLM - the data stays on
site); the key is stored encrypted and never shown; an answer limit and a
daily token limit per connection; tokens per person a day (Users).

## MCP

The same tools for any MCP client (e.g. Claude Code): Streamable HTTP at
`/api/mcp`, with a bearer token made in Service -> Config -> AI -> MCP
access. A token is shown once; only its hash is stored.
