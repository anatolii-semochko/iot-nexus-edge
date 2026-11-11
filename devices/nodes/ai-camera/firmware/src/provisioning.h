// WiFi + NexusEdge settings: captive portal (WiFiManager) on first boot,
// when the saved network can't be reached, or when the shutter is held at
// power-up. Broker host/port and node id are stored in NVS.
#pragma once
#include <Arduino.h>

struct NodeSettings {
  String brokerHost;
  uint16_t brokerPort;
  String nodeId;
};

// Connects WiFi (opening the portal when needed) and returns the stored
// settings. false = no working network/settings after the portal timeout.
bool provisioningBegin(bool forcePortal, NodeSettings &out);
// The portal's access point name, e.g. "NexusCam-A1B2" (shown on the display).
String portalApName();
