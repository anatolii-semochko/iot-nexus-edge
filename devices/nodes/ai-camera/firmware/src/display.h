// SSD1306 128x32 text output. Short text: one line in the large font;
// longer: word-wrapped small lines. `blink` hides/shows it on the shared
// blink period (driven by displayUpdate() from loop()).
#pragma once
#include <Arduino.h>

bool displayBegin();
void displayShow(const String &text, bool blink = false);
// Stops blinking, keeping the current text shown.
void displayStopBlink();
void displayUpdate(uint32_t now);
