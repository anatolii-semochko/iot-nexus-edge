// Shared reads (iot PERF_PROD_2026-11-05.md - on a small server every
// HTTP round trip costs more than the work behind it): several processes
// of one tick asking the API for the same list get one request.
// - `tickShared(key, fn)` - one read per tick: the nodes / processes lists,
//   read once in a tick (server.ts starts each with `beginTick`) and reused by
//   its processes and by the event hooks until the next tick;
// - `cachedRead(key, tables, fn)` - a reference read kept until one of
//   `tables` changes (changeEvents.ts) or config.referenceCacheMs passes,
//   the long safety net when a change event is missed.

import { onEntityChange } from "./changeEvents.js";
import { config } from "./config.js";

interface Entry {
  at: number;
  value: Promise<unknown>;
}

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

// the tick in progress (server.ts) - a tick-shared read is reused within it
let tick = 0;
const sharedTick = new Map<string, { tick: number; value: Promise<unknown> }>();

/** A new tick begins - the tick-shared reads are read again. */
export function beginTick(): void {
  tick += 1;
}

/** One request per `key` per tick: a read of this tick (or still in flight) is reused. */
export function tickShared<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const hit = sharedTick.get(key);
  if (hit && hit.tick === tick) return hit.value as Promise<T>;
  return setTickShared(key, fn());
}

/** Puts this tick's read in for `key` (the tick's own list read - server.ts); a failed one is not kept. */
export function setTickShared<T>(key: string, value: Promise<T>): Promise<T> {
  const entry = { tick, value };
  sharedTick.set(key, entry);
  value.catch(() => {
    if (sharedTick.get(key) === entry) sharedTick.delete(key);
  });
  return value;
}

const watched = new Map<string, Set<string>>(); // table -> keys

// the expired entries dropped on a read that misses - a key that is never asked again (a plugin's
// day-keyed plan) doesn't stay forever
function sweep(now: number): void {
  for (const [key, entry] of cached) {
    if (now - entry.at < config.referenceCacheMs) continue;
    cached.delete(key);
    for (const keys of watched.values()) keys.delete(key);
  }
}

/** A reference read kept until one of `tables` changes (or config.referenceCacheMs). */
export function cachedRead<T>(key: string, tables: string[], fn: () => Promise<T>): Promise<T> {
  const hit = cached.get(key);
  if (!hit || Date.now() - hit.at >= config.referenceCacheMs) sweep(Date.now());
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
