---
title: "Conexiones y MCP"
description: "Las conexiones a modelos, los límites y el acceso MCP para agentes externos."
order: 4
---

Servicio -> Configuración -> AI: las conexiones a modelos - OpenAI, Anthropic
o un servidor local compatible con OpenAI (Ollama, LM Studio, vLLM: los datos
se quedan en el sitio); la clave se guarda cifrada y nunca se muestra; un
límite de respuesta y un límite diario de tokens por conexión; tokens por
persona al día (Usuarios).

## MCP

Las mismas herramientas para cualquier cliente MCP (p. ej. Claude Code):
Streamable HTTP en `/api/mcp`, con un token bearer creado en Servicio ->
Configuración -> AI -> Acceso MCP. El token se muestra una vez; solo se guarda
su hash.
