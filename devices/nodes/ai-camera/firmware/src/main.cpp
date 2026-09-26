// AI Analyzing Camera firmware (AGENTS_TO_DO.md 2026-09-24/26) - the
// camera's state machine. Behaviour table: ../../docs/README.md, "Camera
// behaviour". UNTESTED on real hardware (see ../README.md).
//
//   Ready --shutter--> Processing --result--> Result (blinking if targets found)
//                          |                     |
//                          +--timeout/error--> Error --shutter--> Ready
//
// A result is accepted only while Processing. NexusEdge assigns the frame's
// id after it arrives, so the camera can't match `imageId` itself; instead,
// timeouts are ordered so a result always arrives before the camera gives
// up (AI request <= 25 s on NexusEdge, RESULT_TIMEOUT_MS = 30 s here), and a
// result arriving outside Processing (late, or not asked for) is ignored.

#include <Arduino.h>
#include <ArduinoJson.h>

#include "camera.h"
#include "config.h"
#include "display.h"
#include "indicators.h"
#include "mqtt_link.h"
#include "provisioning.h"

namespace {
enum class State { Ready, Processing, Result, Error };

State state = State::Error;
uint32_t processingDeadline = 0;
uint32_t blinkUntil = 0;  // 0 = not blinking
String resultText;

bool lastButton = HIGH;
uint32_t buttonChangedAt = 0;
bool buttonStable = HIGH;

void enterReady() {
  state = State::Ready;
  blinkUntil = 0;
  setGreen(LedMode::On);
  setRed(LedMode::Off);
  displayShow("Ready");
}

void enterError() {
  state = State::Error;
  blinkUntil = 0;
  setGreen(LedMode::Off);
  setRed(LedMode::On);
  displayShow("Error");
}

void stopBlinking() {
  if (blinkUntil == 0) return;
  blinkUntil = 0;
  setRed(LedMode::Off);
  // After blinking, the AI's own text stays on screen (also after a
  // multi-target "Found Objects" blink).
  displayShow(resultText);
}

void takePhoto(uint32_t now) {
  stopBlinking();
  setRed(LedMode::Off);
  if (!mqttConnected()) {
    enterError();
    return;
  }
  camera_fb_t *frame = cameraCapture();
  if (!frame) {
    enterError();
    return;
  }
  beep(1, BEEP_SHORT_MS, 0);  // frame taken (locally)
  state = State::Processing;
  setGreen(LedMode::Blink);
  displayShow("Processing...");
  const bool sent = mqttPublishFrame(frame->buf, frame->len);
  esp_camera_fb_return(frame);
  if (!sent) {
    enterError();
    return;
  }
  processingDeadline = now + RESULT_TIMEOUT_MS;
}

void onShutter(uint32_t now) {
  switch (state) {
    case State::Processing:
      return;  // disabled while waiting for a result
    case State::Error:
      enterReady();  // leaving Error does not take a photo
      return;
    case State::Ready:
    case State::Result:
      takePhoto(now);
      return;
  }
}

// Result JSON written by the AI Analyzer process: {"imageId", "status",
// "text", "found": <count>} (nexus-edge devices/processes/ai-analyzer).
void onResult(const String &payload, uint32_t now) {
  if (state != State::Processing) return;
  JsonDocument doc;
  if (deserializeJson(doc, payload) != DeserializationError::Ok || doc["status"] != "ok") {
    enterError();
    return;
  }
  resultText = doc["text"] | "";
  const int found = doc["found"] | 0;
  state = State::Result;
  setGreen(LedMode::On);
  if (found > 0) {
    displayShow(found == 1 ? resultText : String("Found Objects"), true);
    setRed(LedMode::Blink);
    beep(BEEP_FOUND_COUNT, BEEP_LONG_MS, BEEP_LONG_GAP_MS);
    blinkUntil = now + FOUND_BLINK_MS;
  } else {
    setRed(LedMode::Off);
    displayShow(resultText);
  }
}

bool shutterPressedEdge(uint32_t now) {
  const bool reading = digitalRead(PIN_BUTTON);
  if (reading != lastButton) {
    lastButton = reading;
    buttonChangedAt = now;
  }
  if (now - buttonChangedAt >= BUTTON_DEBOUNCE_MS && reading != buttonStable) {
    buttonStable = reading;
    return buttonStable == LOW;  // pressed = pulled to GND
  }
  return false;
}

// Shutter held at power-up for PORTAL_HOLD_AT_BOOT_MS = open the portal.
bool shutterHeldAtBoot() {
  const uint32_t start = millis();
  while (millis() - start < PORTAL_HOLD_AT_BOOT_MS) {
    if (digitalRead(PIN_BUTTON) == HIGH) return false;
    delay(10);
  }
  return true;
}
}  // namespace

void setup() {
  // TX only - RX (GPIO3) is the buzzer output (indicatorsBegin re-pins it).
  Serial.begin(115200);
  pinMode(PIN_BUTTON, INPUT_PULLUP);
  indicatorsBegin();
  displayBegin();

  const bool forcePortal = digitalRead(PIN_BUTTON) == LOW && shutterHeldAtBoot();
  displayShow(forcePortal ? "Setup: " + portalApName() : String("Connecting..."));

  if (!cameraBegin()) {
    Serial.println("camera init failed");
    enterError();
    return;
  }
  NodeSettings settings;
  if (!provisioningBegin(forcePortal, settings)) {
    Serial.println("no network/settings");
    enterError();
    return;
  }
  if (!mqttBegin(settings)) {
    Serial.println("mqtt init failed");
    enterError();
    return;
  }
  enterReady();
}

void loop() {
  const uint32_t now = millis();

  if (shutterPressedEdge(now)) onShutter(now);

  const String result = mqttTakeResult();
  if (result.length() > 0) onResult(result, now);

  if (state == State::Processing && static_cast<int32_t>(now - processingDeadline) >= 0) enterError();
  if (blinkUntil != 0 && static_cast<int32_t>(now - blinkUntil) >= 0) stopBlinking();

  indicatorsUpdate(now);
  displayUpdate(now);
  delay(5);
}
