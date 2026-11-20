---
title: "Fábrica"
description: "Un taller de metal de la barra al palé: las zonas, el carro de la línea de anodizado, el CNC, la química y las aguas residuales."
order: 4
---

![El plano del taller de metal](screen:factory-shop)

El módulo de fábrica gestiona un pequeño taller de metal que fabrica piezas de
aluminio de la barra al palé: las piezas en bruto se cortan, se mecanizan en
CNC, se anodizan en una línea con carro automático, se secan, se controlan y
se embalan. Su panel (Panel -> Fábrica -> Taller de metal) es el plano del
taller con siete zonas. Cada zona tiene su tarjeta: un punto de color muestra
el estado y al lado están las cifras que importan en ese momento. La tarjeta
abre la ventana de la zona con su imagen, sus cifras, una tabla y las curvas
del día. Por qué un taller se automatiza así y cuánto vale: la sección
[Fábrica](/es/solutions/factory/) del sitio.

Las imágenes se mueven con el taller. El carro traslada los bastidores y
sobre cada bastidor un anillo cuenta su paso. Las puertas del CNC se levantan
para la preparación, el cabezal trabaja tras el cristal y la baliza muestra
el estado. La sierra avanza la barra y corta, y en la química unos puntos
recorren las tuberías mientras trabajan las bombas.

## La línea de anodizado

![La ventana de la línea de anodizado](screen:factory-line)

Ocho baños según la receta: desengrase, enjuague, decapado, enjuague,
anodizado, enjuague, coloreado, sellado. La ventana muestra la temperatura de
cada baño (una flecha para calentar o enfriar) y el bastidor que contiene con
el temporizador de su paso. Debajo están la potencia de la línea, la
corriente, la tensión y la densidad del rectificador, la capa del bastidor en
el baño de anodizado, los bastidores, piezas y kWh del día, la tabla de los
baños y las curvas.

El carro ejecuta cada movimiento según un horario: solo se desplaza con el
bastidor arriba, y solo lo sube o lo baja cuando está sobre un baño. Llega a
un bastidor `leadS` segundos (10 por defecto) antes de que acabe su paso y
espera sobre el baño. La corriente del rectificador sigue el área del
bastidor y la densidad; el proceso calcula el espesor de la capa a partir de
los amperios-hora.

## Mecanizado CNC y sierra

![La ventana del mecanizado CNC](screen:factory-cnc)

De cada máquina se ve el estado (en marcha, preparación, espera, cambio de
herramienta), el programa, cuántas piezas del trabajo están hechas, el ciclo
y la vida que le queda a la herramienta, el OEE del día y, en curvas, la
potencia y las piezas. La sierra corta las piezas en bruto para la máquina
que tiene menos. Los metros de barra se cuentan y, por debajo del mínimo,
llega una entrega.

## Química y aguas residuales

![La ventana de química y aguas residuales](screen:factory-chem)

De cada depósito de concentrado se ve el nivel, el consumo diario y para
cuántos días queda. Por debajo del nivel de pedido llega un aviso, y un
mensaje crítico llega antes de que se detenga la dosificación. Cada bastidor
que se saca de un baño arrastra algo de solución; cuando la concentración sale
de su rango, la bomba dosificadora repone el concentrado. Las aguas
residuales: el rebose de los enjuagues va al depósito de recogida, la bomba
de trasvase trabaja según sus niveles, las bombas de sosa y de ácido mantienen
el pH de la neutralización, el filtro prensa exprime el lodo del decantador y
después viene el vertido. Hay avisos para el nivel del depósito de recogida,
el pH del vertido y la tela de la prensa.

## Energía e IA

El taller es una de las cargas del sitio: su electricidad entra en el balance de Energy Field a través de su
propio contador, Energy Ledger lleva su cuenta y el panel muestra el pico del día, la mayor media de 15
minutos, como la factura la red. La línea calienta sus baños según el precio de la electricidad: en las horas
baratas cada baño calentado sube al borde superior de su rango (el baño de anodizado, que se enfría, al
inferior), y en las caras se mantiene en el borde opuesto. El rango nunca se abandona; la ventana de la línea
muestra el modo.

El asistente de IA conoce todo el taller: el estado del turno y lo que viene (cuándo acaban los trabajos y
empieza una preparación, los cambios de herramienta, qué material y qué productos químicos hay que pedir), todo
el recorrido de un lote de la línea al control y lo que no va bien ahora, con sus cifras. Pídale un informe de
turno, un informe de lote o la causa de un aviso.

## Los procesos

El taller se compone de procesos, cada uno con sus ajustes (Procesos -> el
proceso -> su botón de ajustes):

- **anodizing-line** - los baños (sus nodos, funciones, volúmenes, consignas),
  la receta (baño y minutos de cada paso), la línea (`pitchMm`, `speedMmS`,
  `liftS`, `dripS`, `leadS`, `loadEveryMin`, el área y las piezas de un
  bastidor, la densidad de corriente);
- **machining** - los materiales, los trabajos (programa, pieza, material,
  pieza en bruto, cantidad, ciclo, preparación), las máquinas, la sierra, el
  turno;
- **chem-wastewater** - los depósitos, la dosificación (baño, su depósito,
  objetivo y rango, concentrado, bomba, arrastre), los niveles, el rango de pH,
  el decantador y la prensa del tratamiento de aguas residuales;
- **drying-oven**, **quality-control**, **shop-utilities** (compresor,
  enfriadora, agua desmineralizada) y **metal-shop** - el resumen del taller:
  su electricidad al precio de la red y los lotes en curso.
