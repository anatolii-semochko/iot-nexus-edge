---
title: "Su equipo"
description: "Cómo una máquina, un sensor o una instalación entera entra en Nexus Edge: de su tipo en la Biblioteca al hardware real."
---

Nexus Edge no pide sustituir lo que ya funciona. Una prensa, un compresor, una
bomba de calor o un acuario siguen como están; a su alrededor llegan los
sensores y los actuadores con los que el sistema los ve y los maneja, y un nodo
que habla por ellos. El camino es el mismo para una máquina que para una
instalación entera.

## El camino, en cinco pasos

1. **Su tipo en la Biblioteca.** Cada nodo y cada dispositivo tiene un tipo: lo
   que mide, lo que conmuta, sus límites, su imagen y su documentación
   (Biblioteca -> Nodos / Dispositivos). Los habituales ya están: un contador
   de energía, una bomba de calor, un aerogenerador, un nodo STM32 o ESP32 con
   sus entradas y salidas. Un tipo nuevo es un paquete (véase Ampliar).
2. **El nodo en el sistema.** Biblioteca -> el tipo -> **Añadir nodo**: un
   nombre, el nodo al que se conecta (el controlador de un edificio, un bus) o
   independiente, y sus dispositivos, cada uno con su **rol** (por él lo
   encuentra su proceso: heater, pump, meter). Un nodo nuevo empieza
   **virtual**: lo interpreta una simulación hasta que se conecta el hardware.
3. **El proceso que lo maneja.** Biblioteca -> un tipo de proceso -> **Añadir
   proceso**: calefacción, un campo de energía, la luz, un monitor de
   umbrales... Toma sus dispositivos por sus roles; sus ajustes dicen cómo
   funciona: horarios, límites, protecciones.
4. **Pruébelo en la simulación.** La página Simulador mueve los sensores
   virtuales (una temperatura, un nivel, una corriente); los procesos
   reaccionan como lo harán en la instalación, y el Panel, los registros y las
   alarmas lo muestran. El control es correcto antes de comprar o cablear nada.
5. **El hardware real.** Se montan los sensores y el nodo; el nodo recibe el
   firmware y se une a su bus (CAN, Modbus, MQTT, Ethernet). En la página
   Nodos, su interruptor **físico / simulado** lo pasa a la unidad real en
   marcha, nodo a nodo, mientras el resto de la instalación sigue en la
   simulación.

Los pasos 2 y 3 los puede hacer el asistente de IA: describa el equipo y él
propone los nodos, los dispositivos y los procesos (Instalar); una persona los
acepta en Registros -> Propuestas de IA.

## Lo que recibe la máquina

- **Un modelo**: sus lecturas, su estado y sus comandos en un solo lugar, igual
  para una máquina vieja que para una nueva.
- **Control**: horarios, lazos, planes según los precios o el tiempo; un comando
  que rompería una protección se rechaza antes de llegar a la máquina.
- **Seguridad en el nodo**: el nodo mantiene sus propios límites (un flotador,
  una temperatura máxima) incluso sin conexión con el servidor, y el servidor
  ve lo que ha pasado.
- **Historia y alarmas**: cada valor y cada comando con su autor; avisos y
  errores por niveles.
- **Energía y dinero**: con un contador, lo que consumió y lo que costó.
- **La IA**: lee la historia de la máquina y propone cambios dentro de los
  permisos que usted le dé.

## Su propio tipo, su propio bus

Si la Biblioteca no tiene un tipo para su máquina, o esta habla un protocolo
propio, un proyecto lo añade: el contrato y el perfil del dispositivo, sus
reglas de seguridad, sus mandos y su simulador en la interfaz (Ampliar). Una
máquina con su propio controlador en funcionamiento lo conserva: un nodo
adaptador lo lee y lo escribe (Modbus, una señal de 4-20 mA, un contacto seco),
y el sistema añade lo que le falta.

Los trabajos con tensión de red (230 / 400 V) los hace un electricista
autorizado; los nodos, los sensores y el control los pone el sistema.
