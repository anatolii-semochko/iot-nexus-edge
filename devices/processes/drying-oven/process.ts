/**
 * "drying-oven" process kind - a batch drying / curing oven (CORE Library package devices/processes/
 * drying-oven/; the metal shop of the demo, iot AGENTS_TO_DO.md 2026-11-18, step 4): the oven (node type
 * `drying-oven` - its chamber temperature, its heaters, their power) after the anodizing line.
 *
 * Every `simulation.intervalSeconds` (default 10):
 *  1. the line's finished bars (its process `lineProcessId` - the growth of its `today.bars`) queue at the
 *     oven, named as the line names them;
 *  2. the oven (model.ts ovenTick): the queue loaded while there is room, the heaters by the set point's
 *     band, the drying counted while the chamber is hot, the dried batches out (to QC - counted);
 *  3. a simulated oven gets its readings from the model (the temperature, the heaters' power); a physical
 *     one is read and only its heaters are written (AUTO);
 *  4. today's account (the batches, the kWh), WEM (the chamber off its band while drying, a queue waiting
 *     too long), metrics (the panel), series `oven.*`.
 */
import { localParts } from "../../lib/localTime.ts";
import { wem } from "../../lib/wem.ts";
import { ovenTick, type Oven, type OvenSpec } from "./model.ts";

const DEFAULT_INTERVAL_S = 10;
const OFF_BAND_K = 8;
const QUEUE_WARN = 3;

const DEFAULTS: OvenSpec = {
  setpointC: 82,
  tolC: 4,
  heaterKw: 18,
  capacityKwhK: 0.12,
  lossKwK: 0.09,
  doorLossKwh: 0.6,
  partsKwh: 1.2,
  dryMin: 20,
  capacity: 2,
  readyBelowK: 6,
  ambientC: 18,
};

interface OvenConfig {
  timeZone?: string;
  lineProcessId?: number;
  oven?: Partial<OvenSpec> & { nodeId?: number; devices?: { temperature?: number; heater?: number; power?: number } };
  simulation?: { intervalSeconds?: number };
}

const r = (x: number, d = 2) => Math.round(x * 10 ** d) / 10 ** d;

