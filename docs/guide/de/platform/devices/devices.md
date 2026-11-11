---
title: "Geräte"
description: "Die Geräte - Werte, Modi, Simulation, Protokollierung und Heartbeat-Kontrolle."
order: 2
---

![Die Seite „Geräte“](screen:devices)

Jedes Gerät mit Knoten, Typ, Wert und Messzeit; überfällige Werte sind
hervorgehoben.

- **Der Wert** - live (ohne Neuladen); die Einheiten; bei einem steuerbaren
  Gerät - sein manueller Wert oder Befehl.
- **Auto / Manuell** - eine Ressource folgt den Prozessen (Auto) oder dem
  Wert einer Person (Manuell); Sicherheitsregeln lehnen eine verbotene
  Kombination ab.
- **Die Zeile** - aufklappen für die Infos (Backend, EdgeX-Name und -Status,
  Fähigkeiten, erstellt), die Werteinstellungen, die Medien (die Bilder einer
  Kamera), Datenprotokollierung und Heartbeat-Kontrolle.
- **Simuliert** - der Wert eines simulierten Geräts lässt sich direkt setzen.
- **Gruppen** - Gerätegruppen für die betriebliche Sicht.

![Ein aufgeklapptes Gerät - Informationen und Einstellungen](screen:devices-expanded)

## Die Einstellungen eines Geräts

Die Einstellungsschaltfläche der Zeile:

- **Name**; **Knoten** - der Knoten, zu dem es gehört (oder keiner - ein
  eigenständiges Gerät);
- **Physische ID** - seine Adresse am Bus oder in EdgeX, für das echte Gerät;
- **Gerätegruppen** - die betrieblichen Gruppen, in denen es ist;
- **Hintergrundfarbe bei Aktivität** - wie seine Zeile und Kachel aufleuchten,
  wenn es an ist;
- **Simulieren** - ob die Simulation dieses Gerät spielt.

Das Gerät einer Kamera hat die Registerkarte **Medien**: das neueste Bild, die
gespeicherten, **Bild hochladen** und **Bild löschen** (samt allem, was dazu
gespeichert ist).
