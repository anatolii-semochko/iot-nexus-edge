// MQTT link to NexusEdge's device broker through ESP-IDF's esp-mqtt client
// (bundled with Arduino-ESP32) - it can send a whole ~1 MB JPEG as one
// message, streamed from PSRAM. Publishes the node's online status
// (retained, with an "offline" Last Will), receives results on
// result-receiver's `set` topic.
#pragma once
#include <Arduino.h>

#include "provisioning.h"

bool mqttBegin(const NodeSettings &settings);
bool mqttConnected();
// Sends one frame as a single, non-retained QoS 1 message on image-caster's
// state topic. false if not connected or the send failed.
bool mqttPublishFrame(const uint8_t *data, size_t length);
// A result that arrived since the last call (copied out of the MQTT task),
// or an empty string.
String mqttTakeResult();
