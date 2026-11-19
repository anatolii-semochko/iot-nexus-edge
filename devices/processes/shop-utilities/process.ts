/**
 * "shop-utilities" process kind - a metal shop's utilities (CORE Library package devices/processes/
 * shop-utilities/; the demo's factory, iot AGENTS_TO_DO.md 2026-11-19, step 6): the compressed air (node type
 * `air-compressor`), the process chiller (`process-chiller`), the wastewater neutralization
 * (`wastewater-treatment`), the DI water (`di-water`).
 *
 * Every `simulation.intervalSeconds` (default 10):
 *  1. the shop's demand: its shift (`shift` - the weekdays' hours) - the compressed air, the rinses' inflow,
 *     the DI water drawn; the line (`lineProcessId`): its cooling coils' heat (`coolingKw`) for the
 *     chiller, its finished bars (each - a drag-out into the wastewater, a DI make-up);
 *  2. the models (model.ts): the receiver and the compressor, the chiller, the tank's pH and its dosing
 *     pumps, the DI columns;
 *  3. a simulated unit gets its readings; the switches written (AUTO): the compressor, the chiller, the
 *     dosing pumps, the regeneration;
 *  4. today's account (kWh of the compressor and the chiller, the caustic dosed, the DI water drawn), WEM
 *     (the air under its band, the wastewater out of its discharge limits, the DI water over its limit),
 *     metrics (the panel), series `util.*`.
 */
import { localParts } from "../../lib/localTime.ts";
import { wem } from "../../lib/wem.ts";
import {
  chiller,
  compressorStep,
  diStep,
  wastewaterStep,
  type ChillerSpec,
  type Compressor,
  type CompressorSpec,
  type Di,
  type DiSpec,
  type Wastewater,
  type WastewaterSpec,
} from "./model.ts";

const DEFAULT_INTERVAL_S = 10;
const COMPRESSOR: CompressorSpec = { loadBar: 6.5, unloadBar: 7.5, fadM3Min: 1.8, loadedKw: 11, unloadedKw: 3.5, idleMin: 5, receiverM3: 1 };
const CHILLER: ChillerSpec = { supplyC: 9, flowLs: 3, cop: 3.2, auxKw: 1.2 };
const WASTEWATER: WastewaterSpec = { tankM3: 3, inflowPh: 3.5, lowPh: 6.8, highPh: 8.6, dosePhMin: 0.2, dragOutPh: 0.25 };
const DI: DiSpec = { limitUScm: 10, freshUScm: 0.8, perM3: 0.9, regenMin: 60 };
// the discharge permit's pH band, the DI water's warning
const DISCHARGE = { minPh: 6.5, maxPh: 9 };
// a caustic pump's dose (NaOH 25 %, l per minute it runs)
const NAOH_L_MIN = 0.15;

interface Device {
  nodeId?: number;
  devices?: Record<string, number>;
}

interface UtilConfig {
  timeZone?: string;
  lineProcessId?: number;
  shift?: { fromH: number; toH: number; days: number[] };
  demand?: { airShiftM3Min: number; airNightM3Min: number; rinseShiftLMin: number; rinseNightLMin: number; diShiftM3H: number; diPerBarM3: number };
  compressor?: Device & Partial<CompressorSpec>;
  chiller?: Device & Partial<ChillerSpec>;
  wastewater?: Device & Partial<WastewaterSpec>;
  di?: Device & Partial<DiSpec>;
  simulation?: { intervalSeconds?: number };
}

const DEMAND = { airShiftM3Min: 1.1, airNightM3Min: 0.15, rinseShiftLMin: 20, rinseNightLMin: 2, diShiftM3H: 0.6, diPerBarM3: 0.4 };

interface Today {
  date: string;
  compressorKwh: number;
  chillerKwh: number;
  naohL: number;
  diM3: number;
}

const r = (x: number, d = 2) => Math.round(x * 10 ** d) / 10 ** d;
const spec = <T extends object>(base: T, given?: Device & Partial<T>): T => {
  const { nodeId: _n, devices: _d, ...rest } = (given ?? {}) as any;
  return { ...base, ...rest };
};

