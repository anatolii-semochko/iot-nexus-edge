// Tick load measurement (nexus-edge-aquarium AGENTS_TO_DO.md 2026-10-16 -
// the Raspberry budget): how long a tick takes, how many API requests it
// makes and to which routes, and the time per process kind - over a
// rolling window of WINDOW ticks. GET /tick-stats on the orchestrator and
// a summary in the log once per window. Every optimisation step is
// measured with it before / after.

const WINDOW = 60;

interface Window {
  ticks: number;
  skipped: number;
  durationMs: number[];
  requests: Map<string, number>; // "METHOD /route/:id" -> count
  kindMs: Map<string, number>; // process kind -> summed run time
  kindRuns: Map<string, number>;
  kindMax: Map<string, number>; // process kind -> its longest run
  // the window's longest tick and its longest runner (iot PERF_PROD_2026-11-05.md - which one
  // makes the rare 1.5-6 s ticks)
  slowest: { ms: number; kind: string | null; kindMs: number };
}

const fresh = (): Window => ({
  ticks: 0,
  skipped: 0,
  durationMs: [],
  requests: new Map(),
  kindMs: new Map(),
  kindRuns: new Map(),
  kindMax: new Map(),
  slowest: { ms: 0, kind: null, kindMs: 0 },
});
// the longest runner of the tick in progress
let tickLongest: { kind: string | null; ms: number } = { kind: null, ms: 0 };
let current = fresh();
let last: ReturnType<typeof summary> | null = null;

// numbers in a path are ids - one route for all of them
const routeOf = (method: string, path: string) => `${method} ${path.split("?")[0].replace(/\/\d+(?=\/|$)/g, "/:id")}`;

export const tickStats = {
  request(method: string, path: string): void {
    const key = routeOf(method, path);
    current.requests.set(key, (current.requests.get(key) ?? 0) + 1);
  },
  kind(kind: string, ms: number): void {
    current.kindMs.set(kind, (current.kindMs.get(kind) ?? 0) + ms);
    current.kindRuns.set(kind, (current.kindRuns.get(kind) ?? 0) + 1);
    if (ms > (current.kindMax.get(kind) ?? 0)) current.kindMax.set(kind, ms);
    if (ms > tickLongest.ms) tickLongest = { kind, ms };
  },
  skipped(): void {
    current.skipped += 1;
  },
  /** A tick ended; returns the window's summary when the window is full (else null). */
  tick(durationMs: number): ReturnType<typeof summary> | null {
    current.ticks += 1;
    current.durationMs.push(durationMs);
    if (durationMs > current.slowest.ms) current.slowest = { ms: durationMs, kind: tickLongest.kind, kindMs: tickLongest.ms };
    tickLongest = { kind: null, ms: 0 };
    if (current.ticks < WINDOW) return null;
    last = summary(current);
    current = fresh();
    return last;
  },
  /** The last full window (null before the first). */
  last: () => last,
};

function summary(w: Window) {
  const sorted = [...w.durationMs].sort((a, b) => a - b);
  const totalRequests = [...w.requests.values()].reduce((a, b) => a + b, 0);
  return {
    ticks: w.ticks,
    skippedTicks: w.skipped,
    tickMs: {
      avg: Math.round(sorted.reduce((a, b) => a + b, 0) / sorted.length),
      p95: Math.round(sorted[Math.floor(sorted.length * 0.95)] ?? 0),
      max: Math.round(sorted[sorted.length - 1] ?? 0),
    },
    slowestTick: { ms: Math.round(w.slowest.ms), longestKind: w.slowest.kind, longestKindMs: Math.round(w.slowest.kindMs) },
    requestsPerTick: Math.round((totalRequests / w.ticks) * 10) / 10,
    topRoutes: [...w.requests.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([route, n]) => ({ route, perTick: Math.round((n / w.ticks) * 10) / 10 })),
    kinds: [...w.kindMs.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([kind, ms]) => ({
        kind,
        msPerRun: Math.round(ms / (w.kindRuns.get(kind) ?? 1)),
        maxMs: Math.round(w.kindMax.get(kind) ?? 0),
        runsPerTick: Math.round(((w.kindRuns.get(kind) ?? 0) / w.ticks) * 10) / 10,
      })),
  };
}
