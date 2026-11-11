---
title: "Your equipment"
description: "How a machine, a sensor or a whole site comes into Nexus Edge - from its type in the Library to the real hardware."
order: 3
---

Nexus Edge does not ask to replace what already works. A press, a compressor,
a heat pump or an aquarium stays as it is; around it come the sensors and the
actuators the system needs to see it and act on it, and a node that speaks for
them. The same path holds for one machine and for a whole site.

## The path - five steps

1. **Its type in the Library.** Every node and device has a type: what it
   measures, what it switches, its limits, its picture and its documentation
   (Library -> Nodes / Devices). A common one is already there - a power
   meter, a heat pump, a wind turbine, an STM32 or ESP32 node with its
   inputs and outputs. A new one is a package (see Extending).
2. **The node in the system.** Library -> the type -> **Add node**: a name, the
   node it plugs into (a building's controller, a bus) or standalone, and its
   devices - each with its **role** (how its process finds it: heater, pump,
   meter). A new node starts **virtual** - a simulation plays it until the
   hardware is wired.
3. **The process that runs it.** Library -> a process kind -> **Add process**:
   heating, an energy field, a light, a threshold monitor... It takes its
   devices by their roles; its settings (Config) say how it runs - schedules,
   limits, protections.
4. **Try it on the simulation.** The Simulator page moves the virtual sensors
   (a temperature, a level, a current); the processes react as they will on
   the site - the Dashboard, the logs and the alarms show it. The control is
   right before anything is bought or wired.
5. **The real hardware.** The sensors and the node are fitted; the node gets
   the firmware and joins its bus (CAN, Modbus, MQTT, Ethernet). On the Nodes
   page its **Physical / simulated** switch moves it to the real unit, live,
   node by node - the rest of the site keeps running on the simulation.

The AI assistant can do steps 2 and 3 for you: describe the equipment, it
proposes the nodes, devices and processes (Install), and a person accepts
them in Logs -> AI Proposals.

## What the machine gets

- **A model** - its readings, its state and its commands in one place, the
  same for an old machine and a new one.
- **Control** - schedules, loops, plans by prices or by weather; a command
  that would break a protection is refused before it reaches the machine.
- **Safety at the node** - the node keeps its own limits (a float switch, a
  maximum temperature) even with no link to the server; the server sees what
  happened.
- **History and alarms** - every value, every command with its author;
  warnings and errors by level.
- **Energy and money** - with a meter, what it consumed and what that cost.
- **The AI** - it reads the machine's history and proposes changes within the
  rights you give it.

## Your own type, your own bus

When the Library has no type for your machine, or it speaks a protocol of its
own, a project adds it: the device's contract and profile, its safety rules,
its controls and simulator in the interface (Extending). A machine with a
working controller of its own keeps it - an adapter node reads and writes it
(Modbus, a 4-20 mA signal, a dry contact), and the system adds what it lacks.

Work on mains voltage (230 / 400 V) is done with a licensed electrician; the
nodes, the sensors and the control come from the system.
