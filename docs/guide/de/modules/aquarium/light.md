---
title: "Das Licht"
description: "Licht nach Wh pro Tag - die Steuerung, die Editoren für Spektrum, Kurve, Tag, Woche, Monat und Jahr, der Schnelltest."
order: 1
---

Die meisten Lichtsteuerungen setzen eine Leistung und einen Zeitplan; wie
viel Licht das Becken an einem Tag wirklich bekommt, hängt dann von Kurve,
Spektrum und Jahreszeit ab - und das Glätten des Tages senkt es unbemerkt.
Hier ist der Ausgangspunkt die **Zielenergie pro Tag (Wh/D)**: Alles andere
wird daraus berechnet.

Alles Folgende liegt im Aquarium unter **Service - Main Light** (der
Service-Knopf auf dem Aquarium-Panel); jede Leuchte hat ihre eigene
Vorlagenbibliothek.

## Die Ebenen

- **Spektrumprofile** - der Anteil jedes Kanals;
- **Tageskurven** - die Form des Tages;
- **Tagesprofile** - eine Kurve, Abschnitt für Abschnitt mit Spektren
  bemalt;
- **Wochen-, Monats- und Jahresprofile** - welcher Tag wann läuft: die
  Jahreszeiten;
- eine Vorlage ist **aktiv**; das System skaliert sie so, dass der Tag genau
  das Wh/D-Ziel liefert - Spektrum und Kurvenform bleiben erhalten;
- der **Schnelltest** spielt jede Vorlage in Sekunden auf der Leuchte ab.

## Steuerung

![Die Steuerung des Lichts](screen:aq-light-control)

- **Aktive Vorlage** - ihr Typ und die Vorlage selbst; der Ein/Aus-Knopf
  schaltet nur AUTO ab (manuell und Test laufen weiter).
- **Schnelltest** - eine Dauer in Sekunden und der Startknopf.
- **Der Rahmen** - der Modus (AUTO, MANUAL, TEST, OFF), **Wh/D**, **Max**
  (die heutige Spitze - Pflanzen / alles), die Uhr des Servers, die aktuelle
  Leistung der Pflanzenkanäle und des ganzen Lichts.
- **Das Diagramm** - das Farbband des Tages und die Leistungskurven: alles
  Licht (gelb), die Pflanzenkanäle (grün); die rote Linie - jetzt.

Blinkt Wh/D, erreicht die aktive Vorlage das Ziel nicht ohne
Spektrumverschiebung; blinkt die Vorlage, beschneidet einer ihrer Abschnitte
einen Kanal. Auf dem Dashboard zeigt das Aquarium-Panel dasselbe Licht als
schmalen Streifen über dem Becken.

## Die Vorlagentabellen

Jede Ebene ist eine Tabelle: **Preview**, **Smooth** (glatt oder roh),
**Max** (Spitzenleistung), **Total** (Wh pro Tag), **Max Total** (das Meiste
ohne beschnittenen Kanal) und die Knöpfe Standard (Stern), Löschen, Test,
Aufklappen (der Editor). Ein Zähler am Reiter zeigt Vorlagen im Konflikt.

## Spektrumprofile

![Die Spektrumvorlagen](screen:aq-light-spectrum)

![Der Spektrumeditor - Sunny Day](screen:aq-light-spectrum-edit)

![Der Spektrumeditor - Tropical Sun](screen:aq-light-spectrum-edit-2)

Name, Symbol, Beschreibung, **Grundleistung** und der **Anteil** jedes
Hauptkanals; die Pflanzenkanäle sind markiert. Die Demo bringt dreizehn mit,
vom Mondlicht bis zum Gewitter.

## Tageskurven

![Die Tageskurven](screen:aq-light-curves)

![Der Kurveneditor - Summer Day](screen:aq-light-curves-edit)

![Der Kurveneditor - Siesta](screen:aq-light-curves-siesta)

Die Leistung alle **30 oder 60 Minuten**, im Diagramm gezogen oder getippt;
**Smooth** rundet die Stufen, **Raw** behält sie. Alle Kurven teilen eine
feste Skala - die Dosis kommt vom Wh/D-Ziel, die Kurve gibt die Form.

## Tagesprofile

![Die Tagesprofile](screen:aq-light-day)

![Der Tagesprofil-Editor - Summer Day](screen:aq-light-day-edit)

![Der Tagesprofil-Editor - Siesta](screen:aq-light-day-siesta)

Ein Tagesprofil bemalt eine Kurve mit Spektren: Jeder **Abschnitt** beginnt
zu seiner Zeit. Das Profil **Siesta** der Demo: Mondlicht, Sonnenaufgang,
ein sonniger Pflanzenmorgen (9-13 Uhr), eine bewölkte dreistündige Siesta,
ein sonniger Nachmittag (16-20 Uhr), Sonnenuntergang, Mondabend - der Tag
4-3-4.

## Woche, Monat, Jahr - die Jahreszeiten

![Das Wochenprofil](screen:aq-light-week)

![Das Monatsprofil](screen:aq-light-month)

![Das Jahresprofil](screen:aq-light-year)

**Woche** - ein Tagesprofil je Wochentag (*Work week & weekend*: Siesta
werktags, Demo Day am Wochenende); **Monat** - Abschnitte ab einem
Monatstag (*Algae break*); **Jahr** - Abschnitte ab einem Datum
(*Seasons*: kurzer Wintertag, langer Sommertag). Eine Jahreszeit ändert die
Form des Tages, nicht seine Dosis: Ein kürzerer Tag mit derselben Dosis
braucht mehr Leistung - schafft die Leuchte das nicht, sagt es das System.

## Das Ziel - Wh pro Tag

![Die Parameter des Aquariums](screen:aq-settings-parameters)

Die Lichtenergie des Tages steht unter **Settings - Parameters** (Wh/D);
jede Vorlage folgt ihr sofort.
