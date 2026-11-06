// CPU-heavy work off the main thread (iot PERF_PROD_2026-11-05.md): a
// process plugin's pure computation (e.g. the heating planner's strategies)
// runs in a worker thread - `ctx.compute(moduleUrl, exportName, args)`.
// While it computes, the tick and the other processes keep running; the
// event loop delay in the tick stats shows when something still computes
// on the main thread.
//
// One long-lived worker (computeWorker.ts), the jobs answered by id; a
// worker that died fails its pending jobs and is started again on the next
// job. The function and its arguments / result must be plain data
// (structured clone) - no closures, no class instances with methods.

import { Worker } from "node:worker_threads";

import { logger } from "./logger.js";

interface Pending {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
}

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, Pending>();

// the worker's file next to this one - .ts under the tests, .js when built
const workerUrl = new URL(import.meta.url.endsWith(".ts") ? "./computeWorker.ts" : "./computeWorker.js", import.meta.url);

function failAll(err: Error): void {
  for (const p of pending.values()) p.reject(err);
  pending.clear();
}

function current(): Worker {
  if (worker) return worker;
  const w = new Worker(workerUrl);
  w.on("message", ({ id, result, error }: { id: number; result?: unknown; error?: string }) => {
    const p = pending.get(id);
    if (!p) return;
    pending.delete(id);
    if (error !== undefined) p.reject(new Error(error));
    else p.resolve(result);
  });
  w.on("error", (err) => {
    logger.warn({ err }, "compute worker failed - started again on the next job");
    if (worker === w) worker = null;
    failAll(err);
  });
  w.on("exit", (code) => {
    if (worker === w) worker = null;
    if (pending.size) failAll(new Error(`compute worker exited (${code})`));
  });
  // no job pending - the worker doesn't keep the process alive
  w.unref();
  worker = w;
  return w;
}

/** Runs `exportName` of the module at `moduleUrl` (a file URL) on `args` in the compute worker. */
export function compute<T = unknown>(moduleUrl: string, exportName: string, args: unknown[]): Promise<T> {
  const id = ++seq;
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
    current().postMessage({ id, moduleUrl, exportName, args });
  });
}

/** Stops the worker (tests). */
export async function stopCompute(): Promise<void> {
  const w = worker;
  worker = null;
  if (w) await w.terminate();
}
