import type { ProcessRecord } from "./apiClient.js";

export type ProcessRunner = (process: ProcessRecord) => Promise<void>;

/**
 * One device reading as delivered from nexus.events (AGENTS.md section 80)
 * - pushed by a device on its own (`source: "device-push"`), or any other
 * reading/write the Devices API published. Handlers filter by `deviceId`.
 */
export interface DeviceEvent {
  deviceId: number;
  value: unknown;
  timestamp: string;
  source: string;
}

/**
 * Optional, event-driven entry points of a process kind, alongside its
 * per-tick runner (AGENTS.md section 80). A process's hooks and its tick
 * never run concurrently (processLock.ts), so both can share the plugin's
 * own in-memory state safely.
 */
export interface ProcessHooks {
  onDeviceEvent?: (process: ProcessRecord, event: DeviceEvent) => Promise<void>;
}

const runners = new Map<string, ProcessRunner>();
const hooksByKind = new Map<string, ProcessHooks>();

/**
 * process.kind -> its control-loop function (AGENTS.md section 10).
 * Built-in kinds (see index.ts) register through this exact same
 * register() a target-project plugin would use - extension points
 * design, AGENTS_TO_DO.md 2026-07-28 - no special-casing for "official" kinds.
 */
export const processRegistry = {
  register(kind: string, runner: ProcessRunner, hooks?: ProcessHooks): void {
    if (runners.has(kind)) {
      throw new Error(`process kind "${kind}" is already registered`);
    }
    runners.set(kind, runner);
    if (hooks) hooksByKind.set(kind, hooks);
  },
  get(kind: string): ProcessRunner | undefined {
    return runners.get(kind);
  },
  hooks(kind: string): ProcessHooks | undefined {
    return hooksByKind.get(kind);
  },
  // Currently-loaded kind names (AGENTS_TO_DO.md, 2026-08-14 process
  // management) - exposed via GET /process-kinds so apps/api/UI can tell
  // a `processes` row whose kind was just added to the Postgres table
  // apart from one whose plugin code is actually loaded in this running
  // orchestrator (the latter only happens at startup - processPlugins.ts's
  // own loadProcessPlugins() runs once, not on a timer).
  list(): string[] {
    return [...runners.keys()];
  },
};
