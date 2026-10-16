import { logger } from "./logger.js";

// Change events (nexus.events `<table>.<id>.changed` - the api's
// entityChanges.ts relays Postgres' notifications): a process / plugin
// drops what it cached the moment it changes, not after a TTL
// (nexus-edge-aquarium AGENTS_TO_DO.md 2026-10-16, item 10).
// `onEntityChange(tables, listener)` - `tables` the watched tables (a
// plugin's own included); a `resync` (the api's or this service's bus
// connection was reopened - changes may have been missed) reaches every
// listener as `{table: "all", id: null}`: drop everything. A cache keeps
// a long TTL as the last safety net only.

export interface EntityChange {
  table: string;
  id: number | null;
  op: "insert" | "update" | "delete" | "resync";
}
export type EntityChangeListener = (change: EntityChange) => void;

const listeners: { tables: Set<string>; listener: EntityChangeListener }[] = [];

/** Calls `listener` on a change of one of `tables` (and on a resync); returns the unsubscribe. */
export function onEntityChange(tables: string[], listener: EntityChangeListener): () => void {
  const entry = { tables: new Set(tables), listener };
  listeners.push(entry);
  return () => {
    const i = listeners.indexOf(entry);
    if (i >= 0) listeners.splice(i, 1);
  };
}

export function emitEntityChange(change: EntityChange): void {
  for (const { tables, listener } of [...listeners]) {
    if (change.op !== "resync" && !tables.has(change.table)) continue;
    try {
      listener(change);
    } catch (err) {
      logger.warn({ err, change }, "entity change listener failed");
    }
  }
}
