// The time series' writer (api migrations/1690000000060 - nexus-edge-
// aquarium AGENTS_TO_DO.md 2026-10-16), run by the Data Logger process:
// every LOG_INTERVAL_MS it reads the current value of every series - a
// device's reading (one batch read), or a value a process publishes in its
// metrics under `metrics.values[<valueKey>]` (the convention for a
// loggable process value) - and writes points by each series' policy:
// - `period` - one point per `periodS` window, at the window's start: a
//   gauge - the average of the readings in it, a counter - the last;
// - `change` - a point when the value moved by more than `deadband` (any
//   change without one), and at least every `maxIntervalS` (default
//   DEFAULT_MAX_INTERVAL_S) - so a step value has a recent point;
// - a reading older than `staleS` (a device's) is expired - not logged.
// All the tick's points in one request. In memory: the open windows and
// the last points (a restart starts them again - a partial window is
// lost, a change series logs its current value at once).
import { apiClient, type SeriesRecord } from "../apiClient.js";
import { onEntityChange } from "../changeEvents.js";
import { tickProcesses } from "../tickProcesses.js";

const LOG_INTERVAL_MS = 5_000;
// the series list is dropped when a series changes (a declared one, a
// policy edited - changeEvents.ts); the TTL is the last safety net only
const SERIES_TTL_MS = 10 * 60_000;
const DEFAULT_MAX_INTERVAL_S = 3600;

let lastRun = 0;
let cached: { at: number; series: SeriesRecord[] } | null = null;
const windows = new Map<number, { start: number; sum: number; n: number; last: number }>();
const lastPoint = new Map<number, { t: number; v: number }>();
onEntityChange(["series"], () => {
  cached = null;
});

const numberOf = (v: unknown): number | null => {
  if (typeof v === "boolean") return v ? 1 : 0;
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

const pathValue = (metrics: unknown, key: string): unknown => {
  const values = (metrics as { values?: Record<string, unknown> } | null | undefined)?.values;
  return values ? values[key] : undefined;
};

export async function logSeries(): Promise<void> {
  const now = Date.now();
  if (now - lastRun < LOG_INTERVAL_MS) return;
  lastRun = now;
  if (!cached || now - cached.at > SERIES_TTL_MS) cached = { at: now, series: await apiClient.listSeries() };
  const active = cached.series.filter((s) => s.mode !== "off");
  if (active.length === 0) return;

  // the current values: devices in one batch, processes from their metrics
  const current = new Map<number, { v: number; at: number | null }>();
  const deviceIds = [...new Set(active.filter((s) => s.deviceId !== null).map((s) => s.deviceId as number))];
  if (deviceIds.length > 0) {
    const { values } = await apiClient.getDeviceValues(deviceIds);
    for (const s of active) {
      if (s.deviceId === null) continue;
      const r = values?.[s.deviceId];
      const v = r && r.source !== "error" ? numberOf(r.value) : null;
      if (v !== null) current.set(s.id, { v, at: r?.at ?? null });
    }
  }
  if (active.some((s) => s.processId !== null && s.valueKey)) {
    const processes = tickProcesses(); // this tick's, with the live metrics
    const metricsOf = new Map(processes.map((p) => [p.id, (p as { metrics?: unknown }).metrics]));
    for (const s of active) {
      if (s.processId === null || !s.valueKey) continue;
      const v = numberOf(pathValue(metricsOf.get(s.processId), s.valueKey));
      if (v !== null) current.set(s.id, { v, at: now });
    }
  }

  const rows: { seriesId: number; t: number; v: number }[] = [];
  for (const s of active) {
    const c = current.get(s.id);
    if (!c || (s.staleS && c.at !== null && now - c.at > s.staleS * 1000)) continue;
    if (s.mode === "period" && s.periodS) {
      const periodMs = s.periodS * 1000;
      const start = Math.floor(now / periodMs) * periodMs;
      const w = windows.get(s.id);
      if (w && w.start !== start) {
        rows.push({ seriesId: s.id, t: w.start, v: s.kind === "counter" ? w.last : w.sum / w.n });
        windows.delete(s.id);
      }
      const open = windows.get(s.id) ?? { start, sum: 0, n: 0, last: c.v };
      open.sum += c.v;
      open.n += 1;
      open.last = c.v;
      windows.set(s.id, open);
    } else if (s.mode === "change") {
      const last = lastPoint.get(s.id);
      const moved = !last || Math.abs(c.v - last.v) > (s.deadband ?? 0);
      const due = last && now - last.t >= (s.maxIntervalS ?? DEFAULT_MAX_INTERVAL_S) * 1000;
      if (moved || due) {
        rows.push({ seriesId: s.id, t: now, v: c.v });
        lastPoint.set(s.id, { t: now, v: c.v });
      }
    }
  }
  if (rows.length > 0) await apiClient.writeSamples(rows);
}
