/**
 * "metal-shop" process kind - the metal shop's summary (CORE Library package devices/processes/metal-shop/;
 * the demo's factory, iot AGENTS_TO_DO.md 2026-11-19, step 8): it reads the shop's processes - the machining,
 * the anodizing line, the drying oven, QC and the utilities - and the grid's price, and sums them up.
 *
 * Every `simulation.intervalSeconds` (default 10):
 *  1. the shop's electricity now: each process's power, the line's chiller share taken out when the utilities
 *     run their own chiller (`chillerKw` - counted once);
 *  2. today's kWh and € (the grid's buying price now - `gridProcessId`'s `buyCtKwh`, integrated);
 *  3. the bars in work - on the line, in the oven, at QC - with their part (the machining's job that made
 *     them, taken when a bar is first seen), their progress over the whole route and the time they are ready
 *     (the line's recipe left, the oven's drying, QC's inspection);
 *  4. metrics (the panel's sums and its batches table), series `shop.powerKw`, `shop.eurToday`.
 */
import { localParts } from "../../lib/localTime.ts";

const DEFAULT_INTERVAL_S = 10;
// the shares of the route a bar has done after the line, after the oven (the rest - QC)
const LINE_SHARE = 0.7;
const OVEN_SHARE = 0.15;
// the bars' parts remembered (a bar seen once keeps its part)
const PARTS_KEPT = 60;

interface ShopConfig {
  timeZone?: string;
  gridProcessId?: number;
  machiningProcessId?: number;
  lineProcessId?: number;
  ovenProcessId?: number;
  qcProcessId?: number;
  utilitiesProcessId?: number;
  simulation?: { intervalSeconds?: number };
}

const r = (x: number, d = 2) => Math.round(x * 10 ** d) / 10 ** d;

