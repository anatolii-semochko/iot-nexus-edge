---
title: "Zugriffsstufen"
description: "Off, Confirm und Auto - was der Assistent ändern darf und wer entscheidet."
order: 2
---

![Die Instanzen - Service -> Konfiguration -> AI](screen:service-config-ai)

Service -> Konfiguration -> AI -> die Instanzen: der Assistent des ganzen Systems
und je einer pro Modulinstanz (ein Energiefeld, eine Heizung, ein Aquarium). Eine
Zeile:

- **Verbindung** - das Modell, mit dem er spricht; **- (aus)** - der Assistent
  ist für diese Instanz aus: keine Gespräche, ihre geplanten Ausführungen
  entfallen;
- **Lesen** - er darf das System lesen: Zustände, Protokolle, Reihen,
  Konfigurationen, Dokumentation;
- **Konfiguration** - Prozesseinstellungen; **Steuerung** - Befehle und manuelle
  Werte; **Installieren** - Pakete, Knoten, Geräte (nur die Instanz des ganzen
  Systems);
- **Bericht** - er darf Berichte und Vorschläge an die Entwickler schreiben;
- **Protokolle** - die Gespräche werden vollständig protokolliert (der
  Systemprompt, jeder Werkzeugaufruf und sein Ergebnis);
- **Kalender** - seine geplanten Ausführungen.

Jeder Bereich jeder Instanz hat eine Stufe:

- **Off** - der Assistent berührt ihn nicht;
- **Confirm** - er schlägt vor; eine berechtigte Person nimmt jede Änderung an
  oder lehnt sie ab (die Vorschlagskarte zeigt was und warum);
- **Auto** - er wendet die Änderung selbst an, als Konto `ai-agent`; jede
  Änderung wird mit Urheber protokolliert.

Welche Objekte der Assistent überhaupt lesen und ändern darf, legen die Rollen
seines Kontos `ai-agent` fest - standardmäßig die Rolle **AI Assistant** (alle
Objekte, einschließlich der Konfiguration). Soll er einen Teil der Anlage nicht
anfassen, schränken Sie diese Rolle unter Benutzer -> Rollen ein oder geben dem
Konto unter Benutzer andere Rollen. Eine Rolle mit allen Rechten
(Administrator, System service) ist für ihn gesperrt. Die Stufen oben regeln,
wie er innerhalb dessen handelt, was die Rollen erlauben.

Ein MCP-Client hat seine Stufen am eigenen Token und seine Rechte aus den Rollen
seines eigenen Kontos (Verbindungen und MCP).

Rollen begrenzen, was eine Person - und der für sie arbeitende Assistent -
sehen und tun kann.

