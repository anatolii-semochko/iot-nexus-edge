/**
 * "chem-wastewater" process kind - a metal shop's chemistry and wastewater (CORE Library package devices/processes/
 * chem-wastewater/; the demo's factory, iot AGENTS_TO_DO.md 2026-11-19, the "Chemistry and wastewater" zone): the
 * concentrates' tanks (node type `chemical-tank`), the baths' dosing pumps, the wastewater treatment
 * (`wastewater-treatment` - the collection tank, the neutralization, the settler, the filter press).
 *
 * Every `simulation.intervalSeconds` (default 10):
 *  1. the line (`lineProcessId`): its bars finished since the last run - each went through every bath of the
 *     recipe, its drag-out out of each dosed bath and into the wastewater; the shift (`shift`) - the rinses'
 *     overflow;
 *  2. the models (model.ts): each dosed bath's concentration and its pump, the tanks' levels, the wastewater's
 *     collection tank, transfer pump, pH and its pumps, sludge and filter press;
 *  3. a simulated unit gets its readings (the levels, the pH, the flow); the switches written (AUTO): the dosing
 *     pumps, the transfer pump, the caustic / acid pumps, the press;
 *  4. a new day - the tanks' recent rates; a tank under its reorder level - ordered that day, delivered (the
 *     simulation's truck) the next morning from `DELIVERY_H`;
 *  5. WEM (a tank under its reorder / critical level, the collection tank over its high level, the discharge's pH
 *     out of its limits, the press's cloth over its pressure drop), metrics (the panel), series `chem.*`.
 */
import { localParts } from "../../lib/localTime.ts";
import { wem } from "../../lib/wem.ts";
import {
  daysLeft,
  deliver,
  dosingStep,
  minutesToFull,
  tankNewDay,
  wastewaterStep,
  type Dosing,
  type DosingSpec,
  type Tank,
  type TankSpec,
  type Wastewater,
  type WastewaterSpec,
} from "./model.ts";

const DEFAULT_INTERVAL_S = 10;
const WASTEWATER: WastewaterSpec = {
  collectionL: 4000,
  startPct: 60,
  stopPct: 20,
  highPct: 90,
  pumpLMin: 45,
  inflowPh: 3.5,
  neutralL: 1500,
  lowPh: 6.8,
  highPh: 8.6,
  dosePhMin: 0.3,
  sludgePerM3L: 8,
  settlerSludgeL: 400,
  pressAtPct: 80,
  pressMin: 45,
  dpPerCycleBar: 0.12,
  dpLimitBar: 3,
  flocMlPerM3: 50,
  causticLMin: 0.15,
};
// the discharge permit's pH band
const DISCHARGE = { minPh: 6.5, maxPh: 9 };
const DEMAND = { rinseShiftLMin: 20, rinseNightLMin: 2 };
// the hour a delivery comes (a tank under its reorder level - the next morning)
const DELIVERY_H = 8;

interface Unit {
  nodeId?: number;
  devices?: Record<string, number>;
}

interface ChemConfig {
  timeZone?: string;
  lineProcessId?: number;
  shift?: { fromH: number; toH: number; days: number[] };
  demand?: Partial<typeof DEMAND>;
  // `startPct` - the level the simulation starts at (no metrics yet)
  tanks?: (TankSpec & Unit & { startPct?: number })[];
  dosing?: (DosingSpec & Unit)[];
  wastewater?: Unit & Partial<WastewaterSpec>;
  simulation?: { intervalSeconds?: number };
}

interface State {
  lastRun: number;
  tanks: Map<string, Tank>;
  dosing: Map<string, Dosing>;
  ww: Wastewater;
  lineBars: number | null;
  date: string;
  deliveries: string[]; // today's
  orders: Record<string, string>; // a tank's key - the date it was ordered (under its reorder level)
  declared: boolean;
}

const r = (x: number, d = 2) => Math.round(x * 10 ** d) / 10 ** d;
const freshWw = (): Wastewater => ({
  collectionL: 1200,
  pump: false,
  ph: 7.4,
  naoh: false,
  acid: false,
  sludgeL: 0,
  press: false,
  pressLeftS: 0,
  dpBar: 1,
  pressCycles: 0,
  treatedL: 0,
  causticL: 0,
  flocL: 0,
});