export default function registerMetalShop(register: any, { apiClient, stepDue }: any): void {
  const systemTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  // `window` - the last 15 minutes' power (the grid bills its peak as a 15-minute average)
  type Today = { date: string; kwh: number; eur: number; peakKw: number; peakAt: number | null };
  const states = new Map<number, { lastRun: number; today: Today; parts: [string, string][]; window: [number, number][]; declared: boolean }>();

  register("metal-shop", async (process: any) => {
    const now = Date.now();
    const config: ShopConfig = process.config ?? {};
    const intervalMs = (config.simulation?.intervalSeconds ?? DEFAULT_INTERVAL_S) * 1000;
    let st = states.get(process.id);
    if (st && !stepDue(process.id, intervalMs, st.lastRun, now)) return;
    const local = localParts(now, config.timeZone || systemTimeZone);
    if (!st) {
      const m = process.metrics ?? {};
      st = {
        lastRun: 0,
        today:
          m.today?.date === local.date
            ? { date: local.date, kwh: Number(m.today.kwh) || 0, eur: Number(m.today.eur) || 0, peakKw: Number(m.today.peakKw) || 0, peakAt: Number(m.today.peakAt) || null }
            : { date: local.date, kwh: 0, eur: 0, peakKw: 0, peakAt: null },
        parts: Array.isArray(m.parts) ? m.parts : [],
        window: [],
        declared: false,
      };
      states.set(process.id, st);
    }
    const seconds = st.lastRun ? Math.min(intervalMs * 3, now - st.lastRun) / 1000 : intervalMs / 1000;
    st.lastRun = now;
    if (st.today.date !== local.date) st.today = { date: local.date, kwh: 0, eur: 0, peakKw: 0, peakAt: null };

    const all = await apiClient.listProcesses();
    const get = (id?: number) => (id ? all.find((p: any) => p.id === id) : undefined);
    const mach = get(config.machiningProcessId)?.metrics;
    const lineP = get(config.lineProcessId);
    const line = lineP?.metrics;
    const oven = get(config.ovenProcessId)?.metrics;
    const qc = get(config.qcProcessId)?.metrics;
    const util = get(config.utilitiesProcessId)?.metrics;
    const grid = get(config.gridProcessId)?.metrics;

    // 1. + 2. the electricity, its cost
    const num = (x: unknown) => (Number.isFinite(Number(x)) ? Number(x) : 0);
    const zonesKw = {
      machining: num(mach?.powerKw),
      line: num(line?.powerKw) - (util ? num(line?.chillerKw) : 0),
      oven: num(oven?.powerKw),
      utilities: num(util?.powerKw),
    };
    const powerKw = Object.values(zonesKw).reduce((a, b) => a + b, 0);
    const priceCt = Number.isFinite(Number(grid?.buyCtKwh)) ? Number(grid.buyCtKwh) : null;
    const kwh = (powerKw * seconds) / 3600;
    st.today.kwh += kwh;
    if (priceCt !== null) st.today.eur += (kwh * priceCt) / 100;
    // the day's peak - the highest 15-minute average (counted once the window is full)
    st.window.push([now, powerKw]);
    st.window = st.window.filter(([t]) => t > now - 15 * 60_000);
    const avg15Kw = st.window.reduce((a, [, kw]) => a + kw, 0) / st.window.length;
    if (st.window[0][0] <= now - 14 * 60_000 && avg15Kw > st.today.peakKw) {
      st.today.peakKw = avg15Kw;
      st.today.peakAt = now;
    }

    // 3. the bars in work
    const parts = new Map(st.parts);
    const making = (mach?.machines ?? []).filter((x: any) => x.part).sort((a: any, z: any) => (z.parts ?? 0) - (a.parts ?? 0))[0]?.part ?? null;
    const partOf = (id: string) => {
      if (!parts.has(id) && making) parts.set(id, making);
      return parts.get(id) ?? null;
    };
    const recipe: { minutes: number }[] = lineP?.config?.recipe ?? [];
    const dryMin = num(oven?.drying?.[0]?.dryMin) || 20;
    const inspectMin = num(qc?.current?.inspectMin) || 6;
    const partsPerBar = num(lineP?.config?.line?.partsPerBar) || 40;
    const flow: any[] = [];
    for (const b of line?.bars ?? []) {
      if (b.step < 0) continue;
      const leftLine = Math.max(0, num(b.needMin) - num(b.elapsedMin)) + recipe.slice(b.step + 1).reduce((a, s) => a + num(s.minutes), 0);
      const total = recipe.reduce((a, s) => a + num(s.minutes), 0) || 1;
      const doneLine = Math.min(1, 1 - leftLine / total);
      flow.push({ id: b.id, part: partOf(b.id), qty: partsPerBar, stage: "Anodizing line", where: b.bath, pct: Math.round(doneLine * LINE_SHARE * 100), readyAt: now + (leftLine + dryMin + inspectMin) * 60_000 });
    }
    for (const b of oven?.drying ?? []) {
      const left = num(b.leftMin);
      flow.push({ id: b.id, part: partOf(b.id), qty: partsPerBar, stage: "Drying oven", where: null, pct: Math.round((LINE_SHARE + (1 - left / (num(b.dryMin) || 1)) * OVEN_SHARE) * 100), readyAt: now + (left + inspectMin) * 60_000 });
    }
    for (const id of oven?.queue ?? [])
      flow.push({ id, part: partOf(id), qty: partsPerBar, stage: "Drying oven", where: "waiting", pct: Math.round(LINE_SHARE * 100), readyAt: now + (dryMin + inspectMin) * 60_000 });
    if (qc?.current) {
      const c = qc.current;
      flow.push({ id: c.id, part: partOf(c.id), qty: partsPerBar, stage: "QC and packing", where: null, pct: Math.round((LINE_SHARE + OVEN_SHARE + (num(c.elapsedMin) / (num(c.inspectMin) || 1)) * (1 - LINE_SHARE - OVEN_SHARE)) * 100), readyAt: now + Math.max(0, num(c.inspectMin) - num(c.elapsedMin)) * 60_000 });
    }
    for (const q of qc?.queue ?? [])
      flow.push({ id: q.id, part: partOf(q.id), qty: partsPerBar, stage: "QC and packing", where: "waiting", pct: Math.round((LINE_SHARE + OVEN_SHARE) * 100), readyAt: now + inspectMin * 60_000 });
    const kept = [...parts.entries()].slice(-PARTS_KEPT);
    st.parts = kept;

    // 4. metrics, series
    if (!st.declared) {
      try {
        await apiClient.declareSeries(process.id, [
          { valueKey: "shop.powerKw", name: "The shop's electricity", unit: "kW", kind: "gauge", mode: "period", periodS: 300 },
          { valueKey: "shop.eurToday", name: "The shop's energy today", unit: "EUR", kind: "gauge", mode: "period", periodS: 300 },
        ]);
        st.declared = true;
      } catch {
        // the next tick declares them again
      }
    }
    await apiClient.setMetrics(process.id, {
      powerKw: r(powerKw, 2),
      // the shop's electricity for the site's balance (an Energy Field's loadProcessIds read `electricKw`)
      electricKw: r(powerKw, 2),
      avg15Kw: r(avg15Kw, 2),
      zonesKw: Object.fromEntries(Object.entries(zonesKw).map(([k, v]) => [k, r(v, 2)])),
      priceCtKwh: priceCt,
      inWork: flow.length,
      oeePct: mach?.today?.oeePct ?? null,
      flow: flow.sort((a, z) => z.pct - a.pct),
      parts: kept,
      today: {
        date: st.today.date,
        kwh: r(st.today.kwh, 2),
        eur: priceCt === null && !st.today.eur ? null : r(st.today.eur, 2),
        peakKw: r(st.today.peakKw, 1),
        peakAt: st.today.peakAt,
        madeParts: mach?.today?.parts ?? null,
        passedParts: qc?.today?.passed ?? null,
      },
      values: { "shop.powerKw": r(powerKw, 2), "shop.eurToday": r(st.today.eur, 2) },
    });
  });
}