export default function registerShopUtilities(register: any, { apiClient, logger, stepDue }: any): void {
  const systemTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const states = new Map<
    number,
    { lastRun: number; comp: Compressor; ww: Wastewater; di: Di; lineBars: number | null; today: Today; declared: boolean }
  >();

  register("shop-utilities", async (process: any) => {
    const now = Date.now();
    const config: UtilConfig = process.config ?? {};
    const intervalMs = (config.simulation?.intervalSeconds ?? DEFAULT_INTERVAL_S) * 1000;
    let st = states.get(process.id);
    if (st && !stepDue(process.id, intervalMs, st.lastRun, now)) return;
    const local = localParts(now, config.timeZone || systemTimeZone);
    const comp = spec(COMPRESSOR, config.compressor);
    const chil = spec(CHILLER, config.chiller);
    const wws = spec(WASTEWATER, config.wastewater);
    const dis = spec(DI, config.di);
    const demand = { ...DEMAND, ...(config.demand ?? {}) };
    const fresh = (): Today => ({ date: local.date, compressorKwh: 0, chillerKwh: 0, naohL: 0, diM3: 0 });
    if (!st) {
      // the plant's state survives a restart (the last metrics)
      const m = process.metrics ?? {};
      st = {
        lastRun: 0,
        comp: { bar: Number.isFinite(m.compressor?.bar) ? m.compressor.bar : 7, state: m.compressor?.state ?? "off", idleS: 0 },
        ww: { ph: Number.isFinite(m.wastewater?.ph) ? m.wastewater.ph : 7.2, naoh: false, acid: false },
        di: { uScm: Number.isFinite(m.di?.uScm) ? m.di.uScm : 1.5, column: m.di?.column === "B" ? "B" : "A", regenLeftS: Number(m.di?.regenLeftMin) * 60 || 0 },
        lineBars: m.today?.date === local.date && Number.isFinite(m.lineBars) ? m.lineBars : null,
        today: m.today?.date === local.date ? { ...fresh(), ...m.today } : fresh(),
        declared: false,
      };
      states.set(process.id, st);
    }
    const seconds = st.lastRun ? Math.min(intervalMs * 3, now - st.lastRun) / 1000 : intervalMs / 1000;
    st.lastRun = now;
    if (st.today.date !== local.date) {
      st.today = fresh();
      st.lineBars = 0;
    }

    // 1. the demand: the shift, the line
    const shift = config.shift ?? { fromH: 6, toH: 22, days: [1, 2, 3, 4, 5] };
    const onShift = shift.days.includes(local.weekday) && local.hour >= shift.fromH && local.hour < shift.toH;
    const line = config.lineProcessId ? (await apiClient.listProcesses()).find((p: any) => p.id === config.lineProcessId)?.metrics : null;
    const loadKw = Number(line?.coolingKw) || 0;
    const lineBars = Number(line?.today?.bars);
    let bars = 0;
    if (Number.isFinite(lineBars)) {
      if (st.lineBars !== null && lineBars > st.lineBars) bars = lineBars - st.lineBars;
      st.lineBars = lineBars;
    }
    // the air's demand wanders over the shift (the machines' tool changes, the blow guns)
    const wave = 1 + 0.25 * Math.sin(now / 410_000) + 0.15 * Math.sin(now / 97_000);
    const airM3Min = onShift ? demand.airShiftM3Min * wave : demand.airNightM3Min;
    const inflowLMin = onShift ? demand.rinseShiftLMin : demand.rinseNightLMin;
    const diM3 = (onShift ? (demand.diShiftM3H * seconds) / 3600 : 0) + bars * demand.diPerBarM3;

    // 2. the models
    const compKw = compressorStep(comp, st.comp, airM3Min, seconds);
    const chillerRunning = onShift || loadKw > 0;
    const ch = chiller(chil, loadKw, chillerRunning);
    wastewaterStep(wws, st.ww, inflowLMin, bars, seconds);
    diStep(dis, st.di, diM3, seconds);
    const hours = seconds / 3600;
    st.today.compressorKwh += compKw * hours;
    st.today.chillerKwh += ch.powerKw * hours;
    if (st.ww.naoh) st.today.naohL += NAOH_L_MIN * (seconds / 60);
    st.today.diM3 += diM3;
    const powerKw = compKw + ch.powerKw;

    // 3. readings and switches
    const nodes = new Map<number, any>((await apiClient.listNodes()).map((n: any) => [n.id, n]));
    const sim = (u?: Device) => u?.nodeId !== undefined && nodes.get(u.nodeId)?.simulated === true;
    const writes: { id: number; value: unknown }[] = [];
    const put = (u: Device | undefined, key: string, value: number) => {
      const id = u?.devices?.[key];
      if (sim(u) && typeof id === "number") writes.push({ id, value });
    };
    put(config.compressor, "pressure", r(st.comp.bar, 2));
    put(config.compressor, "power", r(compKw, 2));
    put(config.chiller, "supply", r(ch.supplyC, 1));
    put(config.chiller, "return", r(ch.returnC, 1));
    put(config.chiller, "power", r(ch.powerKw, 2));
    put(config.wastewater, "ph", r(st.ww.ph, 2));
    put(config.wastewater, "flow", r(inflowLMin, 1));
    put(config.di, "conductivity", r(st.di.uScm, 2));
    const auto = (u: Device | undefined, key: string, on: boolean) => {
      const id = u?.devices?.[key];
      return typeof id === "number" ? apiClient.setDeviceAuto(id, on) : Promise.resolve();
    };
    await Promise.allSettled([
      writes.length ? apiClient.simulateDevices(writes) : Promise.resolve(),
      auto(config.compressor, "relay", st.comp.state !== "off"),
      auto(config.chiller, "relay", chillerRunning),
      auto(config.wastewater, "naoh", st.ww.naoh),
      auto(config.wastewater, "acid", st.ww.acid),
      auto(config.di, "regeneration", st.di.regenLeftS > 0),
    ]);

    // 4. WEM, metrics, series
    const warnings: any[] = [];
    if (st.comp.bar < comp.loadBar - 0.5)
      warnings.push({ code: "air_low", level: 1, ...wem("Compressed air at {{bar}} bar - under its band", { bar: r(st.comp.bar, 1) }) });
    if (st.ww.ph < DISCHARGE.minPh || st.ww.ph > DISCHARGE.maxPh)
      warnings.push({ code: "wastewater_ph", level: 1, ...wem("Wastewater at pH {{ph}} - out of the discharge limits", { ph: r(st.ww.ph, 1) }) });
    if (st.di.uScm > dis.limitUScm)
      warnings.push({ code: "di_conductivity", level: 1, ...wem("DI water at {{uScm}} µS/cm - over its limit", { uScm: r(st.di.uScm, 1) }) });
    await apiClient.syncMessages(process.id, "warning", warnings);
    await apiClient.setWarning(process.id, warnings.length > 0);
    if (!st.declared) {
      try {
        await apiClient.declareSeries(process.id, [
          { valueKey: "util.airBar", name: "Compressed air", unit: "bar", kind: "gauge", mode: "period", periodS: 60 },
          { valueKey: "util.wastewaterPh", name: "Wastewater pH", unit: "pH", kind: "gauge", mode: "period", periodS: 300 },
          { valueKey: "util.chillerKw", name: "Chiller - electricity", unit: "kW", kind: "gauge", mode: "period", periodS: 300 },
          { valueKey: "util.powerKw", name: "Utilities - electricity", unit: "kW", kind: "gauge", mode: "period", periodS: 300 },
        ]);
        st.declared = true;
      } catch (err) {
        logger.warn({ processId: process.id, err }, "shop-utilities: failed to declare the series");
      }
    }
    await apiClient.setMetrics(process.id, {
      onShift,
      powerKw: r(powerKw, 2),
      compressor: { bar: r(st.comp.bar, 2), state: st.comp.state, powerKw: r(compKw, 2), demandM3Min: r(airM3Min, 2) },
      chiller: { running: chillerRunning, loadKw: r(loadKw, 1), supplyC: r(ch.supplyC, 1), returnC: r(ch.returnC, 1), powerKw: r(ch.powerKw, 2) },
      wastewater: { ph: r(st.ww.ph, 2), naoh: st.ww.naoh, acid: st.ww.acid, inflowLMin: r(inflowLMin, 1), discharge: DISCHARGE },
      di: { uScm: r(st.di.uScm, 2), limit: dis.limitUScm, column: st.di.column, regenLeftMin: r(st.di.regenLeftS / 60, 1) },
      lineBars: st.lineBars,
      today: {
        date: st.today.date,
        compressorKwh: r(st.today.compressorKwh, 2),
        chillerKwh: r(st.today.chillerKwh, 2),
        naohL: r(st.today.naohL, 2),
        diM3: r(st.today.diM3, 2),
      },
      values: { "util.airBar": r(st.comp.bar, 2), "util.wastewaterPh": r(st.ww.ph, 2), "util.chillerKw": r(ch.powerKw, 2), "util.powerKw": r(powerKw, 2) },
    });
  });
}
