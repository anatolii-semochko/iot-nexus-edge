// Coalesced device value reads (iot PERF_PROD_2026-11-05.md): processes of
// one tick each ask POST /devices/values for their own devices - the asks
// that arrive within config.batchWindowMs (and the same maxAgeMs) go
// to the API as one request; each caller gets back only its own ids.

import { config } from "./config.js";

export type DeviceValues = Record<number, { value: unknown; at: number | null; source: string }>;
type Fetch = (ids: number[], maxAgeMs?: number) => Promise<{ values: DeviceValues }>;

interface Pending {
  ids: Set<number>;
  waiters: { ids: number[]; resolve: (v: { values: DeviceValues }) => void; reject: (e: unknown) => void }[];
}

export function createValueBatcher(fetch: Fetch, windowMs = config.batchWindowMs) {
  const pending = new Map<string, Pending>();
  return (ids: number[], maxAgeMs?: number): Promise<{ values: DeviceValues }> => {
    if (windowMs <= 0) return fetch(ids, maxAgeMs);
    const key = String(maxAgeMs ?? "");
    let batch = pending.get(key);
    if (!batch) {
      const created: Pending = { ids: new Set(), waiters: [] };
      batch = created;
      pending.set(key, created);
      setTimeout(() => {
        pending.delete(key);
        fetch([...created.ids], maxAgeMs).then(
          ({ values }) => {
            for (const w of created.waiters) {
              const own: DeviceValues = {};
              for (const id of w.ids) if (id in values) own[id] = values[id];
              w.resolve({ values: own });
            }
          },
          (err) => created.waiters.forEach((w) => w.reject(err)),
        );
      }, windowMs);
    }
    for (const id of ids) batch.ids.add(id);
    const target = batch;
    return new Promise((resolve, reject) => target.waiters.push({ ids, resolve, reject }));
  };
}
