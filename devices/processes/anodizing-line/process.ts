/**
 * "anodizing-line" process kind - a surface-treatment line on flight bars (CORE Library package
 * devices/processes/anodizing-line/; the metal shop of the demo, iot AGENTS_TO_DO.md 2026-11-18): the baths
 * (node type `process-bath` - a heater and / or a cooling coil, a temperature probe, a level sensor), the
 * hoist (`hoist` - its position, its lift), the rectifier of the anodize bath (`rectifier`).
 *
 * Every `simulation.intervalSeconds` (default 10):
 *  1. the baths' thermostats - the heater below the set point's band, the cooler above it (the anodize
 *     bath - the chiller takes the current's heat);
 *  2. the hoist and the bars (model.ts lineStep): a bar into the first bath every `loadEveryMin` while it
 *     is free, each bar to its next bath once its time is done and that bath is free, the longest waiting
 *     first, the finished ones unloaded - the parts counted;
 *  3. the rectifier: on while a bar is in the anodize bath, its current ramped up to `densityAdm2` x the
 *     bar's area over `rectifier.rampS`, the bar's coating and charge counted;
 *  4. a simulated unit gets its readings from the models: the baths' temperatures and levels, the hoist's
 *     position, the rectifier's voltage and current; a physical one is read;
 *  5. the outputs (AUTO): the heaters, the coolers, the hoist's lift, the rectifier's output;
 *  6. today's account (the bars, the parts, the electricity - the heaters, the chiller, the rectifier, the
 *     hoist), WEM (a bath off its band, a low level), metrics (the panel, the metal shop's), series `line.*`.
 */
import { localParts } from "../../lib/localTime.ts";
import { wem } from "../../lib/wem.ts";
import {
  anodizeVolts,
  barInAnodize,
  bathStep,
  coatingUm,
  doneAt,
  emptyLine,
  hoistPlan,
  levelStep,
  lineStep,
  stationOf,
  priceMode,
  thermostat,
  type PriceMode,
  type BathRole,
  type BathSpec,
  type Line,
  type LineSpec,
  type RecipeStep,
} from "./model.ts";

const DEFAULT_INTERVAL_S = 10;
// the chiller's electricity per kW of heat it takes out (its COP)
const CHILLER_COP = 3.2;
// the rectifier's efficiency, the hoist's drive while it moves
const RECTIFIER_EFF = 0.9;
const HOIST_KW = 1.5;
// a bath this far off its band raises a warning; a level under this
const OFF_BAND_K = 3;
const LOW_LEVEL_PCT = 80;
// the finished bars kept in the metrics
const RECENT = 12;

interface BathConfig extends Omit<BathSpec, "nodeId"> {
  nodeId: number;
  devices?: { temperature?: number; level?: number; heater?: number; cooler?: number };
}

interface LineConfig {
  timeZone?: string;
  // the baths' heat by the electricity's price (2026-11-20): the Energy Field process whose metrics' `price.rank`
  // (0 - the day's cheapest, 1 - the dearest) sets the mode - cheap (<= cheapRank) stores heat to the band's top,
  // dear (>= dearRank) rides its bottom; the band itself is never left
  price?: { energyProcessId?: number; cheapRank?: number; dearRank?: number };
  line?: Partial<Omit<LineSpec, "baths" | "recipe">>;
  baths?: BathConfig[];
  recipe?: RecipeStep[];
  hoist?: { nodeId: number; devices?: { position?: number; lift?: number } };
  rectifier?: { nodeId: number; rampS?: number; devices?: { voltage?: number; current?: number; output?: number } };
  simulation?: { intervalSeconds?: number };
}

const LINE_DEFAULTS: Omit<LineSpec, "baths" | "recipe"> = {
  pitchMm: 900,
  speedMmS: 250,
  liftS: 20,
  dripS: 15,
  leadS: 10,
  loadEveryMin: 14,
  barAreaDm2: 1900,
  partsPerBar: 40,
  densityAdm2: 1.5,
  ambientC: 18,
};

const ROLES: BathRole[] = ["degrease", "etch", "desmut", "anodize", "dye", "seal", "rinse"];

interface Today {
  date: string;
  bars: number;
  parts: number;
  kwh: number;
  ah: number;
}

