import Fastify, { type FastifyInstance } from "fastify";

import { apiClient, type ProcessRecord } from "./apiClient.js";
import { config } from "./config.js";
import { startBusSubscription } from "./busEvents.js";
import { logger } from "./logger.js";
import { loadProcessPlugins } from "./processPlugins.js";
import { runAiAssistant } from "./processes/aiAssistant.js";
import { runDataLogger } from "./processes/dataLogger.js";
import { runHeartbeatControl } from "./processes/heartbeatControl.js";
import { runHeartbeatControlTest } from "./processes/heartbeatControlTest.js";
import { runResourceMonitor } from "./processes/resourceMonitor.js";
import { dispatchDeviceEvent, processLockedRun } from "./processDispatch.js";
import { setTickProcesses } from "./tickProcesses.js";
import { processRegistry } from "./processRegistry.js";
import { TICK_INTERVAL_MS } from "./tickInterval.js";
import { tickStats } from "./tickStats.js";

// Built-in process kinds (AGENTS.md section 10) - registered through the
// same processRegistry a target-project plugin would use (extension
// points design, AGENTS_TO_DO.md 2026-07-28/29). CORE is deliberately
// kept to a handful of genuinely base-platform system processes
// (AGENTS_TO_DO.md, 2026-08-02 "CORE чистим і порожнім" decision) -
// temperature-control/temperature-monitor moved out first (2026-07-29),
// active-buzzer/alarm-annunciator followed (2026-08-02) - all four were
// always a demo/recipe assembly on top of Library devices, not a base
// system capability; nexus-edge-smart-house now owns those recipes as
// its own process plugins (see processPlugins.ts).
function registerBuiltinProcessKinds(): void {
  processRegistry.register("resource-monitor", runResourceMonitor);
  processRegistry.register("heartbeat-control", runHeartbeatControl);
  processRegistry.register("heartbeat-control-test", runHeartbeatControlTest);
  processRegistry.register("data-logger", runDataLogger);
  processRegistry.register("ai-assistant", runAiAssistant, { intervalMs: config.aiCalendarIntervalMs });
}

// Re-entrancy guard (AGENTS_TO_DO.md, 2026-08-29) - setInterval below
// fires every TICK_INTERVAL_MS regardless of whether the previous
// tick()'s own async work has finished; without this flag, any tick
// slower than 1s (plausible under real load, e.g. a busy Raspberry Pi)
// lets the NEXT interval firing start a second, fully overlapping tick
// on top of the first - found live as a genuine, self-compounding
// snowball: ~500 req/s sustained against apps/api (measured directly
// off its own request logs) where the design intends ~1/s, container
// CPU pinned, growing worse over the container's own uptime. Every
// process runner below fires concurrently (Promise.all), so N
// overlapping ticks means N times the API traffic, not N+1.
let tickInProgress = false;
// when each process's runner last ran (its kind's `intervalMs`)
const lastRunAt = new Map<number, number>();

async function tick(): Promise<void> {
  if (tickInProgress) {
    logger.warn("tick: previous tick still running - skipping this interval firing");
    tickStats.skipped();
    return;
  }
  tickInProgress = true;
  const started = performance.now();
  try {
    await tickBody();
  } finally {
    tickInProgress = false;
    const window = tickStats.tick(performance.now() - started);
    if (window) logger.info({ tickStats: window }, "tick load (last window)");
  }
}

async function tickBody(): Promise<void> {
  // Fire-and-forget, not awaited - a slow/failed publish must never delay
  // this tick's actual process runners below (AGENTS_TO_DO.md, 2026-08-01:
  // purely a cosmetic "system is alive" signal, see apiClient.tick()).
  void apiClient.tick().catch((err) => logger.warn({ err }, "failed to publish system tick"));

  let processes: ProcessRecord[];
  try {
    processes = await apiClient.listProcesses();
  } catch (err) {
    logger.warn({ err }, "failed to list processes");
    return;
  }
  // The runners, the plugins and the event dispatcher (processDispatch.ts)
  // read the list the tick just fetched (tickProcesses.ts) - one list call
  // per second, not one per runner or event.
  setTickProcesses(processes);

  // Heartbeating Control (AGENTS.md) - every process id whose runner
  // completed *without throwing* this tick, collected here and touched
  // once at the end in a single batched call, not one HTTP round trip
  // per process per second.
  const alive: number[] = [];

  await Promise.all(
    processes.map(async (process) => {
      const runner = processRegistry.get(process.kind);
      if (!runner) return;
      // a kind with its own interval runs only when due (half a tick of slack)
      const intervalMs = processRegistry.hooks(process.kind)?.intervalMs ?? 0;
      const now = Date.now();
      if (intervalMs > TICK_INTERVAL_MS && now - (lastRunAt.get(process.id) ?? 0) < intervalMs - TICK_INTERVAL_MS / 2) {
        alive.push(process.id); // not run this tick by design - still alive
        return;
      }
      lastRunAt.set(process.id, now);
      try {
        const runStarted = performance.now();
        await processLockedRun(process.id, () => runner(process));
        tickStats.kind(process.kind, performance.now() - runStarted);
        alive.push(process.id);
      } catch (err) {
        logger.warn({ err, processId: process.id, kind: process.kind }, "process tick failed");
      }
    }),
  );

  if (alive.length > 0) {
    try {
      await apiClient.touchHeartbeats(alive);
    } catch (err) {
      logger.warn({ err }, "failed to touch process heartbeats");
    }
  }
}

/**
 * Registers the built-in process kinds, starts the tick loop and the
 * (health-check only) HTTP server - the "nexus-edge as a dependency"
 * entrypoint (extension points design, AGENTS_TO_DO.md 2026-07-28). A target
 * project's own process calls processRegistry.register() for its own
 * kinds, then calls this, instead of running this app's own index.ts.
 */
export async function startOrchestrator(): Promise<FastifyInstance> {
  registerBuiltinProcessKinds();
  await loadProcessPlugins();

  setInterval(() => {
    void tick();
  }, TICK_INTERVAL_MS);

  // Event-driven hooks (AGENTS.md section 80) and change events
  // (changeEvents.ts), alongside the tick.
  startBusSubscription(dispatchDeviceEvent);

  const app = Fastify({ logger: { level: config.logLevel } });
  app.get("/health", async () => ({ status: "ok", service: "orchestrator" }));
  // AGENTS_TO_DO.md, 2026-08-14 process management - lets apps/api (and,
  // through it, the UI) tell a `processes` row whose kind was just added
  // to Postgres apart from one whose plugin code this specific running
  // orchestrator actually has loaded (registerBuiltinProcessKinds()/
  // loadProcessPlugins() above run once at startup, not on a timer - a
  // kind copied in after that needs a restart before it shows up here).
  app.get("/process-kinds", async () => ({ kinds: processRegistry.list() }));
  // the tick load of the last full window (tickStats.ts)
  app.get("/tick-stats", async () => tickStats.last() ?? { pending: true });
  await app.listen({ port: config.port, host: config.host });
  return app;
}
