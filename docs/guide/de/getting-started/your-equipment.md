---
title: "Ihre Ausrüstung"
description: "Wie eine Maschine, ein Sensor oder ein ganzer Standort in Nexus Edge kommt - vom Typ in der Bibliothek bis zur echten Hardware."
---

Nexus Edge verlangt nicht, auszutauschen, was schon läuft. Eine Presse, ein
Kompressor, eine Wärmepumpe oder ein Aquarium bleiben, wie sie sind; dazu
kommen die Sensoren und Aktoren, über die das System sie sieht und steuert, und
ein Knoten, der für sie spricht. Der Weg ist derselbe für eine Maschine wie für
einen ganzen Standort.

## Der Weg - fünf Schritte

1. **Ihr Typ in der Bibliothek.** Jeder Knoten und jedes Gerät hat einen Typ:
   was es misst, was es schaltet, seine Grenzen, sein Bild und seine
   Dokumentation (Bibliothek -> Knoten / Geräte). Die gängigen sind schon da -
   ein Stromzähler, eine Wärmepumpe, eine Windturbine, ein STM32- oder
   ESP32-Knoten mit seinen Ein- und Ausgängen. Ein neuer Typ ist ein Paket
   (siehe Erweitern).
2. **Der Knoten im System.** Bibliothek -> der Typ -> **Knoten hinzufügen**: ein
   Name, der Knoten, an dem er hängt (die Steuerung eines Gebäudes, ein Bus),
   oder eigenständig, und seine Geräte - jedes mit seiner **Rolle** (daran
   findet sein Prozess es: heater, pump, meter). Ein neuer Knoten beginnt
   **virtuell** - eine Simulation spielt ihn, bis die Hardware angeschlossen
   ist.
3. **Der Prozess, der ihn steuert.** Bibliothek -> eine Prozessart -> **Prozess
   hinzufügen**: Heizung, ein Energiefeld, Licht, ein Schwellwertmonitor... Er
   nimmt seine Geräte über ihre Rollen; seine Einstellungen sagen, wie er läuft
   - Zeitpläne, Grenzen, Schutzfunktionen.
4. **In der Simulation erproben.** Die Seite Simulator bewegt die virtuellen
   Sensoren (eine Temperatur, einen Füllstand, einen Strom); die Prozesse
   reagieren, wie sie es vor Ort tun werden - Dashboard, Protokolle und Alarme
   zeigen es. Die Steuerung stimmt, bevor etwas gekauft oder verdrahtet ist.
5. **Die echte Hardware.** Sensoren und Knoten werden montiert; der Knoten
   bekommt die Firmware und kommt an seinen Bus (CAN, Modbus, MQTT, Ethernet).
   Auf der Seite Knoten schaltet ihn der Umschalter **physisch / simuliert** im
   laufenden Betrieb auf das echte Gerät um, Knoten für Knoten - der Rest des
   Standorts läuft weiter in der Simulation.

Die Schritte 2 und 3 kann der KI-Assistent übernehmen: Beschreiben Sie die
Ausrüstung, er schlägt Knoten, Geräte und Prozesse vor (Installieren), und ein
Mensch nimmt sie unter Protokolle -> KI-Vorschläge an.

## Was die Maschine bekommt

- **Ein Modell** - ihre Messwerte, ihren Zustand und ihre Befehle an einem Ort,
  gleich für eine alte und eine neue Maschine.
- **Steuerung** - Zeitpläne, Regelkreise, Pläne nach Preisen oder Wetter; ein
  Befehl, der eine Schutzregel verletzen würde, wird abgelehnt, bevor er die
  Maschine erreicht.
- **Sicherheit am Knoten** - der Knoten hält seine eigenen Grenzen (ein
  Schwimmerschalter, eine Höchsttemperatur) auch ohne Verbindung zum Server;
  der Server sieht, was geschehen ist.
- **Historie und Alarme** - jeder Wert, jeder Befehl mit seinem Urheber;
  Warnungen und Fehler nach Stufen.
- **Energie und Geld** - mit einem Zähler, was sie verbraucht hat und was es
  gekostet hat.
- **Die KI** - sie liest die Historie der Maschine und schlägt Änderungen im
  Rahmen der Rechte vor, die Sie ihr geben.

## Eigener Typ, eigener Bus

Fehlt in der Bibliothek ein Typ für Ihre Maschine oder spricht sie ein eigenes
Protokoll, fügt ein Projekt ihn hinzu: Vertrag und Profil des Geräts, seine
Sicherheitsregeln, Bedienung und Simulator in der Oberfläche (Erweitern). Eine
Maschine mit eigener funktionierender Steuerung behält sie - ein
Adapterknoten liest und schreibt sie (Modbus, ein 4-20-mA-Signal, ein
potenzialfreier Kontakt), und das System ergänzt, was fehlt.

Arbeiten an Netzspannung (230 / 400 V) übernimmt eine zugelassene
Elektrofachkraft; Knoten, Sensoren und Steuerung kommen vom System.