export default function registerChemWastewater(register: any, { apiClient, logger, stepDue }: any): void {
  const systemTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const states = new Map<number, State>();

  register("chem-wastewater", async (process: any) => {
    const now = Date.now();
    const config: ChemConfig = process.config ?? {};
    const intervalMs = (config.simulation?.intervalSeconds ?? DEFAULT_INTERVAL_S) * 1000;
    let st = states.get(process.id);
    if (st && !stepDue(process.id, intervalMs, st.lastRun, now)) return;
    const local = localParts(now, config.timeZone || systemTimeZone);
    const tanks = (config.tanks ?? []).filter((t) => t.key && t.capacityL > 0);
    const dosing = (config.dosing ?? []).filter((d) => d.bath && tanks.some((t) => t.key === d.tank) && d.volumeL > 0);
    const { nodeId: _n, devices: _d, ...wwGiven } = config.wastewater ?? {};
    const wws: WastewaterSpec = { ...WASTEWATER, ...wwGiven };
    const demand = { ...DEMAND, ...(config.demand ?? {}) };
    if (!st) {
      // the plant's state survives a restart (the last metrics)
      const m = process.metrics ?? {};
      const mt = new Map<string, any>((m.tanks ?? []).map((t: any) => [t.key, t]));
      const md = new Map<string, any>((m.dosing ?? []).map((d: any) => [d.bath, d]));
      const today = m.date === local.date;
      st = {
        lastRun: 0,
        tanks: new Map(
          tanks.map((t) => {
            const o = mt.get(t.key);
            const levelL = Number.isFinite(o?.levelL) ? o.levelL : (t.capacityL * (t.startPct ?? 70)) / 100;
            return [t.key, { levelL, todayL: today && Number.isFinite(o?.todayL) ? o.todayL : 0, rateLDay: Number(o?.rateLDay) || 0 }];
          }),
        ),
        dosing: new Map(dosing.map((d) => [d.bath, { gl: Number.isFinite(md.get(d.bath)?.gl) ? md.get(d.bath).gl : d.targetGl, pump: false }])),
        ww: { ...freshWw(), ...(m.wastewater?.state && typeof m.wastewater.state === "object" ? m.wastewater.state : {}) },
        lineBars: today && Number.isFinite(m.lineBars) ? m.lineBars : null,
        date: local.date,
        deliveries: today && Array.isArray(m.deliveries) ? m.deliveries : [],
        orders: m.orders && typeof m.orders === "object" ? { ...m.orders } : {},
        declared: false,
      };
      if (!today) Object.assign(st.ww, { pressCycles: 0, treatedL: 0, causticL: 0, flocL: 0 });
      states.set(process.id, st);
    }
    const seconds = st.lastRun ? Math.min(intervalMs * 3, now - st.lastRun) / 1000 : intervalMs / 1000;
    st.lastRun = now;
    // the config may add a tank or a bath later
    for (const t of tanks)
      if (!st.tanks.has(t.key)) st.tanks.set(t.key, { levelL: (t.capacityL * (t.startPct ?? 70)) / 100, todayL: 0, rateLDay: 0 });
    for (const d of dosing) if (!st.dosing.has(d.bath)) st.dosing.set(d.bath, { gl: d.targetGl, pump: false });
    if (st.date !== local.date) {
      for (const t of st.tanks.values()) tankNewDay(t);
      Object.assign(st.ww, { pressCycles: 0, treatedL: 0, causticL: 0, flocL: 0 });
      st.date = local.date;
      st.deliveries = [];
      st.lineBars = 0;
    }

    // 1. the line's finished bars, the shift
    const shift = config.shift ?? { fromH: 6, toH: 22, days: [1, 2, 3, 4, 5] };
    const onShift = shift.days.includes(local.weekday) && local.hour >= shift.fromH && local.hour < shift.toH;
    const line = config.lineProcessId ? (await apiClient.listProcesses()).find((p: any) => p.id === config.lineProcessId)?.metrics : null;
    const lineBars = Number(line?.today?.bars);
    let bars = 0;
    if (Number.isFinite(lineBars)) {
      if (st.lineBars !== null && lineBars > st.lineBars) bars = lineBars - st.lineBars;
      st.lineBars = lineBars;
    }
    const inflowLMin = onShift ? demand.rinseShiftLMin : demand.rinseNightLMin;

    // 2. the models
    let dragOutL = 0;
    for (const d of dosing) {
      dosingStep(d, st.dosing.get(d.bath)!, st.tanks.get(d.tank)!, bars, seconds);
      dragOutL += bars * d.dragOutL;
    }
    const dischargeLMin = wastewaterStep(wws, st.ww, inflowLMin, dragOutL, seconds);
    // a tank under its reorder level - ordered today, delivered the next morning
    for (const t of tanks) {
      const k = st.tanks.get(t.key)!;
      const under = (k.levelL / t.capacityL) * 100 < t.reorderPct;
      if (under && !st.orders[t.key]) st.orders[t.key] = local.date;
      const ordered = st.orders[t.key];
      if (ordered && ordered < local.date && local.hour >= DELIVERY_H) {
        if (deliver(t, k)) {
          st.deliveries.push(t.key);
          logger.info({ processId: process.id, tank: t.key }, "chem-wastewater: a delivery");
        }
        delete st.orders[t.key];
      }
    }

    // 3. readings and switches
    const nodes = new Map<number, any>((await apiClient.listNodes()).map((n: any) => [n.id, n]));
    const sim = (u?: Unit) => u?.nodeId !== undefined && nodes.get(u.nodeId)?.simulated === true;
    const writes: { id: number; value: unknown }[] = [];
    const put = (u: Unit | undefined, key: string, value: number) => {
      const id = u?.devices?.[key];
      if (sim(u) && typeof id === "number") writes.push({ id, value });
    };
    const auto = (u: Unit | undefined, key: string, on: boolean) => {
      const id = u?.devices?.[key];
      return typeof id === "number" ? apiClient.setDeviceAuto(id, on) : Promise.resolve();
    };
    for (const t of tanks) put(t, "level", r((st.tanks.get(t.key)!.levelL / t.capacityL) * 100, 1));
    const ww = config.wastewater;
    put(ww, "level", r((st.ww.collectionL / wws.collectionL) * 100, 1));
    put(ww, "ph", r(st.ww.ph, 2));
    put(ww, "flow", r(dischargeLMin, 1));
    put(ww, "sludge", r((st.ww.sludgeL / wws.settlerSludgeL) * 100, 1));
    await Promise.allSettled([
      writes.length ? apiClient.simulateDevices(writes) : Promise.resolve(),
      ...dosing.map((d) => auto(d, "pump", st!.dosing.get(d.bath)!.pump)),
      auto(ww, "pump", st.ww.pump),
      auto(ww, "naoh", st.ww.naoh),
      auto(ww, "acid", st.ww.acid),
      auto(ww, "press", st.ww.press),
    ]);

    // 5. WEM, metrics, series
    const warnings: any[] = [];
    const criticals: any[] = [];
    for (const t of tanks) {
      const pct = (st.tanks.get(t.key)!.levelL / t.capacityL) * 100;
      if (pct < t.criticalPct)
        criticals.push({ code: `tank_${t.key}_critical`, level: 2, ...wem("{{name}} at {{pct}} % - the dosing stops soon", { name: t.name, pct: r(pct, 0) }) });
      else if (pct < t.reorderPct)
        warnings.push({ code: `tank_${t.key}_reorder`, level: 1, ...wem("{{name}} at {{pct}} % - order a delivery", { name: t.name, pct: r(pct, 0) }) });
    }
    const collectionPct = (st.ww.collectionL / wws.collectionL) * 100;
    if (collectionPct > wws.highPct)
      warnings.push({ code: "collection_high", level: 1, ...wem("The wastewater's collection tank at {{pct}} %", { pct: r(collectionPct, 0) }) });
    if (st.ww.ph < DISCHARGE.minPh || st.ww.ph > DISCHARGE.maxPh)
      warnings.push({ code: "wastewater_ph", level: 1, ...wem("Wastewater at pH {{ph}} - out of the discharge limits", { ph: r(st.ww.ph, 1) }) });
    if (st.ww.dpBar > wws.dpLimitBar)
      warnings.push({ code: "press_cloth", level: 1, ...wem("The filter press's cloth at {{bar}} bar - change it", { bar: r(st.ww.dpBar, 1) }) });
    await apiClient.syncMessages(process.id, "warning", warnings);
    await apiClient.syncMessages(process.id, "error", criticals);
    await apiClient.setWarning(process.id, warnings.length > 0);
    await apiClient.setCritical(process.id, criticals.length > 0);
    if (!st.declared) {
      try {
        await apiClient.declareSeries(process.id, [
          { valueKey: "chem.wastewaterPh", name: "Wastewater pH", unit: "pH", kind: "gauge", mode: "period", periodS: 300 },
          { valueKey: "chem.collectionPct", name: "Collection tank", unit: "%", kind: "gauge", mode: "period", periodS: 300 },
          ...tanks.map((t) => ({ valueKey: `chem.tank.${t.key}.pct`, name: `${t.name} - level`, unit: "%", kind: "gauge", mode: "period", periodS: 900 })),
        ]);
        st.declared = true;
      } catch (err) {
        logger.warn({ processId: process.id, err }, "chem-wastewater: failed to declare the series");
      }
    }
    const values: Record<string, number> = { "chem.wastewaterPh": r(st.ww.ph, 2), "chem.collectionPct": r(collectionPct, 1) };
    for (const t of tanks) values[`chem.tank.${t.key}.pct`] = r((st.tanks.get(t.key)!.levelL / t.capacityL) * 100, 1);
    await apiClient.setMetrics(process.id, {
      onShift,
      date: st.date,
      at: now,
      tanks: tanks.map((t) => {
        const k = st!.tanks.get(t.key)!;
        const pct = (k.levelL / t.capacityL) * 100;
        // no day's rate yet (the first day) - today's litres so far, stretched over the whole day
        const days = daysLeft(k.rateLDay > 0 ? k : { ...k, rateLDay: k.todayL / Math.max(0.1, (local.hour + 1) / 24) });
        return {
          key: t.key,
          name: t.name,
          levelL: r(k.levelL, 1),
          levelPct: r(pct, 1),
          capacityL: t.capacityL,
          todayL: r(k.todayL, 2),
          rateLDay: r(k.rateLDay, 2),
          daysLeft: days === null ? null : r(days, 1),
          state: pct < t.criticalPct ? "critical" : pct < t.reorderPct ? "reorder" : "ok",
          // ordered on this date (the delivery the next morning), null - not ordered
          orderedOn: st!.orders[t.key] ?? null,
          dosing: dosing.some((d) => d.tank === t.key && st!.dosing.get(d.bath)!.pump),
        };
      }),
      dosing: dosing.map((d) => {
        const x = st!.dosing.get(d.bath)!;
        return { bath: d.bath, tank: d.tank, gl: r(x.gl, 1), targetGl: d.targetGl, bandGl: d.bandGl, pump: x.pump };
      }),
      wastewater: {
        collectionPct: r(collectionPct, 1),
        collectionL: r(st.ww.collectionL, 0),
        highPct: wws.highPct,
        minutesToFull: (() => {
          const v = minutesToFull(wws, st!.ww, inflowLMin);
          return v === null ? null : r(v, 0);
        })(),
        inflowLMin: r(inflowLMin, 1),
        pump: st.ww.pump,
        ph: r(st.ww.ph, 2),
        naoh: st.ww.naoh,
        acid: st.ww.acid,
        dischargeLMin: r(dischargeLMin, 1),
        discharge: DISCHARGE,
        sludgePct: r((st.ww.sludgeL / wws.settlerSludgeL) * 100, 1),
        press: st.ww.press,
        pressLeftMin: r(st.ww.pressLeftS / 60, 1),
        pressEndAt: st.ww.press ? Math.round(now + st.ww.pressLeftS * 1000) : null,
        pressSpanS: wws.pressMin * 60,
        dpBar: r(st.ww.dpBar, 2),
        dpLimitBar: wws.dpLimitBar,
        // the whole model state - restored after a restart
        state: { ...st.ww },
      },
      lineBars: st.lineBars,
      deliveries: st.deliveries,
      orders: st.orders,
      today: {
        treatedM3: r(st.ww.treatedL / 1000, 2),
        causticL: r(st.ww.causticL, 2),
        flocL: r(st.ww.flocL, 3),
        pressCycles: st.ww.pressCycles,
        dosedL: r([...st.tanks.values()].reduce((a, t) => a + t.todayL, 0), 2),
      },
      values,
    });
  });
}
