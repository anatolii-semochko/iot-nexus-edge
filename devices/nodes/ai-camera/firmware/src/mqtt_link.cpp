#include "mqtt_link.h"

#include <mqtt_client.h>

#include "config.h"

namespace {
esp_mqtt_client_handle_t client = nullptr;
volatile bool connected = false;
String uri;
String clientId;
String imageTopic;
String resultTopic;
String statusTopic;

// The MQTT task hands results to loop() through this slot. A mutex, not a
// critical section: copying a String allocates, which isn't allowed with
// interrupts disabled.
SemaphoreHandle_t resultLock = nullptr;
String pendingResult;

void onEvent(void *, esp_event_base_t, int32_t eventId, void *eventData) {
  auto *event = static_cast<esp_mqtt_event_handle_t>(eventData);
  switch (static_cast<esp_mqtt_event_id_t>(eventId)) {
    case MQTT_EVENT_CONNECTED:
      connected = true;
      esp_mqtt_client_subscribe(client, resultTopic.c_str(), 1);
      esp_mqtt_client_publish(client, statusTopic.c_str(), STATUS_ONLINE, 0, 1, 1);
      break;
    case MQTT_EVENT_DISCONNECTED:
      connected = false;
      break;
    case MQTT_EVENT_DATA: {
      // Results are small; a message fragmented across events (larger than
      // MQTT_IN_BUFFER_BYTES) is not a valid result and is dropped.
      if (event->current_data_offset != 0 || event->data_len != event->total_data_len) break;
      if (resultTopic.length() != static_cast<size_t>(event->topic_len) ||
          strncmp(event->topic, resultTopic.c_str(), event->topic_len) != 0)
        break;
      String payload;
      payload.reserve(event->data_len);
      for (int i = 0; i < event->data_len; i++) payload += event->data[i];
      xSemaphoreTake(resultLock, portMAX_DELAY);
      pendingResult = payload;
      xSemaphoreGive(resultLock);
      break;
    }
    default:
      break;
  }
}
}  // namespace

bool mqttBegin(const NodeSettings &settings) {
  resultLock = xSemaphoreCreateMutex();
  if (!resultLock) return false;
  const String base = String(TOPIC_ROOT) + "/" + settings.nodeId + "/";
  imageTopic = base + DEVICE_IMAGE + "/state";
  resultTopic = base + DEVICE_RESULT + "/set";
  statusTopic = base + "status";
  uri = "mqtt://" + settings.brokerHost + ":" + String(settings.brokerPort);
  clientId = settings.nodeId;

  // ESP-IDF 4.4 (Arduino-ESP32 2.0.x) flat config layout - see platformio.ini.
  esp_mqtt_client_config_t config = {};
  config.uri = uri.c_str();
  config.client_id = clientId.c_str();
  config.keepalive = MQTT_KEEPALIVE_S;
  config.buffer_size = MQTT_IN_BUFFER_BYTES;
  config.out_buffer_size = MQTT_OUT_BUFFER_BYTES;
  config.lwt_topic = statusTopic.c_str();
  config.lwt_msg = STATUS_OFFLINE;
  config.lwt_qos = 1;
  config.lwt_retain = 1;

  client = esp_mqtt_client_init(&config);
  if (!client) return false;
  esp_mqtt_client_register_event(client, MQTT_EVENT_ANY, onEvent, nullptr);
  return esp_mqtt_client_start(client) == ESP_OK;
}

bool mqttConnected() { return connected; }

bool mqttPublishFrame(const uint8_t *data, size_t length) {
  if (!client || !connected) return false;
  // Blocks until the frame is written out; QoS 1 keeps it in the outbox
  // until the broker acknowledges. Not retained: a retained frame would be
  // re-sent to NexusEdge on every reconnect (nexus-edge AGENTS.md section 81).
  return esp_mqtt_client_publish(client, imageTopic.c_str(), reinterpret_cast<const char *>(data),
                                 static_cast<int>(length), 1, 0) >= 0;
}

String mqttTakeResult() {
  if (!resultLock) return "";
  xSemaphoreTake(resultLock, portMAX_DELAY);
  String result = pendingResult;
  pendingResult = "";
  xSemaphoreGive(resultLock);
  return result;
}
