// Routes device events to process onDeviceEvent hooks (AGENTS.md section
// 80), serialized with each process's own tick (processLock.ts).

import type { ProcessRecord } from "./apiClient.js";
import { logger } from "./logger.js";
import { runExclusive } from "./processLock.js";
import { processRegistry, type DeviceEvent } from "./processRegistry.js";

// Refreshed by every tick (server.ts) - events between ticks use the list
// from the most recent one, so no extra API call per event.
let knownProcesses: ProcessRecord[] = [];

export function setKnownProcesses(processes: ProcessRecord[]): void {
  knownProcesses = processes;
}

export function processLockedRun(processId: number, fn: () => Promise<void>): Promise<void> {
  return runExclusive(processId, fn);
}

export function dispatchDeviceEvent(event: DeviceEvent): void {
  for (const process of knownProcesses) {
    const onDeviceEvent = processRegistry.hooks(process.kind)?.onDeviceEvent;
    if (!onDeviceEvent) continue;
    void runExclusive(process.id, () => onDeviceEvent(process, event)).catch((err) =>
      logger.warn({ err, processId: process.id, kind: process.kind, deviceId: event.deviceId }, "onDeviceEvent failed"),
    );
  }
}
