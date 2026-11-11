---
title: "Estrategias"
description: "Las estrategias del Energy Ledger, cómo se elige y propone una, y cuándo se rehace el plan."
order: 1
---

El Ledger planifica las baterías en franjas de 15 minutos frente a los
precios del día siguiente y los pronósticos:

| Estrategia | Qué hace |
|---|---|
| Menor coste | Carga cuando la energía es barata o gratis y la devuelve cuando es cara |
| Autosuficiencia | Lo menos posible de la red: sin cargar desde la red |
| Reserva | Las baterías altas: listas para un corte (p. ej. antes de una tormenta) |
| Recorte de picos | La importación bajo el límite de pico: el cargo por potencia de una empresa |
| Ventas | La energía almacenada se vende solo por encima del umbral de precio |

La estrategia es **fija** (la elige usted) o se elige por **días similares**:
cada mañana, y cuando cambian las notas del día, el Ledger toma la estrategia
que fue mejor en los días registrados más parecidos: el tiempo, los precios,
el tipo de día, la estación. No hace falta IA para ello.

Cuando los nuevos precios del día siguiente hacen que otra estrategia sea más
barata por encima del umbral, se **propone**: se aplica en el acto o espera su
aceptación, según el nivel de acceso de IA del Ledger (Auto / Confirm / Off).

El plan se rehace cada pocos minutos, con precios nuevos, al cambiar las
notas del día y cuando la carga de las baterías se aleja del plan.

