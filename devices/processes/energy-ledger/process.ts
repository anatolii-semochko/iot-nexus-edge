/**
 * "energy-ledger" process kind - the site's energy and money journal (CORE
 * Library package devices/processes/energy-ledger/; reads energy-field,
 * energy-grid and heating-control). L1 of the Ledger (iot AGENTS_TO_DO.md
 * 2026-10-20): the day's record and the savings; the plan, the strategies,
 * the learning and the AI's reports come in the next stages.
 *
 * Every `intervalSeconds` (default 60):
 *  1. the sources' metrics (GET /processes): the field's power now and its
 *     today, the grid's today (cost, revenue) and price, the heatings' today;
 *  2. the day's record grows by the sources' increments since the last run
 *     (their "today" counters - a counter that went down started a new day),
 *     so every figure covers the same time - a ledger started mid-day marks
 *     the day partial; plus its own integral - the whole consumption x the
 *     slot's purchase price ("all bought", the baseline); the weather and
 *     the day's maxima;
 *  3. the record goes to the journal (PUT /energy-ledger/:id/days/:day)
 *     every `saveMinutes` and when the day closes (final);
 *  4. metrics: today's record, the bridge, the KPIs.
 */
import { accountsDay, roundAccounts, type AccountConfig, type AccountsDay } from "./accounts.ts";
import { forecastSlots, heatingModelOf, type PriceSlot } from "./forecast.ts";
import { accuracyOf, correctionsOf, NO_CORRECTIONS, type Corrections, type Sample } from "./learning.ts";
import { addDays, bridge, emptyDay, kpis, type LedgerDay } from "./ledger.ts";
import { planSteps, type PlannedSlot, type PlanSlot } from "./plan.ts";
import { autoSummary, dayTypeOf, NOTE_KINDS, noteEffects, noteOf, type DayNote } from "./notes.ts";
import { dayPrices, reviewDay } from "./review.ts";
import { analogChoice, featuresOfForecast, similarDays, type AnalogChoice, type DayFeatures, type RecordedDay, type SimilarDay } from "./similar.ts";
import { heatingSignals, planAll, STRATEGIES, STRATEGY_DEFAULTS, type StrategyKey, type StrategyParams, type StrategyResult } from "./strategies.ts";

const DEFAULT_INTERVAL_S = 60;
const DEFAULT_SAVE_MIN = 5;

interface LedgerConfig {
  timeZone?: string;
  fieldProcessId?: number;
  gridProcessId?: number;
  heatingProcessIds?: number[];
  // the heating planner whose planned electricity is the heating's part of the forecast (2026-10-29);
  // taken at each plan made - its own replan never triggers one (the planner follows the Ledger)
  heatingPlannerProcessId?: number;
  intervalSeconds?: number;
  saveMinutes?: number;
  // L2 - the plan: re-made every `intradayMinutes`, when new day-ahead
  // prices extend the horizon, and when the batteries' SoC drifts more than
  // `deviationPct` from the plan's; the batteries' wear in the money
  plan?: { enabled?: boolean; intradayMinutes?: number; deviationPct?: number; wearCtKwh?: number; efficiency?: number };
  // L3 - the strategy the plan follows; `selection` "propose" - on new day-ahead prices the strategy
  // the forecast finds cheapest by over `minGainEur` is proposed (the process's AI instance's Config
  // level decides: Auto - applied, Confirm - a card to accept, Off - not offered); "analog" - once a day
  // (and when the day's notes change) the strategy best on the most similar recorded days is applied by
  // the ledger itself (similar.ts - autonomous, no AI)
  strategy?: Partial<StrategyParams> & { key?: StrategyKey; selection?: "fixed" | "propose" | "analog"; minGainEur?: number; reservePct?: number; exportAllowed?: boolean; gridChargeAllowed?: boolean };
  // the cost accounts - who the energy is for: private, business, tenants (accounts.ts)
  accounts?: AccountConfig[];
  // the operational days' notes (notes.ts): the public holidays of `country` (ISO 3166, `region` - its
  // state / province code) written as notes `aheadDays` ahead, once a day
  calendar?: { country?: string; region?: string; aheadDays?: number };
  // temporary operating changes to undo (the scene's "For" - the user, 2026-10-25): at - the values back
  reverts?: Revert[];
}

interface Revert {
  at: number;
  ops: Record<string, unknown>; // the previous values (null - the field's own)
  replan?: boolean;
  reason?: string;
}

const PLAN_DEFAULTS = { enabled: true, intradayMinutes: 60, deviationPct: 10, wearCtKwh: 3, efficiency: 0.97 };
const SOURCES_TTL_MS = 10 * 60_000;
const HISTORY_DAYS = 14;
const LEARNING_DAYS = 28; // the samples the corrections come from
const HINDSIGHT_SHARE = 0.6; // "propose": a strategy best in hindsight on this share of the recent days
const HINDSIGHT_MIN_DAYS = 5;
const NOTES_AHEAD_DAYS = 2; // the notes the plan reads: today and the days its horizon reaches
const DEFAULT_CALENDAR_AHEAD_DAYS = 14;
const ANALOG_HISTORY_DAYS = 365; // the recorded days the similar ones are looked for in

/**
 * The operating parameters the plan keeps (stage D - the ledger manages the energy, the field is the plant and
 * its hard limits): the field's strategy (socMinPct / socMaxPct, export) with the ledger's own `reservePct`
 * and `gridChargeAllowed` over it when set (the AI's proposals, a person's choice).
 */
