---
title: "La luz"
description: "La luz por Wh al día - el control, los editores de espectro, curva, día, semana, mes y año, la prueba rápida."
order: 1
---

La mayoría de los controladores de luz fijan una potencia y un horario; la
luz que el acuario recibe de verdad en un día depende entonces de la curva,
el espectro y la estación - y suavizar el día la reduce sin que se note.
Aquí el punto de partida es la **energía objetivo por día (Wh/D)**: todo lo
demás se calcula a partir de ella.

Todo lo que sigue está en el acuario: **Service - Main Light** (el botón
Service del panel del acuario); cada luminaria tiene su propia biblioteca
de plantillas.

## Los niveles

- **Perfiles de espectro** - la parte de cada canal;
- **curvas del día** - la forma del día;
- **perfiles del día** - una curva pintada con espectros, periodo a periodo;
- **perfiles de semana, mes y año** - qué día luce cuándo: las estaciones;
- una plantilla está **activa**; el sistema la escala para que el día dé
  exactamente el objetivo Wh/D, conservando el espectro y la forma;
- la **prueba rápida** reproduce cualquier plantilla en la luminaria en
  segundos.

## Control

![El control de la luz](screen:aq-light-control)

- **Plantilla activa** - su tipo y la plantilla; el botón de encendido
  apaga solo AUTO (el modo manual y la prueba siguen).
- **Prueba rápida** - una duración en segundos y el botón de inicio.
- **El marco** - el modo (AUTO, MANUAL, TEST, OFF), **Wh/D**, **Max** (el
  pico de hoy - plantas / todo), el reloj del servidor, la potencia actual
  de los canales de plantas y de toda la luz.
- **El gráfico** - la banda de color del día y las curvas de potencia: toda
  la luz (amarilla), los canales de plantas (verde); la línea roja - ahora.

Si parpadea Wh/D, la plantilla activa no alcanza el objetivo sin desplazar
el espectro; si parpadea la plantilla, uno de sus periodos recorta un canal.
En el Dashboard el panel del acuario muestra la misma luz como una franja
compacta sobre el acuario.

## Las tablas de plantillas

Cada nivel es una tabla: **Preview**, **Smooth** (suave o en bruto),
**Max** (potencia pico), **Total** (Wh al día), **Max Total** (lo máximo sin
recortar un canal) y los botones predeterminada (estrella), borrar, prueba,
desplegar (el editor). Un contador en la pestaña muestra las plantillas en
conflicto.

## Perfiles de espectro

![Las plantillas de espectro](screen:aq-light-spectrum)

![El editor de espectro - Sunny Day](screen:aq-light-spectrum-edit)

![El editor de espectro - Tropical Sun](screen:aq-light-spectrum-edit-2)

Nombre, icono, descripción, **potencia base** y la **parte** de cada canal
principal; los canales de plantas están marcados. La demo trae trece, de la
luz de luna a la tormenta.

## Curvas del día

![Las curvas del día](screen:aq-light-curves)

![El editor de curvas - Summer Day](screen:aq-light-curves-edit)

![El editor de curvas - Siesta](screen:aq-light-curves-siesta)

La potencia cada **30 o 60 minutos**, arrastrada en el gráfico o escrita;
**Smooth** suaviza los escalones, **Raw** los conserva. Todas las curvas
comparten una escala fija - la dosis la da el objetivo Wh/D, la curva da la
forma.

## Perfiles del día

![Los perfiles del día](screen:aq-light-day)

![El editor del perfil del día - Summer Day](screen:aq-light-day-edit)

![El editor del perfil del día - Siesta](screen:aq-light-day-siesta)

Un perfil del día pinta una curva con espectros: cada **periodo** empieza a
su hora. El perfil **Siesta** de la demo: luz de luna, amanecer, una mañana
soleada para las plantas (9-13 h), una siesta nublada de tres horas, una
tarde soleada (16-20 h), atardecer, noche de luna - el día 4-3-4.

## Semana, mes, año - las estaciones

![El perfil de semana](screen:aq-light-week)

![El perfil de mes](screen:aq-light-month)

![El perfil de año](screen:aq-light-year)

**Semana** - un perfil del día por día de la semana (*Work week & weekend*:
Siesta los laborables, Demo Day el fin de semana); **mes** - periodos desde
un día del mes (*Algae break*); **año** - periodos desde una fecha
(*Seasons*: un día corto de invierno, uno largo de verano). Una estación
cambia la forma del día, no su dosis: un día más corto con la misma dosis
necesita más potencia - si la luminaria no la da, el sistema lo indica.

## El objetivo - Wh al día

![Los parámetros del acuario](screen:aq-settings-parameters)

La energía de luz del día está en **Settings - Parameters** (Wh/D); cada
plantilla la sigue al instante.
