// Routes device events to process onDeviceEvent hooks (AGENTS.md section
// 80), serialized with each process's own tick (processLock.ts).

import { logger } from "./logger.js";
import { runExclusive } from "./processLock.js";
import { processRegistry, type DeviceEvent } from "./processRegistry.js";
import { tickProcesses } from "./tickProcesses.js";

export function processLockedRun(processId: number, fn: () => Promise<void>): Promise<void> {
  return runExclusive(processId, fn);
}

export function dispatchDeviceEvent(event: DeviceEvent): void {
  // the most recent tick's list - no extra API call per event
  for (const process of tickProcesses()) {
    const onDeviceEvent = processRegistry.hooks(process.kind)?.onDeviceEvent;
    if (!onDeviceEvent) continue;
    void runExclusive(process.id, () => onDeviceEvent(process, event)).catch((err) =>
      logger.warn({ err, processId: process.id, kind: process.kind, deviceId: event.deviceId }, "onDeviceEvent failed"),
    );
  }
}
