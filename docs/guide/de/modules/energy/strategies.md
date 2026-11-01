---
title: "Strategien"
description: "Die Strategien des Energy Ledgers, wie eine gewählt und vorgeschlagen wird und wann der Plan neu entsteht."
order: 1
---

Das Ledger plant die Batterien in 15-Minuten-Slots gegen die Day-Ahead-Preise
und die Prognosen:

| Strategie | Was sie tut |
|---|---|
| Geringste Kosten | Laden, wenn Energie günstig oder gratis ist, abgeben, wenn sie teuer ist |
| Autarkie | So wenig wie möglich aus dem Netz - kein Laden aus dem Netz |
| Reserve | Die Batterien hoch gehalten - bereit für einen Ausfall (z. B. vor einem Sturm) |
| Lastspitzenkappung | Der Bezug unter der Spitzengrenze - der Leistungspreis eines Betriebs |
| Verkauf | Gespeicherte Energie nur über der Preisschwelle verkauft |

Die Strategie ist **fest** (Sie wählen sie) oder wird nach **ähnlichen Tagen**
gewählt: jeden Morgen und wenn sich die Tagesnotizen ändern, nimmt das Ledger
die Strategie, die an den ähnlichsten aufgezeichneten Tagen am besten war -
Wetter, Preise, Tagesart, Jahreszeit. Dafür braucht es keine KI.

Machen neue Day-Ahead-Preise eine andere Strategie um mehr als die Schwelle
günstiger, wird sie **vorgeschlagen** - sofort angewendet oder sie wartet auf
Ihr Annehmen, je nach KI-Zugriffsstufe des Ledgers (Auto / Confirm / Off).

Der Plan wird alle paar Minuten neu erstellt, bei neuen Preisen, bei
geänderten Tagesnotizen und wenn die Batterieladung vom Plan abweicht.

