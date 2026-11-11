---
title: "Connections and MCP"
description: "The model connections, the limits, and MCP access for external agents."
order: 4
---

Service -> Config -> AI: the model connections - OpenAI, Anthropic or an
OpenAI-compatible local server (Ollama, LM Studio, vLLM - the data stays on
site); the key is stored encrypted and never shown; an answer limit and a
daily token limit per connection; tokens per person a day (Users).

## MCP - your own agents

![MCP access - the tokens, their accounts and levels](screen:service-config-mcp)

The same tools for any MCP client (Claude Code, Claude Desktop, an agent on a
Raspberry Pi): Streamable HTTP at `/api/mcp` with a bearer token. Service ->
Config -> AI -> MCP access -> **+ Token**:

- **Name** - the client, e.g. "Claude Code - laptop". One token per client:
  each gets its own **service account** (`mcp-<name>` in Users) - no password,
  it never signs in, only its token works.
- **Roles of its account** - what it may read and change, and on which
  objects, exactly as a person's roles (Users -> Roles). An energy operator's
  role shows it the energy processes only - the others it doesn't see. A role
  with every right (Administrator) is never allowed; the roles can be changed
  later in Users, as a person's.
- **Config / Control / Install** - what happens with a change its roles allow:
  **Auto** - applied at once, its account the author in the logs; **Confirm** -
  a proposal waits for a person (Logs -> AI Proposals); **Off** - not offered.
  Install (new nodes, devices, processes) is never Auto. A level its roles
  hold nowhere is off whatever is set.

The token is shown once, with the `claude mcp add ...` command to connect;
only its hash is stored. Its row: the account and its roles, the levels (they
can be changed there), the last use, enabled, revoke (the account goes with
it). An agent can never change anyone's roles, its own included, and never
accepts proposals. Every call it makes - Logs -> MCP calls.
