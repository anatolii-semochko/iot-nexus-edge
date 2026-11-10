---
title: "Calefacción"
description: "Bombas de calor, depósitos, fancoils y salas: el control de calefacción y el planificador."
order: 2
---

![Calefacción](screen:heating-overview)

## Control de calefacción

Un sistema de calefacción son sus bombas de calor, los depósitos
(acumulación de calor), los fancoils y las salas. La escena muestra el aire
exterior, las bombas de calor, la acumulación y las salas, con los flujos de
calor entre ellos; un bloque abre sus detalles y gráficos.

- **El modo** - calefacción, refrigeración o automático según la temperatura
  exterior (calentar por debajo de la primera, enfriar por encima de la
  segunda; entre ambas mantiene lo que hacía); apagado.
- **Arranques escalonados** - solo funcionan las bombas que necesitan los
  depósitos; arranca primero la de menos horas (desgaste repartido) o según su
  prioridad; arrancan y paran una a una, nunca todas las corrientes de
  arranque a la vez.
- **Los depósitos** - dos intercambiadores (entrada desde las bombas, salida
  a las salas), la estratificación, el calor acumulado por encima de la
  temperatura útil mínima.
- **Las salas** - cada una con su consigna, su fancoil y su válvula; una sala
  cerrada por una nota del día se baja.
- **La señal del Energy Ledger (SG-Ready)** - cuando la energía es cara, las
  bombas esperan y los depósitos sostienen las salas; cuando es barata o el
  sol da más de lo que toma el sitio, los depósitos acumulan más calor.

![Los ajustes de una calefacción](screen:config-heating)

Los ajustes de una calefacción, en Procesos -> su calefacción -> el botón
Ajustes del proceso: los grupos (bombas de calor, depósitos, fancoils) y qué
unidad está en cada uno; el modo automático (calentar por debajo de, enfriar por
encima de, °C); el orden de arranque de las bombas de calor (automático, primero
las de menos horas, o por prioridad), la pausa entre arranques, las temperaturas
de arranque y de parada; los rangos de los depósitos (bueno desde, aceptable
desde); la reducción de una sala cerrada (K); el COP en la tarjeta.

## El planificador de calefacción

El planificador hace el plan anticipado de las bombas de calor, franja a
franja, para cada sistema - el calor, las unidades, la reserva, el margen de
confort de las salas - frente a los precios, el sol y la señal del Ledger, y
muestra lo que ahorra frente al control simple por banda.

| Estrategia | Qué hace |
|---|---|
| Menor coste | El calor se produce cuando la energía es más barata; en las horas caras se usa el margen de confort de las salas |
| Suave | Los menos arranques y la menor potencia posibles: se ahorra desgaste y picos |
| Confort | Las salas siempre en su consigna: solo los depósitos cubren las horas caras |
| El sol | El excedente solar se acumula como calor: los depósitos se llenan más mientras brilla |

La estrategia es **fija** (la elige usted) o **la más barata**: en cada plan,
la que menos electricidad usa. La IA puede hacer el plan de calefacción del
día según un horario.