const operatingOf = (fieldCfg: any, config: LedgerConfig) => {
  const field = { socMinPct: 10, socMaxPct: 95, reservePct: 20, exportAllowed: true, gridChargeAllowed: true, ...(fieldCfg?.strategy ?? {}) };
  return {
    ...field,
    reservePct: Math.max(field.socMinPct, config.strategy?.reservePct ?? field.reservePct),
    exportAllowed: config.strategy?.exportAllowed ?? field.exportAllowed,
    gridChargeAllowed: config.strategy?.gridChargeAllowed ?? field.gridChargeAllowed,
  };
};

const plusDays = (day: string, n: number) => new Date(Date.parse(`${day}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

type Counters = Record<string, number>;

const r = (x: number, d = 3) => Math.round(x * 10 ** d) / 10 ** d;
const roundDay = (d: LedgerDay) => Object.fromEntries(Object.entries(d).map(([k, v]) => [k, typeof v === "number" ? r(v) : v])) as LedgerDay;

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- a Library package is loaded at run time by the orchestrator and imports nothing from it
export default function registerEnergyLedger(register: any, { apiClient, logger }: any): void {
  const systemTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const states = new Map<
    number,
    {
      lastRun: number;
      lastSave: number;
      date: string;
      partial: boolean;
      day: LedgerDay;
      prev: Counters | null;
      plan: { madeAt: number; reason: string; strategy: StrategyKey; slots: PlanSlot[]; planned: PlannedSlot[]; results: StrategyResult[]; signals: (1 | 2 | 3)[]; floorPct: number; hardMinPct: number } | null;
      sources: { at: number; prices: PriceSlot[]; weather: Record<string, number | null>[]; history: (LedgerDay & { hindsight?: { best: string } })[]; corrections: Corrections } | null;
      // L4: the slot being recorded (its forecast, its actual means so far) and today's samples
      slot: { t: number; end: number; pvF: number; windF: number; loadF: number; buy: number; sell: number; socStart: number; pv: number; wind: number; load: number; bat: number; hours: number } | null;
      samples: Sample[];
      samplesLoaded: boolean;
      // the cost accounts' day so far (the last run's - the day's record takes it when it closes)
      accounts: AccountsDay | null;
      // the operational days' notes (today and ahead), their fingerprint (a change re-plans), the day the
      // holidays were last synced
      notes: DayNote[];
      notesKey: string;
      // the similar days (stage C): the history they're looked for in (read once a day), today's choice
      analogHistory: { date: string; days: RecordedDay[] } | null;
      analog: { date: string; notesKey: string; at: number; target: DayFeatures; days: SimilarDay[]; choice: AnalogChoice; applied: boolean } | null;
      plannedNotesKey: string | null;
      calendarSynced: string | null;
    }
  >();

  const localDate = (ms: number, timeZone: string) =>
    new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));

  const save = async (processId: number, date: string, day: LedgerDay, partial: boolean, final: boolean) => {
    try {
      await apiClient.request(`/energy-ledger/${processId}/days/${date}`, {
        method: "PUT",
        body: JSON.stringify({ data: roundDay(day), partial, final }),
      });
    } catch (err) {
      logger.warn({ processId, date, err }, "energy-ledger: the day wasn't saved");
    }
  };

  /** The commands (POST /processes/:id/commands - processes.control): `setStrategy` { key }, `setSelection` { selection }. */
  async function applyCommands(process: any, config: LedgerConfig): Promise<{ config: LedgerConfig; replan: boolean }> {
    let next = config;
    let replan = false;
    for (const cmd of process.commands ?? []) {
      const p = cmd.params ?? {};
      let patch: Partial<LedgerConfig> | null = null;
      if (cmd.action === "setStrategy" && STRATEGIES.some((x) => x.key === p.key)) {
        patch = { strategy: { ...(next.strategy ?? {}), key: p.key } };
        replan = true;
      }
      // the operating parameters (the energy scene's switches): `replan` - the plan adapted to them at once
      else if (cmd.action === "setOperating" && (Number.isFinite(p.reservePct) || typeof p.exportAllowed === "boolean" || typeof p.gridChargeAllowed === "boolean")) {
        const ops: Record<string, unknown> = {};
        if (Number.isFinite(p.reservePct) && p.reservePct >= 0 && p.reservePct <= 100) ops.reservePct = p.reservePct;
        if (typeof p.exportAllowed === "boolean") ops.exportAllowed = p.exportAllowed;
        if (typeof p.gridChargeAllowed === "boolean") ops.gridChargeAllowed = p.gridChargeAllowed;
        patch = { strategy: { ...(next.strategy ?? {}), ...ops } };
        if (p.replan === true) replan = true;
        // only for a while - the previous values put back by the ledger itself at the time
        if (Number(p.forMinutes) > 0) {
          const before = Object.fromEntries(Object.keys(ops).map((k) => [k, (next.strategy as Record<string, unknown> | undefined)?.[k] ?? null]));
          const reason = typeof p.reason === "string" ? p.reason.slice(0, 300) : undefined;
          patch.reverts = [...(next.reverts ?? []), { at: Date.now() + Number(p.forMinutes) * 60_000, ops: before, replan: p.replan === true, ...(reason ? { reason } : {}) }];
        }
      } else if (cmd.action === "replan") {
        replan = true;
        await apiClient.completeCommand(process.id, cmd.id, { ok: true });
        continue;
      }
      else if (cmd.action === "setSelection" && ["fixed", "propose", "analog"].includes(p.selection)) {
        patch = { strategy: { ...(next.strategy ?? {}), selection: p.selection } };
        replan = true;
      }
      if (patch) {
        await apiClient.request(`/processes/${process.id}/config`, { method: "PATCH", body: JSON.stringify(patch) });
        next = { ...next, ...patch };
      }
      await apiClient.completeCommand(process.id, cmd.id, patch ? { ok: true } : { ok: false, error: `unknown command or bad params: ${cmd.action}` });
    }
    return { config: next, replan };
  }

  /** The plan re-made when it is due (none yet, its interval passed, a longer price horizon, the SoC drifted). */
  async function replanIfDue(processId: number, st: any, config: LedgerConfig, cfg: typeof PLAN_DEFAULTS, fieldProc: any, gridProc: any, now: number, timeZone: string, byIdOf: (id: number) => any) {
    const fieldCfg = fieldProc.config ?? {};
    if (!st.sources || now - st.sources.at >= SOURCES_TTL_MS) {
      const weatherId = fieldCfg.weatherProcessId;
      const [prices, weather, history, learnt] = await Promise.all([
        apiClient.request(`/energy-grid/${config.gridProcessId}/prices?from=${now - 15 * 60_000}&to=${now + 48 * 3_600_000}`),
        weatherId ? apiClient.request(`/weather-control/${weatherId}/forecast`) : Promise.resolve({ hourly: [] }),
        apiClient.request(`/energy-ledger/${processId}/days?from=${new Date(now - HISTORY_DAYS * 86_400_000).toISOString().slice(0, 10)}&to=${new Date(now).toISOString().slice(0, 10)}`),
        apiClient.request(`/energy-ledger/${processId}/samples?from=${now - LEARNING_DAYS * 86_400_000}&to=${now}`),
      ]);
      const month = Number(new Intl.DateTimeFormat("en-GB", { timeZone, month: "numeric" }).format(new Date(now)));
      st.sources = {
        at: now,
        prices: prices.slots ?? [],
        weather: weather.hourly ?? [],
        history: (history.days ?? []).map((x: any) => x.data),
        corrections: correctionsOf(learnt.samples ?? [], month),
      };
    }
    const src = st.sources;
    const lastPriced = src.prices.filter((x: PriceSlot) => x.buyCtKwh !== null).reduce((a: number, x: PriceSlot) => Math.max(a, x.t), 0);
    const planEnd = st.plan ? st.plan.slots[st.plan.slots.length - 1].t : 0;
    const socNow = Number(fieldProc.metrics?.totals?.socPct);
    const at = st.plan ? st.plan.slots.findIndex((x: PlanSlot) => x.t <= now && x.end > now) : -1;
    const expected = st.plan && at > 0 ? st.plan.planned[at - 1].socPct : null;
    let reason: string | null = null;
    if (!st.plan) reason = "first plan";
    else if (lastPriced > planEnd) reason = "new day-ahead prices";
    else if (st.plannedNotesKey !== st.notesKey) reason = "the day's notes changed";
    else if (now - st.plan.madeAt >= cfg.intradayMinutes * 60_000) reason = "the hourly update";
    else if (at < 0) reason = "the plan ran out";
    else if (expected !== null && Number.isFinite(socNow) && Math.abs(socNow - expected) > cfg.deviationPct) reason = `the batteries drifted from the plan (${socNow.toFixed(0)} % vs ${expected} %)`;
    if (!reason || !Number.isFinite(socNow)) return;

    const disabled = new Set<number>(fieldCfg.disabled ?? []);
    const units = (fieldCfg.batteries ?? []).filter((b: any) => !disabled.has(b.nodeId));
    const strategy = operatingOf(fieldCfg, config);
    const limits = gridProc?.config?.limits ?? {};
    const heating = heatingModelOf([...src.history, st.day]);
    let heatingPlan: Map<number, number> | null = null;
    if (config.heatingPlannerProcessId) {
      try {
        const hp = (await apiClient.request(`/heating-planner/${config.heatingPlannerProcessId}/plan`)).plan;
        if (hp?.electricity?.length) heatingPlan = new Map(hp.electricity.map((x: { t: number; kw: number }) => [x.t, x.kw]));
      } catch (err) {
        logger.warn({ processId, err }, "energy-ledger: no heating plan - the degree-hour model");
      }
    }
    const slots = forecastSlots(
      now,
      src.prices,
      src.weather,
      { pvBlocks: fieldCfg.pvBlocks ?? [], turbines: fieldCfg.turbines ?? [], profile: fieldCfg.consumer?.profile ?? null, disabled },
      heating,
      timeZone,
      src.corrections ?? NO_CORRECTIONS,
      noteEffects(st.notes, timeZone, units, {
        pumps: (config.heatingProcessIds ?? []).flatMap((id) => (byIdOf(id)?.config?.heatPumps ?? []).map((p: any) => ({ nodeId: p.nodeId, ratedKw: Number(p.ratedHeatKw) || 0 }))),
        coils: (config.heatingProcessIds ?? []).flatMap((id) => (byIdOf(id)?.config?.consumers ?? []).map((c: any) => ({ nodeId: c.nodeId, ratedKw: Number(c.ratedKw) || 0 }))),
      }),
      heatingPlan,
    );
    if (!slots.length || !units.length) return;
    const sp = { ...STRATEGY_DEFAULTS, ...(config.strategy ?? {}) };
    const key: StrategyKey = config.strategy?.key ?? "cost";
    const { plan: planned, results } = planAll(
      key,
      slots,
      {
        capacityKwh: units.reduce((a: number, b: any) => a + b.capacityKwh, 0),
        socPct: socNow,
        maxChargeKw: units.reduce((a: number, b: any) => a + b.maxChargeKw, 0),
        maxDischargeKw: units.reduce((a: number, b: any) => a + b.maxDischargeKw, 0),
        efficiency: cfg.efficiency,
      },
      {
        socMinPct: Math.max(strategy.socMinPct, strategy.reservePct),
        socMaxPct: strategy.socMaxPct,
        exportAllowed: strategy.exportAllowed,
        gridChargeAllowed: strategy.gridChargeAllowed,
        maxImportKw: limits.maxImportKw ?? null,
        maxExportKw: limits.maxExportKw ?? null,
        wearCtKwh: cfg.wearCtKwh,
        hardMinPct: strategy.socMinPct,
      },
      { reserveHighPct: sp.reserveHighPct, peakLimitKw: sp.peakLimitKw ?? null, peakPenaltyCtKwh: sp.peakPenaltyCtKwh, sellThresholdCt: sp.sellThresholdCt },
    );
    const signals = heatingSignals(slots);
    st.plan = { madeAt: now, reason, strategy: key, slots, planned, results, signals, floorPct: strategy.reservePct, hardMinPct: strategy.socMinPct };
    st.plannedNotesKey = st.notesKey;
    // the similar days' strategy (selection "analog") - once a day and when the day's notes change
    const today = localDate(now, timeZone);
    if (config.strategy?.selection === "analog" && (st.analog?.date !== today || st.analog.notesKey !== st.notesKey)) {
      if (st.analogHistory?.date !== today) {
        const got = await apiClient.request(`/energy-ledger/${processId}/days?from=${plusDays(today, -ANALOG_HISTORY_DAYS)}&to=${plusDays(today, -1)}`);
        st.analogHistory = { date: today, days: got.days ?? [] };
      }
      // the whole day's prices (the plan's start from now on only)
      const dayPricesNow = await apiClient
        .request(`/energy-grid/${config.gridProcessId}/prices?from=${now - 86_400_000}&to=${now + 86_400_000}`)
        .then((x: any) => x.slots ?? src.prices)
        .catch(() => src.prices);
      const target = featuresOfForecast(today, src.weather as any, dayPricesNow, dayTypeOf(today, st.notes).working, (ms) => localDate(ms, timeZone));
      const days = similarDays(target, st.analogHistory!.days, { exclude: today });
      const choice = analogChoice(days, Object.fromEntries(STRATEGIES.map((x) => [x.key, x.name])));
      const apply = choice.strategy !== null && choice.strategy !== key;
      st.analog = { date: today, notesKey: st.notesKey, at: now, target, days, choice, applied: apply };
      if (apply) {
        // the ledger's own decision - its config patched (the plan re-made on the next run)
        await apiClient.request(`/processes/${processId}/config`, { method: "PATCH", body: JSON.stringify({ strategy: { ...(config.strategy ?? {}), key: choice.strategy } }) });
        st.plan = null;
        logger.info({ processId, strategy: choice.strategy, reason: choice.reason }, "energy-ledger: the similar days' strategy applied");
        return;
      }
    }
    // a better strategy for the new prices - proposed (the permission - the instance's Config level)
    if (config.strategy?.selection === "propose" && reason === "new day-ahead prices") {
      // the recent days in hindsight first (L4): a strategy best on most of them
      const bests = src.history.map((d: any) => d.hindsight?.best).filter(Boolean) as string[];
      const counts = bests.reduce((m: Record<string, number>, k) => ({ ...m, [k]: (m[k] ?? 0) + 1 }), {});
      const [topKey, topCount] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0] ?? [null, 0];
      const byHistory = bests.length >= HINDSIGHT_MIN_DAYS && topKey && topKey !== key && topCount / bests.length >= HINDSIGHT_SHARE ? topKey : null;
      if (byHistory) {
        const name = STRATEGIES.find((x) => x.key === byHistory)?.name ?? byHistory;
        await apiClient
          .request(`/energy-ledger/${processId}/strategy-proposal`, {
            method: "POST",
            body: JSON.stringify({ key: byHistory, reason: `In hindsight "${name}" was the best on ${topCount} of the last ${bests.length} recorded days` }),
          })
          .catch((err: unknown) => logger.warn({ processId, err }, "energy-ledger: the strategy proposal failed"));
      }
      const mine = results.find((x) => x.key === key);
      const best = [...results].sort((a, b) => a.eur - b.eur)[0];
      const minGain = config.strategy?.minGainEur ?? 1;
      if (!byHistory && mine && best && best.key !== key && mine.eur - best.eur > minGain) {
        const name = STRATEGIES.find((x) => x.key === best.key)?.name ?? best.key;
        await apiClient
          .request(`/energy-ledger/${processId}/strategy-proposal`, {
            method: "POST",
            body: JSON.stringify({ key: best.key, reason: `The forecast to ${new Date(slots[slots.length - 1].end).toISOString().slice(0, 16)}: "${name}" costs ${best.eur.toFixed(2)} EUR, the current one ${mine.eur.toFixed(2)} EUR` }),
          })
          .catch((err: unknown) => logger.warn({ processId, err }, "energy-ledger: the strategy proposal failed"));
      }
    }
    const steps = planSteps(planned, slots);
    await apiClient.request(`/energy-ledger/${processId}/plan`, {
      method: "PUT",
      body: JSON.stringify({
        madeAt: now,
        reason,
        heating,
        corrections: src.corrections,
        notes: st.notes,
        strategy: key,
        strategies: results.map((x) => ({ ...x, eur: r(x.eur, 2), importKwh: r(x.importKwh, 1), peakKw: r(x.peakKw, 1), selfSufficiencyPct: x.selfSufficiencyPct === null ? null : r(x.selfSufficiencyPct, 1) })),
        slots: slots.map((x, i) => ({
          t: x.t,
          end: x.end,
          hours: r(x.hours, 4),
          buyCtKwh: x.buyCtKwh,
          sellCtKwh: x.sellCtKwh,
          generationKw: r(x.generationKw, 1),
          pvKw: r(x.pvKw ?? 0, 1),
          windKw: r(x.windKw ?? 0, 1),
          loadKw: r(x.loadKw, 1),
          heatKw: r(x.heatKw ?? 0, 1),
          batteryKw: r(planned[i].batteryKw, 1),
          gridKw: r(planned[i].gridKw, 1),
          curtailedKw: r(planned[i].curtailedKw, 1),
          socPct: planned[i].socPct,
          heatingSignal: signals[i],
          ...(x.gridOff ? { gridOff: true } : {}),
          ...(x.batteryFactor !== undefined ? { batteryFactor: r(x.batteryFactor, 2) } : {}),
          costEur: r(planned[i].costEur, 3),
          baselineEur: r(planned[i].baselineEur, 3),
        })),
        steps: steps.map((x) => ({ ...x, avgKw: r(x.avgKw, 1), avgBuyCtKwh: r(x.avgBuyCtKwh, 1), savingEur: r(x.savingEur, 2) })),
      }),
    });
    logger.info({ processId, reason, slots: slots.length }, "energy-ledger: plan made");
  }

  register("energy-ledger", async (process: any) => {
    const now = Date.now();
    let config: LedgerConfig = process.config ?? {};
    if ((process.commands ?? []).length) {
      const done = await applyCommands(process, config);
      config = done.config;
      // a new strategy, the operating parameters with "adapt the plan", a replan asked - planned at once
      const s0 = states.get(process.id);
      if (s0 && done.replan) s0.plan = null;
    }
    // the temporary changes whose time came - put back (the operator's "For")
    const due = (config.reverts ?? []).filter((x) => x.at <= now);
    if (due.length) {
      const strategy: Record<string, unknown> = { ...(config.strategy ?? {}) };
      for (const r of due)
        for (const [k, v] of Object.entries(r.ops)) {
          if (v === null) delete strategy[k];
          else strategy[k] = v;
        }
      const patch = { strategy, reverts: (config.reverts ?? []).filter((x) => x.at > now) };
      await apiClient.request(`/processes/${process.id}/config`, { method: "PATCH", body: JSON.stringify(patch) });
      config = { ...config, ...patch } as LedgerConfig;
      const s0 = states.get(process.id);
      if (s0 && due.some((r) => r.replan)) s0.plan = null;
      logger.info({ processId: process.id, reverted: due.map((r) => r.ops) }, "energy-ledger: temporary changes put back");
    }
    const intervalMs = (config.intervalSeconds ?? DEFAULT_INTERVAL_S) * 1000;
    let st = states.get(process.id);
    if (st && now - st.lastRun < intervalMs && !(process.commands ?? []).length) return;
    const timeZone = config.timeZone || systemTimeZone;
    const date = localDate(now, timeZone);
    if (!st) {
      // restored after a restart from the metrics (today only)
      const saved = process.metrics;
      const sameDay = saved?.date === date && saved?.day;
      st = {
        lastRun: 0,
        lastSave: 0,
        date,
        partial: sameDay ? saved.partial === true : true,
        day: sameDay ? { ...emptyDay(), ...saved.day } : emptyDay(),
        prev: sameDay ? (saved.counters ?? null) : null,
        plan: null,
        sources: null,
        slot: null,
        samples: [],
        samplesLoaded: false,
        accounts: sameDay ? (saved.accounts ?? null) : null,
        notes: [],
        notesKey: "",
        analogHistory: null,
        analog: null,
        plannedNotesKey: null,
        calendarSynced: null,
      };
      states.set(process.id, st);
    }
    const hours = st.lastRun ? Math.min(intervalMs * 3, now - st.lastRun) / 3_600_000 : 0;
    st.lastRun = now;

    const processes = await apiClient.listProcesses();
    const byId = (id?: number) => (id ? processes.find((p: any) => p.id === id) : undefined);
    const localOf = (ms: number) => {
      const parts = new Intl.DateTimeFormat("en-GB", { timeZone, month: "numeric", hour: "2-digit", weekday: "short", hourCycle: "h23" }).formatToParts(new Date(ms));
      const get = (t: string) => parts.find((x) => x.type === t)?.value ?? "";
      return { month: Number(get("month")), hour: Number(get("hour")), weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday")) };
    };
    // today's samples after a restart - from the journal (the accuracy, the hindsight cover the whole day)
    if (!st.samplesLoaded) {
      try {
        const got = await apiClient.request(`/energy-ledger/${process.id}/samples?from=${now - 26 * 3_600_000}&to=${now}`);
        st.samples = (got.samples ?? []).filter((x: Sample) => localDate(x.t, timeZone) === st!.date);
        st.samplesLoaded = true;
      } catch (err) {
        logger.warn({ processId: process.id, err }, "energy-ledger: today's samples not read");
      }
    }
    // what the day learnt (L4): the forecast's accuracy, the strategy it ran, its type and prices; when it
    // closes - its review (review.ts: what it could have cost, why, what next time) and the hindsight
    const learnt = (final: boolean) => {
      const ran: StrategyKey = config.strategy?.key ?? "cost";
      const extra: Record<string, unknown> = {
        accuracy: accuracyOf(st!.samples),
        strategy: ran,
        dayType: dayTypeOf(st!.date, st!.notes),
        notes: st!.notes.filter((n) => n.day === st!.date),
        prices: dayPrices(st!.samples),
        // how the day's strategy was chosen by the similar days (selection "analog")
        ...(st!.analog?.date === st!.date ? { analog: { days: st!.analog.days.map((x) => x.day), choice: st!.analog.choice, applied: st!.analog.applied } } : {}),
      };
      if (final) {
        const fieldProc = byId(config.fieldProcessId);
        const fieldCfg = fieldProc?.config ?? {};
        const disabled = new Set<number>(fieldCfg.disabled ?? []);
        const units = (fieldCfg.batteries ?? []).filter((b: any) => !disabled.has(b.nodeId));
        const fs = operatingOf(fieldCfg, config);
        const lim = byId(config.gridProcessId)?.config?.limits ?? {};
        const pc = { ...PLAN_DEFAULTS, ...(config.plan ?? {}) };
        const sp = { ...STRATEGY_DEFAULTS, ...(config.strategy ?? {}) };
        const socEnd = Number(fieldProc?.metrics?.totals?.socPct);
        const review = units.length
          ? reviewDay({
              samples: st!.samples,
              battery: {
                capacityKwh: units.reduce((a: number, b: any) => a + b.capacityKwh, 0),
                maxChargeKw: units.reduce((a: number, b: any) => a + b.maxChargeKw, 0),
                maxDischargeKw: units.reduce((a: number, b: any) => a + b.maxDischargeKw, 0),
                efficiency: pc.efficiency,
              },
              limits: {
                socMinPct: Math.max(fs.socMinPct, fs.reservePct),
                socMaxPct: fs.socMaxPct,
                exportAllowed: fs.exportAllowed,
                gridChargeAllowed: fs.gridChargeAllowed,
                maxImportKw: lim.maxImportKw ?? null,
                maxExportKw: lim.maxExportKw ?? null,
                wearCtKwh: pc.wearCtKwh,
              },
              params: { reserveHighPct: sp.reserveHighPct, peakLimitKw: sp.peakLimitKw ?? null, peakPenaltyCtKwh: sp.peakPenaltyCtKwh, sellThresholdCt: sp.sellThresholdCt },
              ran,
              socEndPct: Number.isFinite(socEnd) ? socEnd : null,
              reserveFloorPct: fs.socMinPct,
              reservePct: Math.max(fs.socMinPct, fs.reservePct),
              minGainEur: config.strategy?.minGainEur ?? 1,
              gridOffAt: noteEffects(st!.notes.filter((n) => n.day === st!.date), timeZone).gridOff,
            })
          : null;
        if (review) {
          extra.review = review;
          extra.hindsight = { best: review.best, eur: review.eur };
        }
      }
      return extra;
    };

    // the operational days' notes: the holidays synced once a day, today's and the next days' read every run
    if (st.calendarSynced !== date && config.calendar?.country) {
      await apiClient
        .request(`/energy-ledger/${process.id}/notes/sync`, {
          method: "POST",
          body: JSON.stringify({ from: date, to: plusDays(date, config.calendar.aheadDays ?? DEFAULT_CALENDAR_AHEAD_DAYS) }),
        })
        .then(() => (st!.calendarSynced = date))
        .catch((err: unknown) => logger.warn({ processId: process.id, err }, "energy-ledger: the holidays weren't synced"));
    }
    try {
      // from the day being recorded (it may still be yesterday's until it closes below)
      const got = await apiClient.request(`/energy-ledger/${process.id}/notes?from=${st.date < date ? st.date : date}&to=${plusDays(date, NOTES_AHEAD_DAYS)}`);
      st.notes = (got.notes ?? []).map(noteOf).filter((n: DayNote) => NOTE_KINDS.includes(n.kind));
      st.notesKey = JSON.stringify(st.notes.map((n) => [n.id, n.day, n.kind, n.startsAt, n.endsAt, n.nodeIds]));
    } catch (err) {
      logger.warn({ processId: process.id, err }, "energy-ledger: the day's notes not read");
    }

    // the day closed - its final record, a new day from zero (not partial: the ledger ran through midnight)
    if (date !== st.date) {
      await save(process.id, st.date, { ...st.day, ...learnt(true), ...(st.accounts ? { accounts: st.accounts } : {}) } as LedgerDay, st.partial, true);
      st.date = date;
      st.day = emptyDay();
      st.partial = false;
      st.lastSave = now;
      st.samples = [];
      st.accounts = null;
    }

    // --- the sources ---------------------------------------------------------
    const field = byId(config.fieldProcessId)?.metrics ?? {};
    const grid = byId(config.gridProcessId)?.metrics ?? {};
    const heatings = (config.heatingProcessIds ?? []).map((id) => byId(id)?.metrics ?? {});
    const ft = field.today ?? {};
    const gt = grid.today ?? {};
    const sumHeat = (k: string) => heatings.reduce((a: number, h: any) => a + (Number(h.today?.[k]) || 0), 0);
    const counters: Counters = {
      loadKwh: Number(ft.loadKwh) || 0,
      pvKwh: Number(ft.pvKwh) || 0,
      windKwh: Number(ft.windKwh) || 0,
      chargeKwh: Number(ft.chargeKwh) || 0,
      dischargeKwh: Number(ft.dischargeKwh) || 0,
      curtailedKwh: Number(ft.curtailedKwh) || 0,
      importKwh: Number(gt.importKwh) || 0,
      exportKwh: Number(gt.exportKwh) || 0,
      costEur: Number(gt.costEur) || 0,
      revenueEur: Number(gt.revenueEur) || 0,
      heatElecKwh: sumHeat("pumpsKwh") + sumHeat("fansKwh"),
      deliveredHeatKwh: sumHeat("deliveredKwh"),
      noStorageKwh: sumHeat("noStorageKwh"),
      heatDirectEur: sumHeat("directEur"),
      heatNoStorageEur: sumHeat("noStorageEur"),
      heatCostEur: sumHeat("costEur"),
    };
    // the increments since the last run; a counter that went down - its source's new day (counted from its zero)
    // a source without its "today" for this date now (the API just restarted - no metrics yet, a source
    // not run yet) keeps its last counters: no increment this run, and no false "new day" on its zeros -
    // else its whole day would be counted again when its figures come back
    const sourceKeys: [boolean, string[]][] = [
      [ft.date === date, ["loadKwh", "pvKwh", "windKwh", "chargeKwh", "dischargeKwh", "curtailedKwh"]],
      [gt.date === date, ["importKwh", "exportKwh", "costEur", "revenueEur"]],
      [heatings.every((h: any) => h.today?.date === date), ["heatElecKwh", "deliveredHeatKwh", "noStorageKwh", "heatDirectEur", "heatNoStorageEur", "heatCostEur"]],
    ];
    // (a stale source with no baseline yet has none - NaN - and its first fresh reading becomes the baseline)
    for (const [fresh, keys] of sourceKeys) if (!fresh) for (const k of keys) counters[k] = st.prev?.[k] ?? NaN;
    if (st.prev) {
      for (const [k, v] of Object.entries(counters)) {
        const prev = st.prev[k];
        if (!Number.isFinite(v) || prev === undefined || !Number.isFinite(prev)) continue;
        (st.day as any)[k] += v >= prev ? v - prev : v;
      }
    }
    st.prev = counters;

    // its own integral - the whole consumption bought at the slot's price; the weather; the maxima
    const loadKw = Number(field.totals?.loadKw) || 0;
    const gridKw = Number(field.totals?.gridKw) || 0;
    const buy = Number(grid.buyCtKwh);
    const d = st.day;
    if (hours > 0) {
      if (Number.isFinite(buy)) d.allBoughtEur += (loadKw * hours * buy) / 100;
      const w = field.weather ?? {};
      if (Number.isFinite(Number(w.radiationWm2))) d.sunKwhM2 += (Number(w.radiationWm2) * hours) / 1000;
      if (Number.isFinite(Number(w.windMs))) {
        const minutes = hours * 60;
        d.windAvgMs = (d.windAvgMs * d.minutes + Number(w.windMs) * minutes) / Math.max(1e-9, d.minutes + minutes);
        d.windMaxMs = Math.max(d.windMaxMs, Number(w.windMs));
      }
      const temp = Number(w.temperatureC);
      if (Number.isFinite(temp)) {
        d.tempMinC = d.tempMinC === null ? temp : Math.min(d.tempMinC, temp);
        d.tempMaxC = d.tempMaxC === null ? temp : Math.max(d.tempMaxC, temp);
      }
      d.minutes += hours * 60;
    }
    d.peakImportKw = Math.max(d.peakImportKw, gridKw);

    // the cost accounts - from the sources' own today (all of them this date's, else the last run's kept)
    if (config.accounts?.length && ft.date === date && heatings.every((h: any) => h.today?.date === date)) {
      const heatingOf = new Map((config.heatingProcessIds ?? []).map((id, i) => [id, heatings[i]]));
      st.accounts = roundAccounts(accountsDay(config.accounts, field.subMeters ?? [], heatingOf, d.allBoughtEur));
    }

    // --- the learning's sample of the slot (L4) ----------------------------------
    const slotNow = st.plan ? st.plan.slots.find((x) => x.t <= now && x.end > now) : undefined;
    if (st.slot && (!slotNow || slotNow.t !== st.slot.t)) {
      const c = st.slot;
      if (c.hours > 0) {
        const local = localOf(c.t);
        const sample: Sample = {
          t: c.t,
          hours: r(c.hours, 4),
          pvF: r(c.pvF, 2),
          pvA: r(c.pv / c.hours, 2),
          windF: r(c.windF, 2),
          windA: r(c.wind / c.hours, 2),
          loadF: r(c.loadF, 2),
          loadA: r(c.load / c.hours, 2),
          batA: r(c.bat / c.hours, 2),
          buy: c.buy,
          sell: c.sell,
          socStart: c.socStart,
          ...local,
        };
        if (localDate(c.t, timeZone) === st.date) st.samples.push(sample);
        await apiClient
          .request(`/energy-ledger/${process.id}/samples`, { method: "PUT", body: JSON.stringify(sample) })
          .catch((err: unknown) => logger.warn({ processId: process.id, err }, "energy-ledger: the sample wasn't saved"));
      }
      st.slot = null;
    }
    const socField = Number(field.totals?.socPct);
    if (slotNow && !st.slot && Number.isFinite(socField))
      st.slot = {
        t: slotNow.t,
        end: slotNow.end,
        pvF: slotNow.pvKw ?? 0,
        windF: slotNow.windKw ?? 0,
        loadF: slotNow.loadKw,
        buy: slotNow.buyCtKwh,
        sell: slotNow.sellCtKwh,
        socStart: socField,
        pv: 0,
        wind: 0,
        load: 0,
        bat: 0,
        hours: 0,
      };
    if (st.slot && hours > 0) {
      st.slot.pv += (Number(field.totals?.pvKw) || 0) * hours;
      st.slot.wind += (Number(field.totals?.windKw) || 0) * hours;
      st.slot.load += loadKw * hours;
      st.slot.bat += (Number(field.totals?.batteryKw) || 0) * hours;
      st.slot.hours += hours;
    }

    const saveMs = (config.saveMinutes ?? DEFAULT_SAVE_MIN) * 60_000;
    if (now - st.lastSave >= saveMs) {
      st.lastSave = now;
      await save(process.id, st.date, { ...d, ...learnt(false), ...(st.accounts ? { accounts: st.accounts } : {}) } as LedgerDay, st.partial, false);
    }

    // --- the plan (L2) -----------------------------------------------------------
    const planCfg = { ...PLAN_DEFAULTS, ...(config.plan ?? {}) };
    const fieldProc = byId(config.fieldProcessId);
    if (planCfg.enabled && fieldProc && config.gridProcessId) {
      try {
        await replanIfDue(process.id, st, config, planCfg, fieldProc, byId(config.gridProcessId), now, timeZone, byId);
      } catch (err) {
        logger.warn({ processId: process.id, err }, "energy-ledger: no plan");
      }
    }
    const plan = st.plan;
    const idx = plan ? plan.slots.findIndex((x) => x.t <= now && x.end > now) : -1;
    const sum = (k: "costEur" | "baselineEur") => (plan ? plan.planned.reduce((a, x) => a + x[k], 0) : 0);

    // --- metrics -------------------------------------------------------------
    const batteryKwh = (byId(config.fieldProcessId)?.config?.batteries ?? []).reduce((a: number, b: any) => a + (Number(b.capacityKwh) || 0), 0);
    const day = roundDay(addDays([d]));
    const k = kpis(day, batteryKwh);
    await apiClient.setMetrics(process.id, {
      date: st.date,
      partial: st.partial,
      day,
      counters,
      bridge: bridge(day).map((s) => ({ ...s, eur: r(s.eur, 2), kwh: r(s.kwh, 1) })),
      // who today's energy is for: the accounts, private / business / tenants, the rest
      accounts: st.accounts,
      // today's type (its notes first) and today's notes - the plan and the AI weigh them
      dayType: dayTypeOf(date, st.notes),
      notes: st.notes.filter((n) => n.day === date),
      // the similar days (selection "analog"): today's forecast features, the days, what they said
      analogs: st.analog?.date === date ? st.analog : null,
      // the day's description in words without the AI (the AI's day-plan, when it ran, is shown over it)
      summary: plan
        ? autoSummary({
            strategyName: STRATEGIES.find((x) => x.key === plan.strategy)?.name ?? plan.strategy,
            why: config.strategy?.selection === "analog" && st.analog?.date === date ? st.analog.choice.reason : null,
            notes: st.notes.filter((n) => n.day === date),
            steps: planSteps(plan.planned, plan.slots).filter((x) => x.to > now),
            savingEur: r(sum("baselineEur") - sum("costEur"), 2),
            timeZone,
          })
        : null,
      kpis: Object.fromEntries(Object.entries(k).map(([key, v]) => [key, v === null || typeof v === "boolean" ? v : r(v, 2)])),
      // the plan's slot now - the energy field's Auto follows it
      planNow:
        plan && idx >= 0
          ? {
              t: plan.slots[idx].t,
              until: plan.slots[idx].end,
              batteryKw: r(plan.planned[idx].batteryKw, 2),
              socPct: plan.planned[idx].socPct,
              // the floor the field keeps following it: the reserve; in an outage - the hard minimum
              floorPct: plan.slots[idx].gridOff ? plan.hardMinPct : plan.floorPct,
              // what the plan expects now - the field's critical states compare with it
              loadKw: r(plan.slots[idx].loadKw, 1),
              gridKw: r(plan.planned[idx].gridKw, 1),
            }
          : null,
      // what the ledger learnt (L4): today's forecast accuracy so far, the corrections the plan uses
      learning: { accuracy: accuracyOf(st.samples), samplesToday: st.samples.length, corrections: st.sources?.corrections ?? null },
      // the heating's signal now (SG-Ready 1 hold off / 2 normal / 3 run more) - heating-control follows it
      heatingNow: plan && idx >= 0 ? { t: plan.slots[idx].t, until: plan.slots[idx].end, signal: plan.signals[idx] } : null,
      plan: plan
        ? {
            strategy: plan.strategy,
            selection: config.strategy?.selection ?? "fixed",
            madeAt: plan.madeAt,
            reason: plan.reason,
            until: plan.slots[plan.slots.length - 1].end,
            costEur: r(sum("costEur"), 2),
            baselineEur: r(sum("baselineEur"), 2),
            savingEur: r(sum("baselineEur") - sum("costEur"), 2),
            next: planSteps(plan.planned, plan.slots)
              .slice(0, 6)
              .map((x) => ({ ...x, avgKw: r(x.avgKw, 1), avgBuyCtKwh: r(x.avgBuyCtKwh, 1), savingEur: r(x.savingEur, 2) })),
          }
        : null,
    });
  });
}
