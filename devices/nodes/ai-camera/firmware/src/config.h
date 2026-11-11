// All tunable values live here, same convention as every other node's
// firmware in this Library ("ВСІ часові таймери, затримки, частоти та інше
// ПРОПИШИ В КОНСТАНТИ!", AGENTS_TO_DO.md 2026-08-09). Network settings that
// differ per installation (WiFi, broker address, node id) are NOT here -
// they are entered in the captive portal and stored in NVS
// (provisioning.cpp).
//
// UNTESTED on real hardware as of writing (AGENTS_TO_DO.md 2026-09-26 -
// the camera is still being assembled): written against PlatformIO +
// Arduino-ESP32 2.0.x, logic reasoned through but not build/flash-verified.
// See ../README.md.
#pragma once

// ---------------------------------------------------------------------
// Pins (ESP32-CAM AI-Thinker, no SD card) - see ../../docs/wiring.md.
// ---------------------------------------------------------------------
#define PIN_I2C_SDA 14
#define PIN_I2C_SCL 15  // strapping pin - HIGH at boot via the OLED's pull-up
#define PIN_BUTTON 13   // shutter, to GND, internal pull-up
#define PIN_LED_GREEN 2 // strapping pin - kept LOW at boot by LED + resistor
#define PIN_LED_RED 12  // strapping pin - MUST be LOW at boot (LED + resistor to GND)
#define PIN_FLASH 4     // on-board flash LED transistor
#define PIN_BUZZER 3    // U0RXD reused as output - serial log stays on TX (GPIO1)

// ---------------------------------------------------------------------
// MQTT contract with NexusEdge (nexus-edge AGENTS.md sections 79/81) -
// must match the device-service's DEVICE_MQTT_TOPIC_ROOT and the device
// instances' `transport.device` names.
// ---------------------------------------------------------------------
#define TOPIC_ROOT "nexus"
#define DEVICE_IMAGE "image-caster"       // <root>/<node>/image-caster/state  (frame, not retained)
#define DEVICE_RESULT "result-receiver"   // <root>/<node>/result-receiver/set (result JSON)
#define STATUS_ONLINE "online"            // <root>/<node>/status, retained; Last Will = STATUS_OFFLINE
#define STATUS_OFFLINE "offline"
#define MQTT_KEEPALIVE_S 30
// esp-mqtt buffers: the inbound one only ever holds a small result JSON;
// the outbound one is the chunk size a frame is streamed in.
#define MQTT_IN_BUFFER_BYTES 2048
#define MQTT_OUT_BUFFER_BYTES 16384

// ---------------------------------------------------------------------
// Provisioning (captive portal, WiFiManager).
// ---------------------------------------------------------------------
#define PORTAL_AP_PREFIX "NexusCam-"      // + last 4 hex digits of the MAC
#define PORTAL_TIMEOUT_S 300              // portal gives up (and the camera shows Error) after this
#define WIFI_CONNECT_TIMEOUT_S 20
#define PORTAL_HOLD_AT_BOOT_MS 3000       // shutter held this long at power-up = open the portal
#define DEFAULT_BROKER_PORT 1883

// ---------------------------------------------------------------------
// Camera (OV3660, 3MP). Full resolution is kept - NexusEdge stores the
// original and makes its own smaller copy for the AI.
// ---------------------------------------------------------------------
#define CAMERA_XCLK_HZ 20000000
#define CAMERA_JPEG_QUALITY 12            // 0-63, lower = better/larger; ~0.5-1 MB at QXGA
#define FLASH_WARMUP_MS 150               // flash on this long before the frame is grabbed

// ---------------------------------------------------------------------
// Behaviour / timing (see ../../docs/README.md, "Camera behaviour").
// ---------------------------------------------------------------------
#define RESULT_TIMEOUT_MS 30000           // no result within this -> Error
#define FOUND_BLINK_MS 10000              // found blinking lasts this long (or until the next press)
#define BLINK_PERIOD_MS 500               // text / LED blink half-period
#define BUTTON_DEBOUNCE_MS 40
#define BEEP_SHORT_MS 80                  // "frame taken"
#define BEEP_LONG_MS 400                  // "targets found", repeated
#define BEEP_LONG_GAP_MS 250
#define BEEP_FOUND_COUNT 5

// ---------------------------------------------------------------------
// Display (SSD1306 128x32, I2C).
// ---------------------------------------------------------------------
#define OLED_I2C_ADDRESS 0x3C
#define OLED_WIDTH 128
#define OLED_HEIGHT 32
#define DISPLAY_BIG_MAX_CHARS 10          // text size 2: one line of ~10 chars
#define DISPLAY_SMALL_LINE_CHARS 21       // text size 1: up to 4 lines of ~21 chars
#define DISPLAY_SMALL_LINES 4
