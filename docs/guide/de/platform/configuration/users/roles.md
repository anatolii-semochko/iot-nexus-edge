---
title: "Rollen"
description: "Die Objekte, Bereiche und Seiten, die eine Rolle sehen und ändern darf; in einer Rolle handeln."
order: 2
---

![Rollen](screen:roles)

Benutzer -> Rollen: eine Rolle ist eine Tabelle dessen, was sie darf:

- **Objekte** - jede Prozessinstanz (ein Energiefeld, ein Heizungssystem, ein
  Becken) und „alle anderen Objekte", mit einer Stufe: ansehen, steuern,
  konfigurieren (und die Stufen der KI);
- **Bereiche** - die Bereiche des Systems (Geräte, Protokolle, Benutzer,
  Service, ...);
- **Seiten** - welche Seiten das Menü zeigt (eine Rolle kann nur das Dashboard
  zeigen - dann gibt es gar kein Menü).

Eine Person mit mehreren Rollen handelt jeweils in einer - **Handeln als** im
Benutzermenü; die Kopfzeile zeigt die aktuelle Rolle. Ein Link mit
`?account=<Linkname der Rolle>` öffnet die Anwendung in dieser Rolle. Mit `lang=<en|uk|de|es>` -
die Sprache der Oberfläche für diesen Besuch (z. B. `?account=owner&lang=de#/dashboard/16`).
