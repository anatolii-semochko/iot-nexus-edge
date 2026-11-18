/**
 * "quality-control" process kind - QC and packing after a drying oven (CORE Library package
 * devices/processes/quality-control/; the metal shop of the demo, iot AGENTS_TO_DO.md 2026-11-18, step 5):
 * the coating gauge (node type `coating-gauge`), the batches from the oven, the pallets.
 *
 * Every `simulation.intervalSeconds` (default 10):
 *  1. the oven's dried batches (its process `ovenProcessId` - its `dried` list, newer than the last taken)
 *     queue at QC; each batch's coating - from the line's finished bars (`lineProcessId` - its `recent`);
 *  2. one batch at a time is inspected over `inspectMin`: the gauge's points one after another (a
 *     simulated gauge - its reading written; model.ts inspect), then the verdict, the rejected parts;
 *  3. the passed parts packed onto pallets of `perPallet`;
 *  4. today's account (the batches, the parts passed / rejected, the pallets), WEM (a batch to check, the
 *     day's rejects over `rejectsWarnPct`), metrics (the panel), series `qc.*`.
 */
import { localParts } from "../../lib/localTime.ts";
import { wem } from "../../lib/wem.ts";
import { inspect, pallets, type QcSpec, type Result } from "./model.ts";

const DEFAULT_INTERVAL_S = 10;
const RESULTS = 12;
const DEFAULTS: QcSpec = { minUm: 17, targetUm: 20, points: 5, inspectMin: 6, partsPerBar: 40, perPallet: 160 };

interface QcConfig {
  timeZone?: string;
  ovenProcessId?: number;
  lineProcessId?: number;
  qc?: Partial<QcSpec> & { rejectsWarnPct?: number };
  gauge?: { nodeId?: number; devices?: { thickness?: number } };
  simulation?: { intervalSeconds?: number };
}

interface Today {
  date: string;
  batches: number;
  passed: number;
  rejected: number;
  packed: number;
}

const r = (x: number, d = 2) => Math.round(x * 10 ** d) / 10 ** d;

