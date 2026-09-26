#include "provisioning.h"

#include <Preferences.h>
#include <WiFi.h>
#include <WiFiManager.h>

#include "config.h"

namespace {
const char *NVS_NAMESPACE = "nexuscam";
const char *KEY_HOST = "host";
const char *KEY_PORT = "port";
const char *KEY_NODE = "node";

bool shouldSave = false;
}  // namespace

String portalApName() {
  uint8_t mac[6];
  WiFi.macAddress(mac);
  char suffix[5];
  snprintf(suffix, sizeof(suffix), "%02X%02X", mac[4], mac[5]);
  return String(PORTAL_AP_PREFIX) + suffix;
}

bool provisioningBegin(bool forcePortal, NodeSettings &out) {
  Preferences prefs;
  prefs.begin(NVS_NAMESPACE, false);
  out.brokerHost = prefs.getString(KEY_HOST, "");
  out.brokerPort = prefs.getUShort(KEY_PORT, DEFAULT_BROKER_PORT);
  out.nodeId = prefs.getString(KEY_NODE, "");

  char portText[6];
  snprintf(portText, sizeof(portText), "%u", out.brokerPort);
  WiFiManagerParameter hostParam("host", "NexusEdge address (MQTT broker host/IP)", out.brokerHost.c_str(), 64);
  WiFiManagerParameter portParam("port", "MQTT port", portText, 5);
  WiFiManagerParameter nodeParam("node", "Node id (e.g. ai-camera-01)", out.nodeId.c_str(), 32);

  WiFiManager wm;
  wm.addParameter(&hostParam);
  wm.addParameter(&portParam);
  wm.addParameter(&nodeParam);
  wm.setSaveParamsCallback([] { shouldSave = true; });
  wm.setSaveConfigCallback([] { shouldSave = true; });
  wm.setConfigPortalTimeout(PORTAL_TIMEOUT_S);
  wm.setConnectTimeout(WIFI_CONNECT_TIMEOUT_S);

  const String ap = portalApName();
  // The portal also opens on its own when settings are missing - a camera
  // without a broker/node id can't do anything useful.
  const bool missingSettings = out.brokerHost.isEmpty() || out.nodeId.isEmpty();
  const bool connected = (forcePortal || missingSettings) ? wm.startConfigPortal(ap.c_str()) : wm.autoConnect(ap.c_str());

  if (shouldSave) {
    out.brokerHost = hostParam.getValue();
    out.brokerPort = static_cast<uint16_t>(atoi(portParam.getValue()));
    if (out.brokerPort == 0) out.brokerPort = DEFAULT_BROKER_PORT;
    out.nodeId = nodeParam.getValue();
    out.brokerHost.trim();
    out.nodeId.trim();
    prefs.putString(KEY_HOST, out.brokerHost);
    prefs.putUShort(KEY_PORT, out.brokerPort);
    prefs.putString(KEY_NODE, out.nodeId);
  }
  prefs.end();
  return connected && !out.brokerHost.isEmpty() && !out.nodeId.isEmpty();
}