export default function registerDryingOven(register: any, { apiClient, logger, stepDue }: any): void {
  const systemTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const states = new Map<
    number,
    { lastRun: number; oven: Oven; lineBars: number | null; today: { date: string; batches: number; kwh: number }; declared: boolean; dried: { id: string; at: number }[] }
  >();

  register("drying-oven", async (process: any) => {
    const now = Date.now();
    const config: OvenConfig = process.config ?? {};
    const intervalMs = (config.simulation?.intervalSeconds ?? DEFAULT_INTERVAL_S) * 1000;
    let st = states.get(process.id);
    if (st && !stepDue(process.id, intervalMs, st.lastRun, now)) return;
    const local = localParts(now, config.timeZone || systemTimeZone);
    const { nodeId, devices = {}, ...given } = config.oven ?? {};
    const spec: OvenSpec = { ...DEFAULTS, ...given };
    if (!st) {
      const m = process.metrics ?? {};
      st = {
        lastRun: 0,
        // the batches and the line's count survive a restart (the last metrics)
        oven: {
          tempC: Number.isFinite(m.tempC) ? m.tempC : spec.setpointC,
          heating: false,
          drying: (m.drying ?? [])
            .filter((b: any) => typeof b.id === "string")
            .map((b: any) => ({ id: b.id, dryS: Math.max(0, spec.dryMin - (Number(b.leftMin) || 0)) * 60, inSince: now })),
          queue: (m.queue ?? []).filter((id: unknown) => typeof id === "string"),
        },
        // a fresh oven takes the line's bars of today it has not seen yet (it starts with nothing dried)
        lineBars: m.today?.date === local.date && Number.isFinite(m.lineBars) ? m.lineBars : 0,
        today: m.today?.date === local.date ? m.today : { date: local.date, batches: 0, kwh: 0 },
        declared: false,
        // the last dried batches (QC takes them from here)
        dried: Array.isArray(m.dried) ? m.dried.slice(-12) : [],
      };
      states.set(process.id, st);
    }
    const seconds = st.lastRun ? Math.min(intervalMs * 3, now - st.lastRun) / 1000 : intervalMs / 1000;
    st.lastRun = now;
    if (st.today.date !== local.date) {
      st.today = { date: local.date, batches: 0, kwh: 0 };
      st.lineBars = 0;
    }

    // 1. the line's finished bars
    const processes = config.lineProcessId ? await apiClient.listProcesses() : [];
    const line = processes.find((p: any) => p.id === config.lineProcessId);
    const lineBars = Number(line?.metrics?.today?.bars);
    if (Number.isFinite(lineBars)) {
      if (st.lineBars !== null && lineBars > st.lineBars)
        for (let n = st.lineBars + 1; n <= lineBars; n++) st.oven.queue.push(`L-${String(n).padStart(4, "0")}`);
      // a new day or the line restarted - its count starts again (lower than ours)
      st.lineBars = lineBars;
    }

    // the physical oven's reading
    const simulated = nodeId !== undefined && (await apiClient.listNodes()).some((n: any) => n.id === nodeId && n.simulated === true);
    if (!simulated && typeof devices.temperature === "number") {
      const { values } = await apiClient.getDeviceValues([devices.temperature]);
      const v = values?.[devices.temperature];
      const t = v && v.source !== "error" ? Number(v.value) : NaN;
      if (Number.isFinite(t)) st.oven.tempC = t;
    }

    // 2. the oven
    const done = ovenTick(spec, st.oven, now, seconds);
    for (const b of done) st.dried.push({ id: b.id, at: now });
    st.dried = st.dried.slice(-12);
    st.today.batches += done.length;
    const powerKw = st.oven.heating ? spec.heaterKw : 0;
    st.today.kwh += (powerKw * seconds) / 3600;

    // 3. readings and the heaters
    const writes: { id: number; value: unknown }[] = [];
    if (simulated) {
      if (typeof devices.temperature === "number") writes.push({ id: devices.temperature, value: r(st.oven.tempC, 1) });
      if (typeof devices.power === "number") writes.push({ id: devices.power, value: r(powerKw, 2) });
    }
    await Promise.allSettled([
      writes.length ? apiClient.simulateDevices(writes) : Promise.resolve(),
      typeof devices.heater === "number" ? apiClient.setDeviceAuto(devices.heater, st.oven.heating) : Promise.resolve(),
    ]);

    // 4. WEM, metrics, series
    const warnings: any[] = [];
    if (st.oven.drying.length && Math.abs(st.oven.tempC - spec.setpointC) > OFF_BAND_K)
      warnings.push({ code: "off_band", level: 1, ...wem("The oven at {{tempC}} C while drying - its set point {{setC}} C", { tempC: r(st.oven.tempC, 1), setC: spec.setpointC }) });
    if (st.oven.queue.length >= QUEUE_WARN)
      warnings.push({ code: "queue", level: 1, ...wem("{{n}} batches wait at the oven", { n: st.oven.queue.length }) });
    await apiClient.syncMessages(process.id, "warning", warnings);
    await apiClient.setWarning(process.id, warnings.length > 0);
    if (!st.declared) {
      try {
        await apiClient.declareSeries(process.id, [
          { valueKey: "oven.tempC", name: "Oven - temperature", unit: "C", kind: "gauge", mode: "period", periodS: 300 },
          { valueKey: "oven.powerKw", name: "Oven - electricity", unit: "kW", kind: "gauge", mode: "period", periodS: 300 },
        ]);
        st.declared = true;
      } catch (err) {
        logger.warn({ processId: process.id, err }, "drying-oven: failed to declare the series");
      }
    }
    await apiClient.setMetrics(process.id, {
      tempC: r(st.oven.tempC, 1),
      setC: spec.setpointC,
      heating: st.oven.heating,
      powerKw: r(powerKw, 2),
      drying: st.oven.drying.map((b) => ({ id: b.id, leftMin: r(Math.max(0, spec.dryMin - b.dryS / 60), 1), dryMin: spec.dryMin })),
      queue: st.oven.queue,
      capacity: spec.capacity,
      lineBars: st.lineBars,
      dried: st.dried,
      today: { date: st.today.date, batches: st.today.batches, kwh: r(st.today.kwh, 2) },
      values: { "oven.tempC": r(st.oven.tempC, 1), "oven.powerKw": r(powerKw, 2) },
    });
  });
}
