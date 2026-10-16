import { EventEmitter } from "node:events";

import { Client } from "pg";

import { config } from "./config.js";
import { logger } from "./logger.js";
import { publishChangeEvent } from "./messaging.js";

// Change notifications (migrations/1690000000062; nexus-edge-aquarium
// AGENTS_TO_DO.md 2026-10-16, item 10): Postgres tells which watched row
// changed (`LISTEN entity_changes`, sent on commit by the `notify_change`
// trigger - whoever wrote it); each is
// - relayed to `nexus.events` as `<table>.<id>.changed` - the
//   orchestrator's processes drop their caches by it (and the gateway
//   passes it to the UI);
// - emitted here (`entityChanges.on("change", ...)`) for this service's
//   own caches.
// A change held outside Postgres (a process's ON / OFF status - Redis)
// is announced by its route (`announceChange`). After the LISTEN
// connection is (re)opened a `resync` goes out: what changed while it was
// down is unknown, every cache is to be dropped.

export interface EntityChange {
  table: string;
  id: number | null;
  op: "insert" | "update" | "delete" | "resync";
}

export const entityChanges = new EventEmitter();

function deliver(change: EntityChange, source: string): void {
  entityChanges.emit("change", change);
  void publishChangeEvent({
    domain: change.table,
    entityId: change.id,
    op: change.op,
    timestamp: new Date().toISOString(),
    source,
  });
}

/** A change Postgres can't see (state held elsewhere) - same event as a row change. */
export function announceChange(table: string, id: number): void {
  deliver({ table, id, op: "update" }, "api");
}

export function startEntityChangeListener(): void {
  const connect = async () => {
    const client = new Client({
      host: config.postgres.host,
      port: config.postgres.port,
      database: config.postgres.database,
      user: config.postgres.user,
      password: config.postgres.password,
    });
    let reconnecting = false;
    const reconnect = (err?: unknown) => {
      if (reconnecting) return;
      reconnecting = true;
      logger.warn({ err }, "entity change listener disconnected - reconnecting");
      client.end().catch(() => undefined);
      setTimeout(() => void connect(), config.entityChanges.reconnectMs);
    };
    client.on("error", reconnect);
    client.on("end", () => reconnect());
    client.on("notification", (msg) => {
      try {
        const n = JSON.parse(msg.payload ?? "{}") as { table: string; op: EntityChange["op"]; id: string | null };
        deliver({ table: n.table, op: n.op, id: n.id === null ? null : Number(n.id) }, "db");
      } catch (err) {
        logger.warn({ err, payload: msg.payload }, "entity change: invalid payload");
      }
    });
    try {
      await client.connect();
      await client.query("LISTEN entity_changes");
      logger.info("entity change listener connected");
      deliver({ table: "all", id: null, op: "resync" }, "api");
    } catch (err) {
      reconnect(err);
    }
  };
  void connect();
}
