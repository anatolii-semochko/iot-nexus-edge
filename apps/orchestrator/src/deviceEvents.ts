// nexus.events -> process onDeviceEvent hooks (AGENTS.md section 80).
//
// Lets a process react to a device reading the moment the Devices API
// publishes it - above all a device's own push - instead of only seeing
// the value on its next 1s tick poll (where two changes inside one tick
// collapse into the last one).

import amqp from "amqp-connection-manager";
import type { ConsumeMessage } from "amqplib";

import { config } from "./config.js";
import { logger } from "./logger.js";
import type { DeviceEvent } from "./processRegistry.js";

const EXCHANGE = "nexus.events";
// Readings/writes only: `device.<id>.updated`. Metadata-only events share
// the routing key but carry no `value` and are skipped below.
const ROUTING_KEY = "device.*.updated";

export function startDeviceEventSubscription(onEvent: (event: DeviceEvent) => void): void {
  if (!config.rabbitmq) {
    logger.warn("RABBITMQ_HOST not set - process onDeviceEvent hooks are disabled (tick still runs)");
    return;
  }

  // Auto-reconnects and re-runs setup on its own - same library and
  // reasoning as apps/api/src/messaging.ts.
  const connection = amqp.connect([config.rabbitmq.url]);
  connection.on("connect", () => logger.info("device event subscription connected"));
  connection.on("disconnect", ({ err }) => logger.warn({ err }, "device event subscription disconnected"));

  connection.createChannel({
    json: false,
    setup: async (channel: import("amqplib").ConfirmChannel) => {
      await channel.assertExchange(EXCHANGE, "topic", { durable: true });
      // Exclusive + auto-delete: a fresh queue per connection, nothing left
      // behind - missed events while disconnected are acceptable, the tick
      // still sees the latest value.
      const { queue } = await channel.assertQueue("", { exclusive: true, autoDelete: true });
      await channel.bindQueue(queue, EXCHANGE, ROUTING_KEY);
      await channel.consume(queue, (msg: ConsumeMessage | null) => {
        if (!msg) return;
        channel.ack(msg);
        let envelope: { entityId?: number; value?: unknown; timestamp?: string; source?: string };
        try {
          envelope = JSON.parse(msg.content.toString("utf8"));
        } catch (err) {
          logger.warn({ err }, "device event: invalid JSON");
          return;
        }
        if (typeof envelope.entityId !== "number" || !("value" in envelope)) return;
        onEvent({
          deviceId: envelope.entityId,
          value: envelope.value,
          timestamp: envelope.timestamp ?? new Date().toISOString(),
          source: envelope.source ?? "unknown",
        });
      });
    },
  });
}
