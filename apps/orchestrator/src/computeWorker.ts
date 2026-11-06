// The compute worker (compute.ts): imports a plugin's module once and runs
// one of its exports on the arguments it is sent - off the orchestrator's
// main thread, so a long computation never stops the tick.

import { parentPort } from "node:worker_threads";

interface Job {
  id: number;
  moduleUrl: string;
  exportName: string;
  args: unknown[];
}

const modules = new Map<string, Promise<Record<string, unknown>>>();

parentPort?.on("message", async ({ id, moduleUrl, exportName, args }: Job) => {
  try {
    let mod = modules.get(moduleUrl);
    if (!mod) {
      mod = import(moduleUrl) as Promise<Record<string, unknown>>;
      modules.set(moduleUrl, mod);
    }
    const fn = (await mod)[exportName];
    if (typeof fn !== "function") throw new Error(`${moduleUrl} has no function export "${exportName}"`);
    parentPort?.postMessage({ id, result: await (fn as (...a: unknown[]) => unknown)(...args) });
  } catch (err) {
    parentPort?.postMessage({ id, error: err instanceof Error ? err.message : String(err) });
  }
});
