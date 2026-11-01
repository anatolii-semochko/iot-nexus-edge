---
title: "Konzepte"
description: "Knoten, Geräte, Prozesse, die Bibliothek, Simulation und Meldungen - die Bausteine von Nexus Edge."
order: 3
---

## Knoten und Geräte

Ein **Gerät** ist eine Sache, die misst oder handelt: ein Temperaturfühler,
ein Ventil, eine Pumpe, ein Zähler, ein Lichtkanal. Ein **Knoten** ist das
Hardwaremodul, das Geräte trägt und mit dem Bus spricht - eine Steuerplatine,
ein Lichttreiber, eine Wetterstation. Ein Knoten kann einen **übergeordneten**
Knoten haben (ein Modul einer größeren Einheit), und Knoten und Geräte lassen
sich für die betriebliche Sicht in **Gruppen** fassen (ein Gebäude, ein
Becken, ein Feld).

Jedes Gerät hat einen Wert, den Zeitpunkt seiner Messung und - wenn es
steuerbar ist - ein Ziel. Ein Messwert, älter als die Grenze seines Geräts,
ist **überfällig**.

## Der Bus und das Gateway

Knoten sprechen über einen physischen Bus (heute CAN, MQTT für Netzwerkknoten).
Ein einziges Gateway - EdgeX Foundry mit dem Nexus-Edge-Device-Service -
bringt jeden Bus in dasselbe Modell, sodass dem Rest des Systems gleich ist,
über welche Leitung ein Wert kam. Ein neuer Bus ist ein neues Transportpaket.

## Physisch und simuliert

Jeder Knoten oder jedes einzelne Gerät ist entweder **physisch** (die echte
Hardware) oder **simuliert** (ein Modell spielt es). Umgeschaltet wird live -
entwickeln und testen ohne Hardware, einen Standort betreiben, während ein
Knoten repariert wird, eine Demo zeigen. Das Abzeichen „Simulation" in der
Kopfzeile zeigt, dass etwas simuliert ist.

## Prozesse

Ein **Prozess** ist die Logik, die die Anlage führt: ein Energiefeld, ein
Heizungssystem, die Steuerung eines Aquariums, ein Datenlogger. Der
Orchestrator führt jeden Prozess in jedem Takt aus; jeder hat eigene
Einstellungen (gegen ein Schema geprüft), seinen Zustand, seine Befehle und
seine Szene im Dashboard. **Simulationsprozesse** bilden ab, was die Anlage
täte - eine Batterie lädt, Wasser erwärmt sich.

**Sicherheitsregeln** gehören zu den Gerätetypen: eine physikalisch verbotene
Kombination (dieselbe Zone heizen und kühlen) wird abgelehnt, bevor sie die
Hardware erreicht - egal, wer sie anfordert.

## Die Bibliothek

Pakete für Geräte, Knoten und Prozesse - **DNP**. Die Seite „Bibliothek" listet
die installierten mit ihrer Dokumentation. Ein System wird aus ihnen
zusammengesetzt; ein Zielprojekt fügt eigene Pakete hinzu, ohne den Kern zu
ändern.

## Warnungen, Fehler und Meldungen (WEM)

Prozesse und Geräte lösen **Warnungen** und **Fehler** aus und senden
**Meldungen**. Jede hat eine Stufe und eine Gruppe: die Stufen bestimmen Ton
und LEDs am Bedienknoten, die Gruppen, wer sie sieht. Die Symbole in der
Kopfzeile zeigen die aktiven; die Protokolle bewahren den Verlauf.

## Daten

Jeder Wert kann in Zeitreihen protokolliert werden (nach Zeitraum, bei
Änderung, mit Totzone), stündlich und täglich aggregiert für lange Diagramme.
Befehle und Änderungen werden mit ihrem Urheber protokolliert - eine Person,
ein Prozess, die KI.
