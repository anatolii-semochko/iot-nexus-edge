# ai-camera firmware

ESP32-CAM (AI-Thinker) + OV3660 firmware for the AI Analyzing Camera
(AGENTS_TO_DO.md 2026-09-24/26) - see `../docs/README.md` (behaviour,
devices, flow) and `../docs/wiring.md` (pins, schematic, power).

## Status

**Compiles (PlatformIO, 2026-09-26: RAM 15.6 %, flash 35.9 %, no warnings
in `src/`), not yet flashed or run** - the camera is still being
assembled. Logic reasoned through against the behaviour table, not
verified on hardware; update this file after the first real run.

## Layout

- `src/config.h` - every constant: pins, MQTT contract (topic root and
  device names - must match NexusEdge), timings, buffers, display limits.
  Per-installation settings are not here - see Provisioning.
- `src/main.cpp` - the state machine (Ready / Processing / Result /
  Error), shutter handling, result handling.
- `src/camera.{h,cpp}` - OV3660 at QXGA (2048x1536) JPEG into PSRAM, flash
  on during capture, stale pre-flash frame dropped.
- `src/mqtt_link.{h,cpp}` - ESP-IDF esp-mqtt (bundled with Arduino-ESP32):
  one frame = one QoS 1 non-retained message on
  `nexus/<node>/image-caster/state`; results from
  `nexus/<node>/result-receiver/set`; retained `online` / Last Will
  `offline` on `nexus/<node>/status`.
- `src/provisioning.{h,cpp}` - WiFiManager captive portal + NVS.
- `src/display.{h,cpp}` - SSD1306 text: one big line (<= 10 chars) or up
  to 4 word-wrapped small lines, optional blinking.
- `src/indicators.{h,cpp}` - LEDs and buzzer, non-blocking.

## Provisioning

The portal (access point `NexusCam-XXXX`) opens on first boot, when the
saved WiFi can't be reached, when the broker address / node id are
missing, or when the shutter is held for 3 s at power-up. It asks for
WiFi, the NexusEdge address (the device broker host; port default 1883 -
use the stack's `DEVICE_MQTT_HOST_PORT`, e.g. 1983 for aquarium) and the
node id (`ai-camera-01`). Settings are stored in NVS.

## Result handling

A result is accepted only while the camera is Processing. NexusEdge gives
the frame its id after receiving it, so the camera can't match `imageId`
itself - instead the timeouts are ordered so the answer always arrives
first: the AI request is capped at 25 s on NexusEdge
(`AI_REQUEST_TIMEOUT_MS`), the camera waits 30 s (`RESULT_TIMEOUT_MS`). A
result arriving outside Processing is ignored.

## Building / flashing

```
pio run -e esp32cam            # build
pio run -e esp32cam -t upload  # flash - camera board on the ESP32-CAM-MB,
                               # peripherals disconnected (GPIO3 = buzzer)
pio device monitor             # serial log (TX only)
```

Arduino-ESP32 2.0.x (ESP-IDF 4.4) is pinned through `platform =
espressif32@^6.9.0`; `mqtt_link.cpp` uses the IDF 4.4 flat MQTT config
struct.
