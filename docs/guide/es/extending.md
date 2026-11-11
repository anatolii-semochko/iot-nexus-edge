---
title: "Ampliar"
description: "Sus propios dispositivos, nodos y procesos: un proyecto destino sobre el núcleo de Nexus Edge."
order: 7
---

El núcleo queda como está; un **proyecto destino** se construye sobre él -
sus propios paquetes (DNP), migraciones, comandos, tipos de proceso, UI y
soporte de IA - y sobre él se puede construir otro (p. ej. un proyecto sobre
los paquetes del acuario).

## Un proyecto nuevo

```
make new-project
```

pide el nombre visible y la carpeta (cualquiera: `.env` guarda dónde está el
núcleo) y genera el proyecto a partir de `templates/target-project/`: su
propio repositorio git, los archivos compose, la imagen de la UI, el
Makefile, `plugins/` y `migrations/` vacíos. Luego, en la carpeta nueva:

```
make up-all
```

## Lo que añade un proyecto

- **Tipos de dispositivo y nodo** - un paquete con su contrato, el perfil de
  dispositivo de EdgeX, reglas de seguridad y sus controles y simulador en la
  UI.
- **Tipos de proceso** - `make add-process-kind KIND=<un tipo plantilla>
  TARGET=<proyecto> [NEW_KIND=<nombre>]` copia una plantilla de proceso en
  `plugins/` del proyecto; el proceso recibe su esquema de configuración,
  comandos, estado, su escena y avatares para el Panel.
- **Migraciones** - datos iniciales y tablas, aplicados al arrancar la API.
- **UI** - el `ui/register.js` de un paquete registra sus paneles y
  componentes del Panel; sus textos se traducen en sus propios
  `ui/locales/`.
- **Soporte de IA** - el manifiesto de un paquete declara los tipos de
  trabajo de sus instancias y cuáles pueden ejecutarse por horario; sus
  prompts y herramientas.

## Traducciones

Los textos de la interfaz son claves en inglés en `t('...')`. Para código
nuevo:

```
node scripts/i18n-wrap.mjs <la carpeta ui de su paquete>
node scripts/i18n-check.mjs --write --plugins <su proyecto>/plugins
```

y luego rellene los archivos de idioma (`ui/locales/uk.json`, `de.json`,
`es.json`).

La guía completa: `docs/CREATING_A_TARGET_PROJECT.md` en el repositorio del
núcleo.
