---
title: "Concepts"
description: "Nodes, devices, processes, the Library, simulation and messages - the parts of Nexus Edge."
order: 3
---

## Nodes and devices

A **device** is one thing that measures or acts: a temperature sensor, a
valve, a pump, a meter, a light channel. A **node** is the hardware module that
carries devices and talks to the bus - a control board, a light driver, a
weather station. A node can have a **parent** node (a module of a larger
unit), and nodes and devices can be put in **groups** for the business view
(a building, a tank, a field).

Every device has a value, a time it was read, and - for the ones you can
command - a target. A reading older than its device's limit is **overdue**.

## The bus and the gateway

Nodes talk over a physical bus (CAN today, MQTT for network nodes). A single
gateway - EdgeX Foundry with the Nexus Edge device-service - turns every bus
into the same model, so the rest of the system never cares which wire a value
came on. Adding a bus is adding a transport package.

## Physical and simulated

Every node or standalone device is either **physical** (the real hardware) or
**simulated** (a model plays it). You switch between them live - develop and
test without hardware, keep a site running while a node is repaired, show a
demo. The header's Simulation badge shows that something is simulated.

## Processes

A **process** is the logic that runs the equipment: an energy field, a
heating system, an aquarium's control, a data logger. The orchestrator runs
every process on a tick; each has its own settings (checked against a schema),
its state, its commands and its scene on the Dashboard. **Simulation
processes** model what the equipment would do - a battery charging, water
warming.

**Safety rules** belong to the device types: a combination that is physically
forbidden (heating and cooling the same zone) is refused before it reaches the
hardware - whoever asks.

## The Library

Packages of devices, nodes and processes - **DNP**. The Library page lists the
installed ones with their documentation. A system is composed from them; a
target project adds its own packages without changing the core.

## Warnings, errors and messages (WEM)

Processes and devices raise **warnings** and **errors**, and post
**messages**. Each has a level and a group; the levels decide the sound and
the LEDs on an operator's node, the groups decide who sees them. The header's
icons show the active ones; Logs keeps the history.

## Data

Every value can be logged into time series (by period, on change, with a
deadband), aggregated per hour and day for long charts. Commands and changes
are logged with their author - a person, a process, the AI.
