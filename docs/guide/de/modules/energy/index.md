---
title: "Energie"
description: "Das Energiefeld, der Netzanschluss und das Energy Ledger - Strategien, der Plan, der Rückblick und das Gesparte."
order: 1
---

![Energie](screen:energy-overview)

Drei Pakete arbeiten zusammen:

- **Energy Field** - die Erzeugung des Standorts (PV-Blöcke, Windräder), die
  Batterien, der Verbrauch und der Netzpunkt: die Live-Szene und die
  Grundsteuerung.
- **Grid Connection** - die Preise (Markt oder fest, Tarifzonen), die Bezugs-
  und Einspeisegrenzen, die Qualität des Anschlusses.
- **Energy Ledger** - der Plan für die kommenden Stunden, die Strategien, der
  Rückblick jedes Tages, die Konten und das Gesparte.

## Die Szene

Die Energieszene zeigt die Flüsse zwischen Erzeugung, Netz, Batterien und
Verbrauch, mit der Leistung an jedem Pfeil und den heutigen Werten. Ein Klick
auf einen Block zeigt Details und das heutige Diagramm. Die Farben der Preise:
grün - gut für uns, gelb - mittel, rot - nicht (nach den Vierteln der Preise
der nächsten 24 Stunden).

Die Steuerung (für alle, die steuern dürfen):

- **Auto / Manuell / Insel** - die Batterien folgen dem Plan, laufen mit der
  eingestellten Leistung, oder der Standort läuft vom Netz getrennt mit
  eigener Erzeugung und Batterien;
- **Netz verbunden**, **Verkauf erlaubt**, die **Ausfallreserve** (die für
  einen Ausfall gehaltene Ladung) - jede Änderung für eine Weile (20 Minuten,
  eine Stunde, vier Stunden, bis Tagesende, bis zur Änderung), mit optionalem
  Grund; der Plan kann sich anpassen.

![Die Einstellungen des Energiefelds](screen:config-energy-field)

Die Einstellungen des Felds - Prozesse -> Energy Field -> die Schaltfläche
Prozesseinstellungen: die Gruppen (Erzeugung oder Batterien) und welche Einheit
in welcher ist; die Ladebereiche der Batterien (gut ab, mittel ab, niedrigste
und höchste Ladung); die kritischen Zustände, rot in der Szene (über dem Plan in
% oder kW, über Nennwert). Die Strategie - im Panel des Felds (Auto / Manuell /
Insel, die Reserve); der Ertragsfaktor einer Einheit - in ihrem Fenster in der
Szene.

## Tagesnotizen

Notizen erzählen dem Plan vom Tag: ein Feiertag oder ein Arbeitswochenende
(der Verbrauch wie an einem freien oder einem Arbeitstag), ein Netzausfall
(kein Bezug, keine Einspeisung im Fenster - die Batterien vorab geladen),
Wartung (Einheiten aus, weniger Batterieleistung), ein geschlossener Raum.
Kommende Notizen erscheinen in der Szene und im Plan.
