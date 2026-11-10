---
title: "Heizung"
description: "Wärmepumpen, Speicher, Gebläsekonvektoren und Räume - die Heizungssteuerung und der Heizplaner."
order: 2
---

![Heizung](screen:heating-overview)

## Heizungssteuerung

Ein Heizungssystem besteht aus seinen Wärmepumpen, den Speichern
(Wärmespeicher), den Gebläsekonvektoren und den Räumen. Die Szene zeigt die
Außenluft, die Wärmepumpen, den Wärmespeicher und die Räume mit den
Wärmeflüssen dazwischen; ein Block öffnet seine Details und Diagramme.

- **Der Modus** - Heizen, Kühlen oder automatisch nach der Außentemperatur
  (heizen unter der ersten, kühlen über der zweiten; dazwischen bleibt es beim
  Bisherigen); aus.
- **Gestufte Starts** - es laufen nur so viele Wärmepumpen, wie die Speicher
  brauchen; als Nächstes startet die am wenigsten gelaufene (gleichmäßiger
  Verschleiß) oder nach Ihrer Priorität; sie starten und stoppen einzeln -
  nie alle Anlaufströme gleichzeitig.
- **Die Speicher** - zwei Wärmetauscher (ein von den Wärmepumpen, aus zu den
  Räumen), die Schichtung, die gespeicherte Wärme über der niedrigsten
  Nutztemperatur.
- **Die Räume** - jeder mit Sollwert, Gebläsekonvektor und Ventil; ein per
  Tagesnotiz geschlossener Raum wird abgesenkt.
- **Das Signal des Energy Ledgers (SG-Ready)** - ist Energie teuer, warten die
  Wärmepumpen und die Speicher versorgen die Räume; ist sie günstig oder
  liefert die Sonne mehr als der Standort braucht, speichern die Speicher mehr
  Wärme.

## Der Heizplaner

Der Planer erstellt den Plan der Wärmepumpen voraus, Slot für Slot, für jedes
Heizungssystem - Wärme, Geräte, Speicher, die Komfortreserve der Räume - gegen
die Preise, die Sonne und das Signal des Ledgers, und zeigt, was er gegenüber
der einfachen Bandregelung spart.

| Strategie | Was sie tut |
|---|---|
| Geringste Kosten | Wärme wird erzeugt, wenn Energie am günstigsten ist; in teuren Stunden wird die Komfortreserve der Räume genutzt |
| Schonend | So wenige Starts und so geringe Leistung wie möglich - Verschleiß und Spitzen geschont |
| Komfort | Die Räume immer am Sollwert - die teuren Stunden tragen allein die Speicher |
| Die Sonne | Der Sonnenüberschuss als Wärme gespeichert - die Speicher höher gefüllt, solange sie scheint |

Die Strategie ist **fest** (Sie wählen sie) oder **am günstigsten** - bei
jedem Plan die mit dem geringsten Strom. Die KI kann den Heizplan des Tages
nach Zeitplan erstellen.
