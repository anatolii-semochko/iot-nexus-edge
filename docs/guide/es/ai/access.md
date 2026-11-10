---
title: "Niveles de acceso"
description: "Off, Confirm y Auto: qué puede cambiar el asistente y quién decide."
order: 2
---

![Las instancias - Servicio -> Configuración -> AI](screen:service-config-ai)

Servicio -> Configuración -> AI -> las instancias: el asistente de todo el
sistema y uno por cada instancia de módulo (un campo de energía, una
calefacción, un acuario). Una fila:

- **Conexión** - el modelo con el que habla; **- (desact.)** - el asistente está
  apagado para esta instancia: no hay conversaciones y sus ejecuciones
  programadas se saltan;
- **Lectura** - puede leer el sistema: estados, registros, series,
  configuraciones, documentación;
- **Configuración** - los ajustes de los procesos; **Control** - comandos y
  valores manuales; **Instalar** - paquetes, nodos, dispositivos (solo la
  instancia de todo el sistema);
- **Informe** - puede escribir informes y propuestas a los desarrolladores;
- **Registros** - las conversaciones se registran completas (el prompt de
  sistema, cada llamada a una herramienta y su resultado);
- **Calendario** - sus ejecuciones programadas.

Cada área de cada instancia tiene un nivel:

- **Off** - el asistente no la toca;
- **Confirm** - propone; una persona con derecho acepta o rechaza cada cambio
  (la tarjeta de la propuesta muestra qué y por qué);
- **Auto** - aplica el cambio él mismo, como la cuenta `ai-agent`; cada
  cambio queda registrado con su autor.

Un cliente MCP tiene sus niveles en su propio token y sus permisos en los roles
de su propia cuenta (Conexiones y MCP).

Los roles limitan lo que una persona - y el asistente que trabaja para ella -
puede ver y hacer.

