---
title: "Dispositivos"
description: "Los dispositivos: sus valores, modos, simulación, registro y control de heartbeat."
order: 2
---

![La página «Dispositivos»](screen:devices)

Cada dispositivo con su nodo, tipo, valor y la hora de lectura; los valores
atrasados se resaltan.

- **El valor** - en vivo (sin recargar); las unidades; en un dispositivo que
  puede controlar, su valor manual o comando.
- **Auto / Manual** - un recurso sigue a los procesos (Auto) o al valor de una
  persona (Manual); las reglas de seguridad rechazan una combinación
  prohibida.
- **La fila** - despliéguela para la información (backend, nombre y estado en
  EdgeX, capacidades, creado), los ajustes del valor, los medios (las imágenes
  de una cámara), el registro de datos y el control de heartbeat.
- **Simulado** - el valor de un dispositivo simulado se puede fijar en el
  sitio.
- **Grupos** - grupos de dispositivos para la vista de negocio.

![Un dispositivo desplegado - su información y sus ajustes](screen:devices-expanded)

## Los ajustes de un dispositivo

El botón de ajustes de la fila:

- **Nombre**; **Nodo** - el nodo al que pertenece (o ninguno: un dispositivo
  independiente);
- **ID físico** - su dirección en el bus o en EdgeX, para la unidad real;
- **Grupos de dispositivos** - los grupos de negocio en los que está;
- **Color de fondo cuando está activo** - cómo se iluminan su fila y su ficha al
  encenderse;
- **Simular** - si la simulación interpreta este dispositivo.

El dispositivo de una cámara tiene la pestaña **Medios**: la última imagen, las
guardadas, **Subir imagen** y **Eliminar imagen** (con todo lo guardado con
ella).
