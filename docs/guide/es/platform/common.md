---
title: "Elementos comunes"
description: "Lo que funciona igual en todas las páginas: tablas, filtros, listas largas, ventanas, gráficos, permisos, fechas."
---

Todas las páginas de Nexus Edge se construyen con las mismas piezas. Lo que se
describe aquí vale en todas partes; las demás páginas cuentan solo lo suyo.

## Tablas y filtros

![Una tabla con sus filtros - Registros](screen:common-table)

- **La fila de filtros** sobre una tabla: listas (un dispositivo, una acción,
  una persona), una **búsqueda** (espera a que termine de escribir y entonces
  filtra), un periodo **Desde / Hasta**. El botón amarillo de **restablecer**, a
  la derecha, lo borra todo de una vez.
- **Lo que configura se queda**: los filtros, la búsqueda, el tamaño de página,
  la pestaña abierta y las filas desplegadas se guardan en este navegador; al
  recargar o volver, la página está como la dejó. Solo el número de página
  vuelve a empezar.
- **Las páginas** bajo la tabla: el tamaño de página, "X-Y de Z", los números
  de página.
- **Una fila desplegable** (una flecha al principio) muestra sus detalles debajo;
  la flecha de la cabecera despliega o pliega todas las filas de la página.
- **Los colores de una fila**: rojo, hay un error activo; amarillo, un aviso; un
  tono azul, simulado (solo para quien puede ver la simulación).

## Listas largas: buscar por un fragmento de la palabra

![Una lista larga con su búsqueda - los roles de una persona](screen:common-checklist)

Cada lista larga de un formulario (roles, dispositivos, salas, tarjetas) tiene
una búsqueda encima: escriba cualquier parte de una palabra y "pump" encontrará
tanto "Heat pump 03" como "pumps". **Solo seleccionados** deja ver únicamente lo
marcado; el contador dice cuántos hay seleccionados de cuántos.

## Ventanas

![La ventana de un dispositivo - Estado, Modelo, Foto, Mapa](screen:common-unit-popup)

- **La ventana de un dispositivo o de una sala** se abre desde el Panel, las
  escenas y las tablas. Sus pestañas: **Estado** (la imagen en vivo, las
  lecturas, los gráficos y los mandos), **Modelo** (el tipo de nodo de la
  Biblioteca: su imagen y sus datos), **Foto** (la unidad real, si la tiene),
  **Mapa** (dónde está, si se ha colocado). La pestaña que no tiene nada que
  mostrar no aparece.
- **Tamaño**: una ventana con pestañas o gráficos ocupa toda la ventana del
  navegador y no cambia de tamaño al pasar de una pestaña a otra, así que nada
  salta; el espacio va primero a los gráficos, luego a la foto, luego al mapa.
  Una ventana pequeña (una pregunta, un campo) y la que se abre desde otra son
  más pequeñas.
- **El botón de IA** en la cabecera de la ventana pregunta al asistente
  justamente por esa unidad: la conversación empieza con ella como tema.
- **Las ventanas de ajustes** (los de un proceso, los de una tarjeta) se guardan
  con **Guardar**; **Cancelar** o la cruz cierran sin cambios. Si otra persona
  guardó mientras tanto los mismos ajustes, el guardado se rechaza con una nota:
  vuelva a abrir para ver su versión.

## Gráficos

- En una ventana, los gráficos ocupan el espacio que deja la ventana: cada uno
  tan ancho como el diálogo y, juntos, tan altos como este permita; en el
  teléfono, uno debajo de otro.
- La **etiqueta** nombra el gráfico y la **leyenda**, cada línea; un límite con
  nombre (un umbral, un objetivo) tiene su propia línea con leyenda.
- Un valor que va en los dos sentidos (la carga y la descarga de una batería, la
  compra y la venta a la red) tiene el cero en el medio y el mismo rango hacia
  arriba y hacia abajo.
- Los valores son la historia guardada, no una estimación: un hueco en una línea
  es un hueco en los datos (el dispositivo estaba apagado o no se leyó).

## Permisos: lo que ve y lo que puede hacer

- Las páginas, pestañas o botones para los que no tiene permiso **no aparecen**.
- Cada cambio (un ajuste, un comando, una nota) queda en los registros con su
  nombre y el rol con el que actúa.
- Con varios roles actúa en uno a la vez: cámbielo en el menú bajo su nombre
  (Usuarios -> Roles explica los roles).

## Fechas, cifras y unidades

- **Las fechas** se leen como se dicen: "Hoy, 08:15", "Ayer, 22:30", y después
  la fecha.
- **Los valores clave** que uno busca primero (potencia, energía, dinero,
  temperatura) son más grandes y más gruesos que el texto que los rodea, con su
  unidad (kW, kWh, EUR, ct/kWh, °C).
- El **idioma** y el **tema** de la interfaz (claro, oscuro, como el sistema)
  son suyos: los guarda su perfil (Primeros pasos -> Perfil).
