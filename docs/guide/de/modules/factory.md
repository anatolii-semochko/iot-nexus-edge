---
title: "Fabrik"
description: "Eine Metallwerkstatt von der Stange bis zur Palette - die Bereiche, der Transportwagen der Eloxallinie, die CNC, Chemie und Abwasser."
order: 4
---

![Der Plan der Metallwerkstatt](screen:factory-shop)

Das Fabrikmodul führt eine kleine Metallwerkstatt, die Aluminiumteile von der
Stange bis zur Palette fertigt: Die Rohlinge werden gesägt, auf CNC-Maschinen
bearbeitet, auf einer Linie mit automatischem Transportwagen eloxiert,
getrocknet, geprüft und verpackt. Ihr Panel (Dashboard -> Fabrik ->
Metallwerkstatt) ist der Plan der Werkstatt mit sieben Bereichen. Jeder
Bereich hat seine Karte: Ein farbiger Punkt zeigt den Zustand, daneben stehen
die Zahlen, auf die es gerade ankommt. Die Karte öffnet das Fenster des
Bereichs mit seinem Bild, den Zahlen, einer Tabelle und den Kurven des Tages.
Warum eine Werkstatt so automatisiert wird und was es wert ist, steht im
Abschnitt [Fabrik](/de/solutions/factory/) der Website.

Die Bilder bewegen sich mit der Werkstatt. Der Transportwagen setzt die
Warenträger um, und über jedem Warenträger zählt ein Ring seinen Schritt
herunter. Die Türen der CNC-Maschinen öffnen sich zum Rüsten, hinter dem Glas
arbeitet der Spindelkopf, die Signalleuchte zeigt den Zustand. Die Säge
schiebt die Stange vor und sägt, und in der Chemie laufen Punkte durch die
Rohre, solange die Pumpen arbeiten.

## Die Eloxallinie

![Das Fenster der Eloxallinie](screen:factory-line)

Acht Bäder nach Rezept: Entfetten, Spülen, Beizen, Spülen, Eloxieren, Spülen,
Färben, Verdichten. Das Fenster zeigt die Temperatur jedes Bads (ein Pfeil
für Heizen oder Kühlen) und den Warenträger darin mit dem Timer seines
Schritts. Darunter stehen die Leistung der Linie, Strom, Spannung und
Stromdichte des Gleichrichters, die Schicht des Warenträgers im Eloxalbad,
die Warenträger, Teile und kWh des Tages, dazu die Tabelle der Bäder und die
Kurven.

Der Transportwagen fährt jeden Zug nach einem Fahrplan: Er fährt nur mit
angehobenem Warenträger und hebt oder senkt ihn nur, wenn er über einem Bad
steht. Zu einem Warenträger kommt er `leadS` Sekunden (Standard 10) vor dem
Ende seines Schritts und wartet über dem Bad. Der Strom des Gleichrichters
folgt der Fläche des Warenträgers und der Stromdichte; die Schichtdicke
rechnet der Prozess aus den Amperestunden.

## CNC-Bearbeitung und Säge

![Das Fenster der CNC-Bearbeitung](screen:factory-cnc)

Für jede Maschine sieht man den Zustand (läuft, Rüsten, wartet,
Werkzeugwechsel), das Programm, wie viele Teile des Auftrags fertig sind, den
Zyklus und die Standzeit des Werkzeugs, die OEE des Tages und als Kurven
Leistung und Teile. Die Säge sägt die Rohlinge für die Maschine, die die
wenigsten hat. Die Meter des Stangenmaterials werden gezählt, und unter dem
Mindestbestand kommt eine Lieferung.

## Chemie und Abwasser

![Das Fenster von Chemie und Abwasser](screen:factory-chem)

Für jeden Behälter eines Konzentrats sieht man Füllstand, Verbrauch pro Tag
und Reichweite in Tagen. Unter dem Bestellstand kommt eine Warnung, eine
kritische Meldung schon bevor die Dosierung stoppt. Jeder Warenträger, der
aus einem Bad gehoben wird, schleppt etwas Lösung aus; fällt die
Konzentration aus ihrem Bereich, dosiert die Dosierpumpe Konzentrat nach. Das
Abwasser: Der Überlauf der Spülen sammelt sich im Sammelbehälter, die
Förderpumpe läuft nach seinen Füllständen, die Pumpen für Lauge und Säure
halten den pH-Wert der Neutralisation, die Kammerfilterpresse presst den
Schlamm aus dem Absetzbecken, danach folgt die Einleitung. Warnungen gibt es
für den Füllstand des Sammelbehälters, den pH-Wert der Einleitung und das
Filtertuch der Presse.

## Energie und KI

Die Werkstatt ist einer der Verbraucher des Standorts: Ihr Strom geht über einen eigenen Zähler in die Bilanz
des Energy Field, das Energy Ledger führt ihr Konto, und das Panel zeigt die Tagesspitze - den höchsten
15-Minuten-Mittelwert, so wie das Netz ihn abrechnet. Die Linie heizt ihre Bäder nach dem Strompreis: In den
günstigen Stunden wird jedes beheizte Bad bis an den oberen Rand seines Bereichs geheizt (das gekühlte
Eloxalbad bis an den unteren), in den teuren hält es sich am anderen Rand. Den Bereich selbst verlässt es nie;
den Modus zeigt das Fenster der Linie.

Der KI-Assistent kennt die ganze Werkstatt: den Zustand der Schicht und was als Nächstes kommt (wann Aufträge
enden und gerüstet wird, Werkzeugwechsel, welches Material und welche Chemikalien zu bestellen sind), den ganzen
Weg einer Charge von der Linie bis zur Prüfung und was gerade nicht stimmt, mit den Zahlen. Bitten Sie ihn um
einen Schichtbericht, einen Chargenbericht oder die Ursache einer Warnung.

## Die Prozesse

Die Werkstatt besteht aus Prozessen, jeder mit eigenen Einstellungen
(Prozesse -> der Prozess -> die Schaltfläche Einstellungen):

- **anodizing-line** - die Bäder (ihre Knoten, Rollen, Volumen, Sollwerte),
  das Rezept (Bad und Minuten jedes Schritts), die Linie (`pitchMm`,
  `speedMmS`, `liftS`, `dripS`, `leadS`, `loadEveryMin`, Fläche und Teile
  eines Warenträgers, die Stromdichte);
- **machining** - die Materialien, die Aufträge (Programm, Teil, Material,
  Rohling, Menge, Zyklus, Rüsten), die Maschinen, die Säge, die Schicht;
- **chem-wastewater** - die Behälter, die Dosierung (Bad, sein Behälter, Ziel
  und Bereich, Konzentrat, Pumpe, Ausschleppung), Füllstände, pH-Bereich,
  Absetzbecken und Presse der Abwasserbehandlung;
- **drying-oven**, **quality-control**, **shop-utilities** (Kompressor,
  Kühler, VE-Wasser) und **metal-shop** - die Übersicht der Werkstatt: ihr
  Strom zum Netzpreis und die Chargen in Arbeit.
