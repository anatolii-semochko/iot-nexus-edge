// EdgeX message-bus bridge for device pushes (AGENTS.md section 80).
//
// A device that publishes on its own (an MQTT node's `state` topic today)
// reaches EdgeX as an async reading - device-service tags every such event
// `nexusPush=true` (apps/device-service internal/transport, PushTag). This
// module subscribes to EdgeX's own internal message bus and hands exactly
// those events to the Device API's normal reading path
// (routes/devices.ts publishPushedReading), so a pushed value reaches the
// UI and orchestrator processes immediately instead of on the next poll.
//
// Every OTHER event on the bus is ignored on purpose: EdgeX also emits one
// for each ordinary core-command read/write, and those already went
// through the Device API's own read path - processing them here too would
// publish every polled reading twice.

import mqtt from "mqtt";

import { config } from "./config.js";
import { normalizeReading, type EdgeXReading } from "./edgex.js";
import { logger } from "./logger.js";
import { publishPushedReading } from "./routes/devices.js";

// Must match device-service's transport.PushTag.
const PUSH_TAG = "nexusPush";
// Every device event EdgeX publishes: edgex/events/device/<service>/<profile>/<device>/<source>.
const EVENTS_TOPIC = "edgex/events/device/#";

interface BusEnvelope {
  payload?: {
    event?: {
      deviceName?: string;
      tags?: Record<string, string>;
      readings?: EdgeXReading[];
    };
  };
}

export function startEdgexPushBridge(): void {
  const { host, port } = config.edgex.messageBus;
  if (!host) {
    logger.warn("EDGEX_MESSAGEBUS_HOST not set - device pushes will not be bridged (polling still works)");
    return;
  }

  // Auto-reconnects on its own (mqtt.js default), so neither an EdgeX bus
  // restart nor this API starting before the broker needs a restart here.
  const client = mqtt.connect({ host, port, clientId: config.edgex.messageBus.clientId, clean: true });
  client.on("connect", () => {
    logger.info({ host, port }, "EdgeX push bridge connected");
    client.subscribe(EVENTS_TOPIC, { qos: 0 }, (err) => {
      if (err) logger.error({ err }, "EdgeX push bridge: subscribe failed");
    });
  });
  client.on("error", (err) => logger.warn({ err }, "EdgeX push bridge: connection error"));
  client.on("message", (_topic, payload) => {
    void handleMessage(payload).catch((err) => logger.warn({ err }, "EdgeX push bridge: failed to handle event"));
  });
}

async function handleMessage(payload: Buffer): Promise<void> {
  const event = (JSON.parse(payload.toString("utf8")) as BusEnvelope).payload?.event;
  if (event?.tags?.[PUSH_TAG] !== "true" || !event.deviceName) return;
  const reading = event.readings?.[0];
  if (!reading) return;

  const normalized = normalizeReading(reading);
  // EdgeX origin is nanoseconds since epoch - ms for everything on this side.
  const originMs = Math.floor(normalized.origin / 1e6);
  const delivered = await publishPushedReading(event.deviceName, originMs, normalized.value);
  if (delivered === 0) {
    logger.debug({ edgexDevice: event.deviceName }, "EdgeX push bridge: no active Device for this EdgeX device");
  }
}
