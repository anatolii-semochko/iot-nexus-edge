// Coalesced requests (iot PERF_PROD_2026-11-05.md): the calls of processes
// running together within config.batchWindowMs go to the API as one request
// - `createBatcher(send)` returns a function taking one item; `send` gets
// all the window's items and answers each (in their order) with its own
// outcome, so one failing item fails only its caller. A window of 0 - every
// item sent alone.

import { config } from "./config.js";

export type Outcome<R> = { ok: true; value: R } | { ok: false; error: Error };

export function createBatcher<I, R>(send: (items: I[]) => Promise<Outcome<R>[]>, windowMs = config.batchWindowMs) {
  type Waiting = { item: I; resolve: (r: R) => void; reject: (e: unknown) => void };
  let pending: Waiting[] | null = null;
  const flush = (batch: Waiting[]) => {
    send(batch.map((b) => b.item)).then(
      (outcomes) =>
        batch.forEach((b, i) => {
          const o = outcomes[i];
          if (!o) b.reject(new Error("no answer for this item"));
          else if (o.ok) b.resolve(o.value);
          else b.reject(o.error);
        }),
      (err) => batch.forEach((b) => b.reject(err)),
    );
  };
  return (item: I): Promise<R> =>
    new Promise<R>((resolve, reject) => {
      if (windowMs <= 0) return flush([{ item, resolve, reject }]);
      let batch = pending;
      if (!batch) {
        const fresh: Waiting[] = [];
        batch = fresh;
        pending = fresh;
        setTimeout(() => {
          pending = null;
          flush(fresh);
        }, windowMs);
      }
      batch.push({ item, resolve, reject });
    });
}
