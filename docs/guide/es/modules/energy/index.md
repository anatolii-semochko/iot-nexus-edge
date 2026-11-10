---
title: "Energía"
description: "El campo energético, la conexión a la red y el Energy Ledger: estrategias, el plan, la revisión y lo ahorrado."
order: 1
---

![Energía](screen:energy-overview)

Tres paquetes trabajan juntos:

- **Energy Field** - la generación del sitio (bloques FV, aerogeneradores),
  las baterías, el consumo y el punto de red: la escena en vivo y los
  controles básicos.
- **Grid Connection** - los precios (de mercado o fijos, zonas tarifarias),
  los límites de importación y exportación, la calidad de la conexión.
- **Energy Ledger** - el plan de las próximas horas, las estrategias, la
  revisión de cada día, las cuentas y lo ahorrado.

## La escena

La escena energética muestra los flujos entre la generación, la red, las
baterías y el consumo, con la potencia en cada flecha y las cifras de hoy.
Haga clic en un bloque para ver detalles y el gráfico de hoy. Los colores de
los precios: verde - nos conviene, amarillo - medio, rojo - no (por los
cuartos de los precios de las próximas 24 horas).

Los controles (para quien pueda controlar):

- **Auto / Manual / Isla** - las baterías siguen el plan, funcionan a la
  potencia que fije, o el sitio funciona sin red con su generación y sus
  baterías;
- **Conectado a la red**, **Venta permitida**, la **reserva para cortes** (la
  carga guardada para un corte) - cada cambio durante un tiempo (20 minutos,
  una hora, cuatro horas, hasta el final del día, hasta que se cambie), con un
  motivo opcional; el plan puede adaptarse.

![Los ajustes del campo de energía](screen:config-energy-field)

Los ajustes del campo, en Procesos -> Energy Field -> el botón Ajustes del
proceso: los grupos (generación o baterías) y qué unidad está en cada uno; los
rangos de carga de las baterías (bueno desde, aceptable desde, carga mínima y
máxima); los estados críticos, en rojo en la escena (sobre el plan en % o kW,
sobre el nominal). La estrategia, en el panel del campo (Auto / Manual / Isla,
la reserva); el factor de rendimiento de una unidad, en su ventana de la escena.

## Notas del día

Las notas cuentan al plan cómo es el día: un festivo o un fin de semana
laborable (el consumo como en un día libre o laborable), un corte de red (sin
importación ni exportación en su ventana: las baterías se cargan antes), un
mantenimiento (unidades fuera, menos potencia de batería), una sala cerrada.
Las notas próximas se ven en la escena y en el plan.
