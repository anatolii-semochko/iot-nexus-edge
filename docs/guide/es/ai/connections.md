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

## MCP: sus propios agentes

![Acceso MCP - los tokens, sus cuentas y niveles](screen:service-config-mcp)

Las mismas herramientas para cualquier cliente MCP (Claude Code, Claude Desktop,
un agente en una Raspberry Pi): Streamable HTTP en `/api/mcp` con un token
bearer. Servicio -> Configuración -> AI -> Acceso MCP -> **+ Token**:

- **Nombre** - el cliente, p. ej. "Claude Code - portátil". Un token por
  cliente: cada uno recibe su propia **cuenta de servicio** (`mcp-<nombre>` en
  Usuarios), sin contraseña; nunca inicia sesión, solo funciona su token.
- **Roles de su cuenta** - lo que puede leer y cambiar, y en qué objetos,
  exactamente como los roles de una persona (Usuarios -> Roles). El rol de un
  operador de energía solo le muestra los procesos de energía: los demás no los
  ve. Nunca se permite un rol con todos los permisos (Administrador); los roles
  se pueden cambiar después en Usuarios, como los de una persona.
- **Configuración / Control / Instalar** - qué pasa con un cambio que sus roles
  permiten: **Auto**, se aplica al momento y su cuenta figura como autor en los
  registros; **Confirmar**, una propuesta espera a una persona (Registros ->
  Propuestas de IA); **Apagado**, no se ofrece. Instalar (nodos, dispositivos y
  procesos nuevos) nunca es Auto. Un nivel cuyo permiso no dan los roles en
  ningún sitio queda apagado, se elija lo que se elija.

El token se muestra una vez, con el comando `claude mcp add ...` para
conectarse; solo se guarda su hash. Su fila: la cuenta y sus roles, los niveles
(se pueden cambiar ahí mismo), el último uso, activado, revocar (la cuenta se va
con él). Un agente nunca cambia los roles de nadie, tampoco los suyos, y nunca
acepta propuestas. Cada llamada suya, en Registros -> Llamadas MCP.
