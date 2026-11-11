// nexus.events -> this service (one connection, one queue):
// - `device.<id>.updated` with a reading -> process onDeviceEvent hooks
//   (AGENTS.md section 80): a process reacts to a reading the moment the
//   Devices API publishes it - above all a device's own push - instead of
//   only seeing the value on its next 1s tick poll (where two changes
//   inside one tick collapse into the last one);
// - `<table>.<id>.changed` (the api's entityChanges.ts) -> the change
//   listeners (changeEvents.ts) - caches dropped at once.

import amqp from "amqp-connection-manager";
import type { ConsumeMessage } from "amqplib";

import { emitEntityChange, type EntityChange } from "./changeEvents.js";
import { config } from "./config.js";
import { logger } from "./logger.js";
import type { DeviceEvent } from "./processRegistry.js";

const EXCHANGE = "nexus.events";
// Readings/writes: `device.<id>.updated`. Metadata-only events share the
// routing key but carry no `value` and are skipped below (a metadata
// change reaches the change listeners as `devices.<id>.changed` - the
// row's own notification).
const DEVICE_KEY = "device.*.updated";
const CHANGE_KEY = "*.*.changed";

export function startBusSubscription(onDeviceEvent: (event: DeviceEvent) => void): void {
  if (!config.rabbitmq) {
    logger.warn("RABBITMQ_HOST not set - process onDeviceEvent hooks and change events are disabled (tick and cache TTLs still run)");
    return;
  }

  // Auto-reconnects and re-runs setup on its own - same library and
  // reasoning as apps/api/src/messaging.ts.
  const connection = amqp.connect([config.rabbitmq.url]);
  connection.on("connect", () => logger.info("bus subscription connected"));
  connection.on("disconnect", ({ err }) => logger.warn({ err }, "bus subscription disconnected"));

  connection.createChannel({
    json: false,
    setup: async (channel: import("amqplib").ConfirmChannel) => {
      await channel.assertExchange(EXCHANGE, "topic", { durable: true });
      // Exclusive + auto-delete: a fresh queue per connection, nothing left
      // behind - readings missed while disconnected are acceptable (the
      // tick still sees the latest value); changes missed are covered by
      // the resync below.
      const { queue } = await channel.assertQueue("", { exclusive: true, autoDelete: true });
      await channel.bindQueue(queue, EXCHANGE, DEVICE_KEY);
      await channel.bindQueue(queue, EXCHANGE, CHANGE_KEY);
      await channel.consume(queue, (msg: ConsumeMessage | null) => {
        if (!msg) return;
        channel.ack(msg);
        let envelope: { entityId?: number | null; value?: unknown; timestamp?: string; source?: string; domain?: string; op?: string };
        try {
          envelope = JSON.parse(msg.content.toString("utf8"));
        } catch (err) {
          logger.warn({ err }, "bus event: invalid JSON");
          return;
        }
        if (msg.fields.routingKey.endsWith(".changed")) {
          if (typeof envelope.domain !== "string") return;
          emitEntityChange({
            table: envelope.domain,
            id: typeof envelope.entityId === "number" ? envelope.entityId : null,
            op: (envelope.op ?? "update") as EntityChange["op"],
          });
          return;
        }
        if (typeof envelope.entityId !== "number" || !("value" in envelope)) return;
        onDeviceEvent({
          deviceId: envelope.entityId,
          value: envelope.value,
          timestamp: envelope.timestamp ?? new Date().toISOString(),
          source: envelope.source ?? "unknown",
        });
      });
      // (re)subscribed: what changed while this queue didn't exist is unknown
      emitEntityChange({ table: "all", id: null, op: "resync" });
    },
  });
}
