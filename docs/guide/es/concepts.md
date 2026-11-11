---
title: "Conceptos"
description: "Nodos, dispositivos, procesos, la biblioteca, la simulación y los mensajes: las piezas de Nexus Edge."
order: 3
---

## Nodos y dispositivos

Un **dispositivo** es una cosa que mide o actúa: un sensor de temperatura, una
válvula, una bomba, un contador, un canal de luz. Un **nodo** es el módulo de
hardware que lleva dispositivos y habla con el bus: una placa de control, un
driver de luz, una estación meteorológica. Un nodo puede tener un nodo
**padre** (un módulo de una unidad mayor), y los nodos y dispositivos se
pueden agrupar en **grupos** para la vista de negocio (un edificio, un
acuario, un campo).

Cada dispositivo tiene un valor, la hora en que se leyó y, si se puede
comandar, un objetivo. Una lectura más antigua que el límite de su
dispositivo está **atrasada**.

## El bus y la pasarela

Los nodos hablan por un bus físico (hoy CAN, MQTT para nodos de red). Una
sola pasarela - EdgeX Foundry con el device-service de Nexus Edge - lleva cada
bus al mismo modelo, así que al resto del sistema no le importa por qué cable
llegó un valor. Un bus nuevo es un paquete de transporte nuevo.

## Físico y simulado

Cada nodo o dispositivo suelto es **físico** (el hardware real) o
**simulado** (lo representa un modelo). Se cambia en vivo: desarrollar y
probar sin hardware, mantener un sitio en marcha mientras se repara un nodo,
mostrar una demo. La insignia «Simulación» de la cabecera indica que algo está
simulado.

## Procesos

Un **proceso** es la lógica que gestiona el equipo: un campo energético, un
sistema de calefacción, el control de un acuario, un registrador de datos. El
orquestador ejecuta cada proceso en cada tic; cada uno tiene sus ajustes
(comprobados contra un esquema), su estado, sus comandos y su escena en el
Panel. Los **procesos de simulación** modelan lo que haría el equipo: una
batería que carga, el agua que se calienta.

Las **reglas de seguridad** pertenecen a los tipos de dispositivo: una
combinación físicamente prohibida (calentar y enfriar la misma zona) se
rechaza antes de llegar al hardware, la pida quien la pida.

## La biblioteca

Paquetes de dispositivos, nodos y procesos - **DNP**. La página «Biblioteca»
lista los instalados con su documentación. Un sistema se compone de ellos; un
proyecto destino añade sus propios paquetes sin cambiar el núcleo.

## Avisos, errores y mensajes (WEM)

Los procesos y dispositivos generan **avisos** y **errores** y publican
**mensajes**. Cada uno tiene un nivel y un grupo: los niveles deciden el
sonido y los LED del nodo del operador; los grupos, quién los ve. Los iconos
de la cabecera muestran los activos; Registros guarda el historial.

## Datos

Cada valor puede registrarse en series temporales (por período, al cambiar,
con banda muerta), agregadas por hora y día para gráficos largos. Los
comandos y cambios se registran con su autor: una persona, un proceso, la IA.
