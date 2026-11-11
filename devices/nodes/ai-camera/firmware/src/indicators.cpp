#include "indicators.h"

#include "config.h"

namespace {
LedMode greenMode = LedMode::Off;
LedMode redMode = LedMode::Off;

uint8_t beepsLeft = 0;
uint16_t beepOnMs = 0;
uint16_t beepGapMs = 0;
bool beepOn = false;
uint32_t beepPhaseAt = 0;

void drive(uint8_t pin, LedMode mode, bool blinkPhase) {
  digitalWrite(pin, mode == LedMode::On || (mode == LedMode::Blink && blinkPhase) ? HIGH : LOW);
}
}  // namespace

void indicatorsBegin() {
  pinMode(PIN_LED_GREEN, OUTPUT);
  pinMode(PIN_LED_RED, OUTPUT);
  // GPIO3 is U0RXD - reconfiguring it as a plain output detaches it from the
  // UART (serial output on TX keeps working).
  pinMode(PIN_BUZZER, OUTPUT);
  digitalWrite(PIN_LED_GREEN, LOW);
  digitalWrite(PIN_LED_RED, LOW);
  digitalWrite(PIN_BUZZER, LOW);
}

void setGreen(LedMode mode) { greenMode = mode; }
void setRed(LedMode mode) { redMode = mode; }

void beep(uint8_t count, uint16_t onMs, uint16_t gapMs) {
  beepsLeft = count;
  beepOnMs = onMs;
  beepGapMs = gapMs;
  beepOn = false;
  beepPhaseAt = 0;  // start on the next update
}

void indicatorsUpdate(uint32_t now) {
  const bool blinkPhase = (now / BLINK_PERIOD_MS) % 2 == 0;
  drive(PIN_LED_GREEN, greenMode, blinkPhase);
  drive(PIN_LED_RED, redMode, blinkPhase);

  if (beepsLeft == 0 && !beepOn) return;
  if (now < beepPhaseAt) return;
  if (beepOn) {
    beepOn = false;
    digitalWrite(PIN_BUZZER, LOW);
    beepPhaseAt = now + beepGapMs;
  } else if (beepsLeft > 0) {
    beepOn = true;
    beepsLeft--;
    digitalWrite(PIN_BUZZER, HIGH);
    beepPhaseAt = now + beepOnMs;
  }
}
