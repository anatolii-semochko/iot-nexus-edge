import type { ProcessRecord } from "./apiClient.js";

// The process list of the current tick (server.ts fetches it once per
// tick - with each process's live metrics and status): the runners, the
// device event dispatcher (processDispatch.ts) and the plugins (their
// ctx.tickProcesses) read it here instead of listing the processes again
// (nexus-edge-aquarium AGENTS_TO_DO.md 2026-10-16, the Raspberry budget).
// Between ticks - the most recent one's.
let current: ProcessRecord[] = [];

export function setTickProcesses(processes: ProcessRecord[]): void {
  current = processes;
}

export function tickProcesses(): ProcessRecord[] {
  return current;
}