const r = (x: number, d = 2) => Math.round(x * 10 ** d) / 10 ** d;

export default function registerAnodizingLine(register: any, { apiClient, logger, stepDue }: any): void {
  const systemTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const states = new Map<
    number,
    {
      lastRun: number;
      temps: Map<number, number>;
      levels: Map<number, number>;
      thermo: Map<number, { heating: boolean; cooling: boolean }>;
      line: Line;
      today: Today;
      declared: string | null;
      // the last finished bars (the next stations - the oven, QC - take their coating from here)
      recent: { id: string; coatingUm: number; ah: number; at: number }[];
      // the rectifier's output now
      rect: { on: boolean; currentA: number; voltageV: number; densityAdm2: number };
    }
  >();

  register("anodizing-line", async (process: any) => {
    const now = Date.now();
    const config: LineConfig = process.config ?? {};
    const intervalMs = (config.simulation?.intervalSeconds ?? DEFAULT_INTERVAL_S) * 1000;
    let st = states.get(process.id);
    if (st && !stepDue(process.id, intervalMs, st.lastRun, now)) return;
    const local = localParts(now, config.timeZone || systemTimeZone);
    const baths: BathConfig[] = (config.baths ?? []).filter((b) => ROLES.includes(b.role));
    const recipe = (config.recipe ?? []).filter((s) => s.bath >= 0 && s.bath < baths.length && s.minutes > 0);
    if (!baths.length || !recipe.length) {
      await apiClient.syncMessages(process.id, "warning", [{ code: "not_configured", level: 1, ...wem("The line has no baths or no recipe - nothing runs") }]);
      await apiClient.setWarning(process.id, true);
      return;
    }
    const spec: LineSpec = { ...LINE_DEFAULTS, ...(config.line ?? {}), baths, recipe };
    if (!st) {
      const m = process.metrics ?? {};
      const saved: Partial<Today> = m.today?.date === local.date ? m.today : {};
      st = {
        lastRun: 0,
        temps: new Map((m.baths ?? []).filter((b: any) => Number.isFinite(b.tempC)).map((b: any) => [b.nodeId, b.tempC])),
        levels: new Map((m.baths ?? []).filter((b: any) => Number.isFinite(b.levelPct)).map((b: any) => [b.nodeId, b.levelPct])),
        thermo: new Map(),
        line: emptyLine(),
        today: { date: local.date, bars: 0, parts: 0, kwh: 0, ah: 0, ...saved },
        declared: null,
        recent: Array.isArray(m.recent) ? m.recent.slice(-RECENT) : [],
        rect: { on: false, currentA: 0, voltageV: 0, densityAdm2: 0 },
      };
      st.line.done = { bars: st.today.bars, parts: st.today.parts };
      // the bars in the baths survive a restart (the last metrics): each back in its bath, its time there
      // kept; a carried one - back where it was lifted from
      for (const b of m.bars ?? []) {
        if (typeof b.id !== "string" || !Number.isInteger(b.step) || b.step < 0 || b.step >= recipe.length) continue;
        st.line.bars.push({ id: b.id, step: b.step, inSince: now - (Number(b.elapsedMin) || 0) * 60_000, coatingUm: Number(b.coatingUm) || 0, ah: 0 });
      }
      const serials = st.line.bars.map((b) => Number(b.id.slice(2))).filter(Number.isFinite);
      st.line.serial = Math.max(st.today.bars, ...serials, 0);
      st.line.lastLoad = st.line.bars.length ? now : 0;
      states.set(process.id, st);
    }
    const seconds = st.lastRun ? Math.min(intervalMs * 3, now - st.lastRun) / 1000 : intervalMs / 1000;
    st.lastRun = now;
    if (st.today.date !== local.date) {
      st.today = { date: local.date, bars: 0, parts: 0, kwh: 0, ah: 0 };
      st.line.done = { bars: 0, parts: 0 };
    }

    // which units are simulated; the physical ones' readings
    const nodes = new Map<number, { simulated: boolean }>((await apiClient.listNodes()).map((n: any) => [n.id, n]));
    const simulated = (nodeId: number | undefined) => nodeId !== undefined && nodes.get(nodeId)?.simulated === true;
    const readIds = [
      ...baths.filter((b) => !simulated(b.nodeId)).flatMap((b) => [b.devices?.temperature, b.devices?.level]),
      !simulated(config.hoist?.nodeId) ? config.hoist?.devices?.position : undefined,
    ].filter((x): x is number => typeof x === "number");
    const { values: readings } = readIds.length ? await apiClient.getDeviceValues(readIds) : { values: {} as Record<number, any> };
    const num = (id: number | undefined): number | null => {
      if (typeof id !== "number") return null;
      const v = readings?.[id];
      const n = v && v.source !== "error" ? Number(v.value) : NaN;
      return Number.isFinite(n) ? n : null;
    };
    for (const b of baths) {
      if (simulated(b.nodeId)) continue;
      const t = num(b.devices?.temperature);
      const l = num(b.devices?.level);
      if (t !== null) st.temps.set(b.nodeId, t);
      if (l !== null) st.levels.set(b.nodeId, l);
    }

    // 2. the hoist and the bars
    const barsOut = new Map<number, number>();
    const finished = lineStep(spec, st.line, now, seconds, (station) => barsOut.set(station, (barsOut.get(station) ?? 0) + 1));
    for (const b of finished) st.recent.push({ id: b.id, coatingUm: r(b.coatingUm, 1), ah: r(b.ah, 0), at: now });
    st.recent = st.recent.slice(-RECENT);
    st.today.bars = st.line.done.bars;
    st.today.parts = st.line.done.parts;

    // 3. the rectifier: on while a bar is in the anodize bath, ramped up
    const anodizeIdx = baths.findIndex((b) => b.role === "anodize");
    const inAnodize = barInAnodize(spec, st.line);
    const rampMs = (config.rectifier?.rampS ?? 120) * 1000;
    if (inAnodize && anodizeIdx >= 0) {
      const share = Math.min(1, Math.max(0, (now - inAnodize.inSince) / rampMs));
      const density = spec.densityAdm2 * share;
      const tempC = st.temps.get(baths[anodizeIdx].nodeId) ?? baths[anodizeIdx].setpointC ?? 20;
      st.rect = { on: true, densityAdm2: density, currentA: density * spec.barAreaDm2, voltageV: anodizeVolts(density, tempC) };
      inAnodize.coatingUm += coatingUm(density, seconds / 60);
      inAnodize.ah += (st.rect.currentA * seconds) / 3600;
      st.today.ah += (st.rect.currentA * seconds) / 3600;
    } else st.rect = { on: false, densityAdm2: 0, currentA: 0, voltageV: 0 };
    const rectKw = (st.rect.currentA * st.rect.voltageV) / 1000 / RECTIFIER_EFF;

    // the electricity's price now - the baths' mode
    const energy = config.price?.energyProcessId
      ? (await apiClient.listProcesses()).find((p: any) => p.id === config.price!.energyProcessId)?.metrics
      : null;
    const rank = Number.isFinite(Number(energy?.price?.rank)) ? Number(energy.price.rank) : null;
    const mode: PriceMode = priceMode(rank, config.price?.cheapRank, config.price?.dearRank);

    // 1. + 4. the baths: the thermostat, the simulated heat balance and level
    const hours = seconds / 3600;
    const writes: { id: number; value: unknown }[] = [];
    let heatersKw = 0;
    let chillerKw = 0;
    // the heat the cooling coils take now - the chiller's load (the shop-utilities process)
    let coolingKw = 0;
    const bathView = baths.map((b, i) => {
      const spec_ = b as BathSpec;
      const tempC = st!.temps.get(b.nodeId) ?? (b.setpointC ?? spec.ambientC);
      const levelPct = st!.levels.get(b.nodeId) ?? 92;
      const was = st!.thermo.get(b.nodeId) ?? { heating: false, cooling: false };
      const ctl = thermostat(spec_, tempC, was, mode);
      st!.thermo.set(b.nodeId, ctl);
      if (ctl.heating) heatersKw += b.heaterKw;
      if (ctl.cooling) {
        chillerKw += b.coolerKw / CHILLER_COP;
        coolingKw += b.coolerKw;
      }
      if (simulated(b.nodeId)) {
        const joule = i === anodizeIdx ? st!.rect.currentA * st!.rect.voltageV * 0.001 * 0.9 : 0;
        const t = bathStep(spec_, tempC, hours, ctl.heating, ctl.cooling, joule, spec.ambientC);
        const l = levelStep(spec_, levelPct, t, hours, barsOut.get(stationOf(i)) ?? 0);
        st!.temps.set(b.nodeId, t);
        st!.levels.set(b.nodeId, l);
        if (typeof b.devices?.temperature === "number") writes.push({ id: b.devices.temperature, value: r(t, 1) });
        if (typeof b.devices?.level === "number") writes.push({ id: b.devices.level, value: r(l, 1) });
      }
      const bar = st!.line.bars.find((x) => x.id !== st!.line.hoist.carrying && x.step >= 0 && recipe[x.step].bath === i);
      return {
        nodeId: b.nodeId,
        name: b.name,
        role: b.role,
        tempC: r(st!.temps.get(b.nodeId) ?? tempC, 1),
        setC: b.setpointC,
        levelPct: r(st!.levels.get(b.nodeId) ?? levelPct, 1),
        heating: ctl.heating,
        cooling: ctl.cooling,
        barId: bar?.id ?? null,
      };
    });
    const h = st.line.hoist;
    if (simulated(config.hoist?.nodeId) && typeof config.hoist?.devices?.position === "number")
      writes.push({ id: config.hoist.devices.position, value: r(h.posMm, 0) });
    else {
      const pos = num(config.hoist?.devices?.position);
      if (pos !== null) h.posMm = pos;
    }
    const rd = config.rectifier?.devices ?? {};
    if (simulated(config.rectifier?.nodeId)) {
      if (typeof rd.voltage === "number") writes.push({ id: rd.voltage, value: r(st.rect.voltageV, 2) });
      if (typeof rd.current === "number") writes.push({ id: rd.current, value: r(st.rect.currentA, 1) });
    }
    const writing = writes.length ? apiClient.simulateDevices(writes) : Promise.resolve();

    // 5. the outputs (AUTO) - written on a change, re-asserted by the platform
    const outputs: Promise<unknown>[] = [];
    for (const b of baths) {
      const c = st.thermo.get(b.nodeId)!;
      if (typeof b.devices?.heater === "number") outputs.push(apiClient.setDeviceAuto(b.devices.heater, c.heating));
      if (typeof b.devices?.cooler === "number") outputs.push(apiClient.setDeviceAuto(b.devices.cooler, c.cooling));
    }
    if (typeof config.hoist?.devices?.lift === "number") outputs.push(apiClient.setDeviceAuto(config.hoist.devices.lift, h.carrying !== null));
    if (typeof rd.output === "number") outputs.push(apiClient.setDeviceAuto(rd.output, st.rect.on));
    await Promise.allSettled([writing, ...outputs]);

    // 6. the account, WEM, metrics, series
    const moving = h.state === "to-pick" || h.state === "carry" || h.state === "lift-up" || h.state === "lift-down";
    const powerKw = heatersKw + chillerKw + rectKw + (moving ? HOIST_KW : 0);
    st.today.kwh += powerKw * hours;
    const warnings = bathView.flatMap((b) => {
      const out: any[] = [];
      if (b.setC !== null) {
        const tol = (baths.find((x) => x.nodeId === b.nodeId)?.tolC ?? 2) / 2;
        if (Math.abs(b.tempC - b.setC) > tol + OFF_BAND_K)
          out.push({ code: `bath_${b.nodeId}_temp`, level: 1, ...wem("{{name}} at {{tempC}} C - its set point {{setC}} C", { name: b.name, tempC: b.tempC, setC: b.setC }) });
      }
      if (b.levelPct < LOW_LEVEL_PCT) out.push({ code: `bath_${b.nodeId}_level`, level: 1, ...wem("{{name}} - level {{levelPct}} %", { name: b.name, levelPct: b.levelPct }) });
      return out;
    });
    await apiClient.syncMessages(process.id, "warning", warnings);
    await apiClient.setWarning(process.id, warnings.length > 0);

    const unit = baths.map((b) => b.nodeId).join(",");
    if (st.declared !== unit) {
      try {
        await apiClient.declareSeries(process.id, [
          { valueKey: "line.powerKw", name: "The line's electricity", unit: "kW", kind: "gauge", mode: "period", periodS: 300 },
          { valueKey: "line.rectifierA", name: "Rectifier - current", unit: "A", kind: "gauge", mode: "period", periodS: 60 },
          { valueKey: "line.rectifierV", name: "Rectifier - voltage", unit: "V", kind: "gauge", mode: "period", periodS: 60 },
          ...baths.map((b) => ({ valueKey: `line.bath.${b.nodeId}.tempC`, name: `${b.name} - temperature`, unit: "C", kind: "gauge", mode: "period", periodS: 300 })),
        ]);
        st.declared = unit;
      } catch (err) {
        logger.warn({ processId: process.id, err }, "anodizing-line: failed to declare the series");
      }
    }
    const values: Record<string, number> = { "line.powerKw": r(powerKw, 2), "line.rectifierA": r(st.rect.currentA, 0), "line.rectifierV": r(st.rect.voltageV, 2) };
    for (const b of bathView) values[`line.bath.${b.nodeId}.tempC`] = b.tempC;
    await apiClient.setMetrics(process.id, {
      powerKw: r(powerKw, 2),
      // the baths' heat by the price now: the mode and the price's rank (null - no Energy Field)
      price: { mode, rank },
      coolingKw: r(coolingKw, 1),
      // the chiller's electricity within powerKw (a shop's sum with its own chiller takes it out)
      chillerKw: r(chillerKw, 2),
      baths: bathView,
      // the level a warning starts under (the panel marks it on the baths' level gauges)
      lowLevelPct: LOW_LEVEL_PCT,
      hoist: {
        posMm: r(h.posMm, 0),
        state: h.state,
        carrying: h.carrying,
        // the station it heads for / stands at (0 - load, 1..n - the baths, n + 1 - unload)
        to: h.move?.to ?? null,
        from: h.move?.from ?? null,
        // the panel's moving hoist: the time left in this phase, the stations' pitch, a lift's time, the stations
        phaseLeftS: r(h.phaseLeftS, 1),
        // the move's timeline (ms; the panel plays it on its clock - model.ts hoistPlan), `at` - this update's time
        plan: hoistPlan(spec, st.line, now),
        at: now,
        // the bar of this move (lifted, carried, lowered; null - a new one from the load station, not yet taken)
        bar: h.move?.bar ?? null,
        pitchMm: spec.pitchMm,
        liftS: spec.liftS,
        stations: baths.length + 2,
      },
      rectifier: { on: st.rect.on, currentA: r(st.rect.currentA, 0), voltageV: r(st.rect.voltageV, 2), densityAdm2: r(st.rect.densityAdm2, 2), barId: inAnodize?.id ?? null },
      bars: st.line.bars.map((b) => {
        const step = recipe[Math.max(0, b.step)];
        return {
          id: b.id,
          step: b.step,
          bath: b.step >= 0 ? baths[step.bath].name : null,
          station: b.step >= 0 ? stationOf(step.bath) : null,
          elapsedMin: b.step >= 0 ? r((now - b.inSince) / 60_000, 1) : 0,
          needMin: b.step >= 0 ? step.minutes : 0,
          // the step's seconds left (the panel's step timer; 0 - done, waiting for the hoist)
          leftS: b.step >= 0 ? Math.max(0, r(step.minutes * 60 - (now - b.inSince) / 1000, 0)) : 0,
          // when it ends (ms) - the timer counts to it on the panel's clock, not from each update's arrival
          doneAt: b.step >= 0 ? Math.round(doneAt(spec, b)) : null,
          coatingUm: r(b.coatingUm, 1),
          carried: b.id === h.carrying,
          steps: recipe.length,
        };
      }),
      finished: finished.map((b) => ({ id: b.id, coatingUm: r(b.coatingUm, 1), ah: r(b.ah, 0) })),
      recent: st.recent,
      today: { date: st.today.date, bars: st.today.bars, parts: st.today.parts, kwh: r(st.today.kwh, 2), ah: r(st.today.ah, 0) },
      values,
    });
  });
}