export default function registerQualityControl(register: any, { apiClient, logger, stepDue }: any): void {
  const systemTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const states = new Map<
    number,
    {
      lastRun: number;
      takenAt: number; // the newest dried batch taken (its time)
      queue: { id: string; coatingUm: number }[];
      current: { id: string; coatingUm: number; since: number } | null;
      results: Result[];
      today: Today;
      declared: boolean;
    }
  >();

  register("quality-control", async (process: any) => {
    const now = Date.now();
    const config: QcConfig = process.config ?? {};
    const intervalMs = (config.simulation?.intervalSeconds ?? DEFAULT_INTERVAL_S) * 1000;
    let st = states.get(process.id);
    if (st && !stepDue(process.id, intervalMs, st.lastRun, now)) return;
    const local = localParts(now, config.timeZone || systemTimeZone);
    const { rejectsWarnPct = 3, ...given } = config.qc ?? {};
    const spec: QcSpec = { ...DEFAULTS, ...given };
    const fresh = (): Today => ({ date: local.date, batches: 0, passed: 0, rejected: 0, packed: 0 });
    if (!st) {
      // the queue, the batch in work and the results survive a restart (the last metrics)
      const m = process.metrics ?? {};
      st = {
        lastRun: 0,
        takenAt: Number.isFinite(m.takenAt) ? m.takenAt : 0,
        queue: Array.isArray(m.queue) ? m.queue.filter((q: any) => typeof q?.id === "string") : [],
        current: m.current?.id ? { ...m.current, since: now - (Number(m.current.elapsedMin) || 0) * 60_000 } : null,
        results: Array.isArray(m.results) ? m.results.slice(-RESULTS) : [],
        today: m.today?.date === local.date ? { ...fresh(), ...m.today } : fresh(),
        declared: false,
      };
      states.set(process.id, st);
    }
    st.lastRun = now;
    if (st.today.date !== local.date) st.today = fresh();

    // 1. the oven's dried batches, their coating from the line
    const ids = [config.ovenProcessId, config.lineProcessId].filter((x) => typeof x === "number");
    const processes = ids.length ? await apiClient.listProcesses() : [];
    const oven = processes.find((p: any) => p.id === config.ovenProcessId)?.metrics;
    const line = processes.find((p: any) => p.id === config.lineProcessId)?.metrics;
    const coatingOf = new Map<string, number>((line?.recent ?? []).map((b: any) => [b.id, Number(b.coatingUm)]));
    for (const d of oven?.dried ?? []) {
      if (typeof d?.id !== "string" || !(d.at > st.takenAt)) continue;
      st.queue.push({ id: d.id, coatingUm: coatingOf.get(d.id) ?? spec.targetUm });
      st.takenAt = d.at;
    }

    // 2. the inspection
    let reading: number | null = null;
    if (!st.current && st.queue.length) st.current = { ...st.queue.shift()!, since: now };
    if (st.current) {
      const c = st.current;
      const elapsed = (now - c.since) / 60_000;
      const result = inspect(spec, c.id, c.coatingUm, now);
      // the points measured so far - one each inspectMin / points
      const k = Math.min(spec.points, Math.floor((elapsed / spec.inspectMin) * spec.points));
      if (k > 0) reading = result.points[k - 1];
      if (elapsed >= spec.inspectMin) {
        st.results.push(result);
        st.results = st.results.slice(-RESULTS);
        st.today.batches += 1;
        st.today.passed += result.parts - result.rejected;
        st.today.rejected += result.rejected;
        // 3. the packing
        st.today.packed += result.parts - result.rejected;
        st.current = null;
      }
    }
    const gauge = config.gauge ?? {};
    const simulated = gauge.nodeId !== undefined && (await apiClient.listNodes()).some((n: any) => n.id === gauge.nodeId && n.simulated === true);
    if (simulated && reading !== null && typeof gauge.devices?.thickness === "number")
      await apiClient.simulateDevices([{ id: gauge.devices.thickness, value: reading }]).catch(() => {});

    // 4. WEM, metrics, series
    const total = st.today.passed + st.today.rejected;
    const rejectsPct = total ? (st.today.rejected / total) * 100 : 0;
    const warnings: any[] = [];
    const last = st.results[st.results.length - 1];
    if (last?.verdict === "check")
      warnings.push({ code: `check_${last.id}`, level: 1, ...wem("{{id}} - its thinnest point {{minUm}} µm, under {{specUm}} µm: to check", { id: last.id, minUm: last.minUm, specUm: spec.minUm }) });
    if (total >= 80 && rejectsPct > rejectsWarnPct)
      warnings.push({ code: "rejects", level: 1, ...wem("Rejects today {{pct}} %", { pct: r(rejectsPct, 1) }) });
    await apiClient.syncMessages(process.id, "warning", warnings);
    await apiClient.setWarning(process.id, warnings.length > 0);
    if (!st.declared) {
      try {
        await apiClient.declareSeries(process.id, [
          { valueKey: "qc.passed", name: "QC - parts passed today", unit: "", kind: "gauge", mode: "period", periodS: 300 },
          { valueKey: "qc.rejectsPct", name: "QC - rejects today", unit: "%", kind: "gauge", mode: "period", periodS: 300 },
        ]);
        st.declared = true;
      } catch (err) {
        logger.warn({ processId: process.id, err }, "quality-control: failed to declare the series");
      }
    }
    const p = pallets(spec, st.today.packed);
    await apiClient.setMetrics(process.id, {
      current: st.current ? { id: st.current.id, elapsedMin: r((now - st.current.since) / 60_000, 1), inspectMin: spec.inspectMin, reading } : null,
      queue: st.queue,
      takenAt: st.takenAt,
      results: st.results,
      spec: { minUm: spec.minUm, targetUm: spec.targetUm, perPallet: spec.perPallet },
      pallets: p,
      today: { ...st.today, rejectsPct: r(rejectsPct, 1), pallets: p.full },
      values: { "qc.passed": st.today.passed, "qc.rejectsPct": r(rejectsPct, 2) },
    });
  });
}
