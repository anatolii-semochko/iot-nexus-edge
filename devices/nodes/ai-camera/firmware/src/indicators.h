// Green/red LEDs and the buzzer - all non-blocking, driven from loop() by
// indicatorsUpdate(). Patterns are set by the state machine in main.cpp.
#pragma once
#include <Arduino.h>

enum class LedMode { Off, On, Blink };

void indicatorsBegin();
void indicatorsUpdate(uint32_t now);
void setGreen(LedMode mode);
void setRed(LedMode mode);
// Queue `count` beeps of `onMs`, separated by `gapMs`. Replaces any
// pattern still playing.
void beep(uint8_t count, uint16_t onMs, uint16_t gapMs);
