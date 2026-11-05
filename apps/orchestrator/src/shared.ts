// Shared reads (iot PERF_PROD_2026-11-05.md - on a small server every
// HTTP round trip costs more than the work behind it): several processes
// of one tick asking the API for the same list get one request.
// - `tickShared(key, fn)` - a result younger than config.tickShareMs (or
//   still in flight) is reused: the nodes / processes lists, fresh each tick;
// - `cachedRead(key, tables, fn)` - a reference read kept until one of
//   `tables` changes (changeEvents.ts) or config.referenceCacheMs passes,
//   the long safety net when a change event is missed.

import { onEntityChange } from "./changeEvents.js";
import { config } from "./config.js";

interface Entry {
  at: number;
  value: Promise<unknown>;
}

const shared = new Map<string, Entry>();
const cached = new Map<string, Entry>();

function reuse<T>(store: Map<string, Entry>, key: string, maxAgeMs: number, fn: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = store.get(key);
  if (hit && now - hit.at < maxAgeMs) return hit.value as Promise<T>;
  const value = fn();
  const entry = { at: now, value };
  store.set(key, entry);
  // a failed read is not kept - the next caller asks again
  value.catch(() => {
    if (store.get(key) === entry) store.delete(key);
  });
  return value;
}

/** One request per `key` per tick: a result younger than config.tickShareMs (or in flight) is reused. */
export function tickShared<T>(key: string, fn: () => Promise<T>): Promise<T> {
  return reuse(shared, key, config.tickShareMs, fn);
}

/** Puts a fresh result in for `key` - the tick's own list read (server.ts). */
export function setTickShared<T>(key: string, value: Promise<T>): void {
  shared.set(key, { at: Date.now(), value });
}

const watched = new Map<string, Set<string>>(); // table -> keys

/** A reference read kept until one of `tables` changes (or config.referenceCacheMs). */
export function cachedRead<T>(key: string, tables: string[], fn: () => Promise<T>): Promise<T> {
  for (const table of tables) {
    let keys = watched.get(table);
    if (!keys) {
      keys = new Set();
      watched.set(table, keys);
      const own = keys;
      onEntityChange([table], (change) => {
        if (change.table === "all") cached.clear();
        else for (const k of own) cached.delete(k);
      });
    }
    keys.add(key);
  }
  return reuse(cached, key, config.referenceCacheMs, fn);
}
