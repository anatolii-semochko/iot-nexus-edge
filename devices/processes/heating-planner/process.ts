/**
 * "heating-planner" process kind (CORE Library package devices/processes/heating-planner/, iot
 * AGENTS_TO_DO.md 2026-10-29, P1) - plans the heating systems' heat pumps ahead, for all of them
 * together: the Energy Ledger's plan gives the slots (15 minutes), the prices, the sun's surplus (its
 * planned export) and its heating signal; each heating-control system gives its rooms, heat pumps,
 * tanks and mode; its weather - the outdoor temperature ahead. model.ts makes each system's plan (the
 * cheapest over the horizon); the systems one after another, each taking what the sun's surplus the
 * earlier ones left. The plan - PUT /heating-planner/:id/plan; each heating-control executes its slot
 * now (GET .../now); the Ledger takes the heating's electricity per slot into its own plan.
 *
 * Made again every `replanMinutes` (15), on a new Ledger plan and when the config changes; without a
 * Ledger plan - nothing planned (the heating keeps its own band control).
 *
 * The strategies (P3, strategies.ts): every one planned and valued in the real money for each system;
 * the plan follows `strategy.key` (selection "fixed") or the least electricity's (selection
 * "cheapest"). Commands (POST /processes/:id/commands - processes.control): `setStrategy` { key },
 * `setSelection` { selection } - each patches the config (kept) and is planned at once.
 */
import type { Mode } from "../heating-control/model.ts";
import { WATER_KWH_PER_L_K, type PlannerRoom, type PlannerSlot } from "./model.ts";
import { HEAT_STRATEGIES, planAll, type HeatStrategyKey, type HeatStrategyResult } from "./strategies.ts";

const DEFAULT_INTERVAL_S = 60;
const DEFAULT_REPLAN_MIN = 15;
const WEATHER_TTL_MS = 10 * 60_000;
const DEFAULTS = {
  comfortK: 0.5,
  comfortModulation: 0.6,
  startPenaltyEur: 0.2,
  unitHourEur: 0.01,
  holdOffCtKwh: 10,
  boostCtKwh: 5,
  comfortCtKwhH: 1,
  store: { heating: { minC: 35, maxC: 55 }, cooling: { minC: 7, maxC: 16 } },
  setpointC: { heating: 21, cooling: 24 },
};

interface PlannerConfig {
  timeZone?: string;
  ledgerProcessId?: number;
  heatingProcessIds?: number[];
  intervalSeconds?: number;
  replanMinutes?: number;
  comfortK?: number;
  comfortModulation?: number;
  startPenaltyEur?: number;
  unitHourEur?: number;
  holdOffCtKwh?: number;
  boostCtKwh?: number;
  comfortCtKwhH?: number;
  store?: { heating?: { minC: number; maxC: number }; cooling?: { minC: number; maxC: number } };
  strategy?: { key?: HeatStrategyKey; selection?: "fixed" | "cheapest" };
}

const r = (x: number, d = 2) => Math.round(x * 10 ** d) / 10 ** d;
const roundResult = (x: HeatStrategyResult) => ({
  ...x,
  energyEur: r(x.energyEur, 2),
  baselineEur: r(x.baselineEur, 2),
  savingEur: r(x.savingEur, 2),
  unitHours: r(x.unitHours, 1),
  comfortKh: r(x.comfortKh, 1),
  maxOffsetK: r(x.maxOffsetK, 2),
  sunKwh: r(x.sunKwh, 1),
});

const valueAt = (rows: Record<string, number | null>[], at: number, key: string): number | null => {
  const after = rows.findIndex((x) => (x.t as number) > at);
  if (after <= 0) return null;
  const a = rows[after - 1];
  const b = rows[after];
  const x = a[key];
  const y = b[key];
  if (x === null || x === undefined || y === null || y === undefined) return x ?? y ?? null;
  return x + ((y - x) * (at - (a.t as number))) / ((b.t as number) - (a.t as number));
};

const localParts = (ms: number, timeZone: string) => {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short", hourCycle: "h23" }).formatToParts(new Date(ms));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    minute: Number(get("hour")) * 60 + Number(get("minute")),
    weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday")),
  };
};

// a day note (the core's day_notes - GET /processes/:id/day-notes)
interface DayNote {
  day: string;
  kind: string;
  nodeIds: number[];
  startsAt: number | null;
  endsAt: number | null;
}
const NOTE_DAYS = 3; // today and the next two - the horizon
const DEFAULT_CLOSED_SETBACK_K = 4;

/** A note covers a moment: its window when it has one, else its whole day. */
const covers = (n: DayNote, at: number, date: string) =>
  n.startsAt !== null || n.endsAt !== null ? (n.startsAt ?? -Infinity) <= at && at < (n.endsAt ?? Infinity) : n.day === date;

const STRATEGY_NAMES: Record<string, string> = { cost: "Least cost", gentle: "Gentle", comfort: "Comfort", sun: "The sun" };

/** The plan in one sentence - without the AI (its day plan's Summary takes over when there is one). */
function autoSummary(key: string, horizonH: number, totals: { savingEur: number; baselineEur: number; starts: number; maxOffsetK: number; sunKwh: number } | null): string | null {
  if (!totals) return null;
  const pct = totals.baselineEur > 0 ? Math.round((totals.savingEur / totals.baselineEur) * 100) : null;
  const parts = [
    `${STRATEGY_NAMES[key] ?? key}: the next ${Math.round(horizonH)} h save ${totals.savingEur.toFixed(2)} EUR${pct !== null ? ` (${pct} %)` : ""} against the band control`,
    `${totals.starts} heat pump start${totals.starts === 1 ? "" : "s"}`,
    totals.maxOffsetK > 0.05 ? `the rooms up to ${totals.maxOffsetK.toFixed(1)} K off their setpoint in the dear hours` : "the rooms at their setpoint",
  ];
  if (totals.sunKwh > 0.5) parts.push(`${Math.round(totals.sunKwh)} kWh of the sun's surplus used`);
  return `${parts.join("; ")}.`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- a Library package is loaded at run time by the orchestrator and imports nothing from it
export default function registerHeatingPlanner(register: any, { apiClient, logger }: any): void {
  const systemTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const states = new Map<
    number,
    {
      lastRun: number;
      madeAt: number;
      ledgerMadeAt: number | null;
      configKey: string;
      weather: Map<number, { at: number; hourly: Record<string, number | null>[] }>;
      // the latest plan's systems (read back after a restart)
      lastPlan: any[] | null;
      // the followed strategy's sums over the systems (the summary)
      lastPlanStrategy: string | null;
      lastPlanTotals: { savingEur: number; baselineEur: number; starts: number; maxOffsetK: number; sunKwh: number } | null;
    }
  >();

  async function applyCommands(process: any, config: PlannerConfig): Promise<PlannerConfig> {
    let next = config;
    for (const cmd of process.commands ?? []) {
      const p = cmd.params ?? {};
      let patch: Partial<PlannerConfig> | null = null;
      if (cmd.action === "setStrategy" && HEAT_STRATEGIES.some((x) => x.key === p.key)) patch = { strategy: { ...(next.strategy ?? {}), key: p.key } };
      else if (cmd.action === "setSelection" && ["fixed", "cheapest"].includes(p.selection)) patch = { strategy: { ...(next.strategy ?? {}), selection: p.selection } };
      if (patch) {
        await apiClient.request(`/processes/${process.id}/config`, { method: "PATCH", body: JSON.stringify(patch) });
        next = { ...next, ...patch };
      }
      await apiClient.completeCommand(process.id, cmd.id, patch ? { ok: true } : { ok: false, error: `unknown command or bad params: ${cmd.action}` });
    }
    return next;
  }

  register("heating-planner", async (process: any) => {
    const now = Date.now();
    let config: PlannerConfig = process.config ?? {};
    const commanded = (process.commands ?? []).length > 0;
    if (commanded) config = await applyCommands(process, config);
    const intervalMs = (config.intervalSeconds ?? DEFAULT_INTERVAL_S) * 1000;
    let st = states.get(process.id);
    if (st && now - st.lastRun < intervalMs && !commanded) return;
    if (!st) {
      st = { lastRun: 0, madeAt: 0, ledgerMadeAt: null, configKey: "", weather: new Map(), lastPlan: null, lastPlanStrategy: null, lastPlanTotals: null };
      try {
        const saved = (await apiClient.request(`/heating-planner/${process.id}/plan`)).plan;
        // shown until the first round's own plan (made at once - the code may have changed)
        if (saved)
          Object.assign(st, {
            madeAt: saved.madeAt ?? 0,
            ledgerMadeAt: saved.ledgerMadeAt ?? null,
            lastPlan: saved.systems ?? null,
            lastPlanStrategy: saved.followed ?? null,
            lastPlanTotals: (saved.strategies ?? []).find((x: any) => x.key === saved.followed) ?? null,
          });
      } catch {
        // none yet - planned on the first due round
      }
      states.set(process.id, st);
    }
    st.lastRun = now;
    const timeZone = config.timeZone || systemTimeZone;

    // --- the Ledger's plan: the slots, the prices, the planned export, the signal --------------
    const warnings: { code: string; level: number; text: string }[] = [];
    let ledgerPlan: any = null;
    if (config.ledgerProcessId) {
      try {
        ledgerPlan = (await apiClient.request(`/energy-ledger/${config.ledgerProcessId}/plan`)).plan;
      } catch (err) {
        logger.warn({ processId: process.id, err }, "heating-planner: no Ledger plan");
      }
    }
    const ledgerSlots: any[] = (ledgerPlan?.slots ?? []).filter((s: any) => s.end > now);
    if (!config.ledgerProcessId) warnings.push({ code: "no_ledger", level: 1, text: "No Energy Ledger linked - nothing to plan on (the heatings keep their own band control)" });
    else if (!ledgerSlots.length) warnings.push({ code: "no_ledger_plan", level: 1, text: "The Energy Ledger has no plan ahead - nothing planned (the heatings keep their own band control)" });

    const configKey = JSON.stringify(config);
    const due =
      ledgerSlots.length > 0 &&
      (now - st.madeAt >= (config.replanMinutes ?? DEFAULT_REPLAN_MIN) * 60_000 || ledgerPlan.madeAt !== st.ledgerMadeAt || configKey !== st.configKey);

    if (due) {
      const all = await apiClient.listProcesses();
      const heatings = (config.heatingProcessIds ?? []).map((id) => all.find((p: any) => p.id === id && p.kind === "heating-control")).filter(Boolean);
      // the sun's surplus each slot: what the Ledger plans to export, plus the heating it counted in
      // a slot it exports in (that electricity is the sun's too) - shared by the systems in turn
      const cheap = ledgerSlots.map((s) => (s.gridKw <= 0 ? Math.max(0, -s.gridKw) + (Number(s.heatKw) || 0) : 0));
      const systems: any[] = [];
      const strategyChosen: HeatStrategyKey = HEAT_STRATEGIES.some((x) => x.key === config.strategy?.key) ? config.strategy!.key! : "cost";
      const selection = config.strategy?.selection === "cheapest" ? "cheapest" : "fixed";
      // every strategy's sums over the systems - the page's comparison
      const totals = new Map<HeatStrategyKey, HeatStrategyResult>();
      // the day notes ahead - each heating's own (closed rooms) and the Ledger's (holidays, days off, working weekends)
      const today = localParts(now, timeZone).date;
      const last = new Date(Date.parse(`${today}T12:00:00Z`) + (NOTE_DAYS - 1) * 86_400_000).toISOString().slice(0, 10);
      const notesOf = async (id: number): Promise<DayNote[]> =>
        apiClient
          .request(`/processes/${id}/day-notes?from=${today}&to=${last}`)
          .then((x: any) => (x.notes ?? []) as DayNote[])
          .catch(() => [] as DayNote[]);
      const ledgerNotes = config.ledgerProcessId ? await notesOf(config.ledgerProcessId) : [];
      for (const h of heatings) {
        const hc = h.config ?? {};
        const hm = h.metrics ?? {};
        const mode: Mode | null = hm.mode === "heating" || hm.mode === "cooling" ? hm.mode : null;
        if (!mode || hc.control?.mode === "off") {
          systems.push({ processId: h.id, name: h.name, mode: null, note: "off - nothing to plan", slots: [] });
          continue;
        }
        // the weather ahead - the system's own weather process
        let hourly: Record<string, number | null>[] = [];
        if (hc.weatherProcessId) {
          const cached = st.weather.get(hc.weatherProcessId);
          if (cached && now - cached.at < WEATHER_TTL_MS) hourly = cached.hourly;
          else {
            try {
              hourly = (await apiClient.request(`/weather-control/${hc.weatherProcessId}/forecast`)).hourly ?? [];
              st.weather.set(hc.weatherProcessId, { at: now, hourly });
            } catch (err) {
              logger.warn({ processId: process.id, heating: h.id, err }, "heating-planner: no forecast");
              hourly = cached?.hourly ?? [];
            }
          }
        }
        const zone = hc.timeZone || timeZone;
        const nowOutdoor = hm.outdoor?.temperatureC ?? 10;
        // the rooms planned (their nodes - for the closed-room notes)
        const disabled = new Set<number>(hc.disabled ?? []);
        const coils = (hc.consumers ?? []).filter((c: any) => !disabled.has(c.nodeId) && c.room);
        const heatingNotes = (await notesOf(h.id)).filter((n) => n.kind === "room-closed");
        const setbackK = Number(hc.control?.closedSetbackK ?? DEFAULT_CLOSED_SETBACK_K);
        const slots: PlannerSlot[] = ledgerSlots.map((s, i) => {
          const mid = (Math.max(s.t, now) + s.end) / 2;
          const local = localParts(mid, zone);
          // a holiday / a day off - a Sunday's gains; a working weekend - a working day's
          const dayOff = ledgerNotes.some((n) => n.day === local.date && (n.kind === "holiday" || n.kind === "day-off"));
          const workday = ledgerNotes.some((n) => n.day === local.date && n.kind === "workday");
          const weekday = dayOff ? 0 : workday && (local.weekday === 0 || local.weekday === 6) ? 3 : local.weekday;
          const closed = heatingNotes.filter((n) => covers(n, mid, local.date));
          const closedAll = closed.some((n) => !n.nodeIds.length);
          const closedIds = new Set(closed.flatMap((n) => n.nodeIds));
          const roomSetback = closed.length ? coils.map((c: any) => (closedAll || closedIds.has(c.nodeId) ? setbackK : 0)) : undefined;
          return {
            t: s.t,
            end: s.end,
            hours: (s.end - Math.max(s.t, now)) / 3_600_000,
            buyCtKwh: Number(s.buyCtKwh) || 0,
            sellCtKwh: Number(s.sellCtKwh) || 0,
            cheapKw: cheap[i],
            signal: [1, 2, 3].includes(s.heatingSignal) ? s.heatingSignal : 2,
            outdoorC: valueAt(hourly, mid, "temperatureC") ?? nowOutdoor,
            minute: local.minute,
            weekday,
            ...(roomSetback ? { setbackK: roomSetback } : {}),
          };
        });
        // the available heat pumps (not switched off, not in maintenance)
        const out = new Set<number>((hm.pumps ?? []).filter((p: any) => p.maintenance).map((p: any) => p.nodeId));
        const pumps = (hc.heatPumps ?? []).filter((p: any) => !disabled.has(p.nodeId) && !out.has(p.nodeId));
        const base = { ...DEFAULTS.setpointC, ...(hc.control?.setpointC ?? {}) };
        const rooms: PlannerRoom[] = coils.map((c: any) => ({ spec: c.room, setpointC: c.setpointC?.[mode] ?? base[mode] }));
        const tanks = (hc.tanks ?? []) as { nodeId: number; volumeL: number }[];
        const avgByNode = new Map<number, number>((hm.tanks ?? []).filter((x: any) => x.avgC != null).map((x: any) => [x.nodeId, x.avgC]));
        const live = tanks.filter((t) => avgByNode.has(t.nodeId));
        const tankPerK = live.reduce((a, t) => a + t.volumeL * WATER_KWH_PER_L_K, 0);
        const tankAvgC = tankPerK > 0 ? live.reduce((a, t) => a + avgByNode.get(t.nodeId)! * t.volumeL * WATER_KWH_PER_L_K, 0) / tankPerK : DEFAULTS.store[mode].minC;
        const store = { ...DEFAULTS.store[mode], ...(config.store?.[mode] ?? {}) };
        const { key: strategyKey, plan, results } = planAll(
          strategyChosen,
          {
            mode,
            pumps,
            rooms,
            tankPerK,
            tankAvgC,
            store,
            comfortK: config.comfortK ?? DEFAULTS.comfortK,
            comfortModulation: config.comfortModulation ?? DEFAULTS.comfortModulation,
            startPenaltyEur: config.startPenaltyEur ?? DEFAULTS.startPenaltyEur,
            unitHourEur: config.unitHourEur ?? DEFAULTS.unitHourEur,
            holdOffCtKwh: config.holdOffCtKwh ?? DEFAULTS.holdOffCtKwh,
            boostCtKwh: config.boostCtKwh ?? DEFAULTS.boostCtKwh,
            comfortCtKwhH: config.comfortCtKwhH ?? DEFAULTS.comfortCtKwhH,
          },
          slots,
          selection === "cheapest",
        );
        plan.slots.forEach((p, i) => (cheap[i] = Math.max(0, cheap[i] - p.electricKw)));
        for (const x of results) {
          const sum = totals.get(x.key) ?? { ...x, energyEur: 0, baselineEur: 0, savingEur: 0, starts: 0, unitHours: 0, comfortKh: 0, maxOffsetK: 0, sunKwh: 0 };
          for (const k of ["energyEur", "baselineEur", "savingEur", "starts", "unitHours", "comfortKh", "sunKwh"] as const) sum[k] += x[k];
          sum.maxOffsetK = Math.max(sum.maxOffsetK, x.maxOffsetK);
          totals.set(x.key, sum);
        }
        systems.push({
          processId: h.id,
          name: h.name,
          mode,
          units: pumps.length,
          storeKwh: r(plan.storeKwh, 1),
          marginKwh: r(plan.marginKwh, 1),
          costEur: r(plan.costEur, 3),
          energyEur: r(plan.energyEur, 3),
          baselineEur: r(plan.baselineEur, 3),
          savingEur: r(plan.savingEur, 3),
          strategy: strategyKey,
          strategies: results.map(roundResult),
          slots: plan.slots.map((p, i) => ({
            t: p.t,
            end: slots[i].end,
            needKw: r(p.needKw),
            heatKw: r(p.heatKw),
            units: p.units,
            modulation: r(p.modulation),
            electricKw: r(p.electricKw),
            storeKwh: r(p.storeKwh, 1),
            tankC: r(p.tankC, 1),
            roomOffsetK: r(p.roomOffsetK),
            outdoorC: r(slots[i].outdoorC, 1),
            buyCtKwh: slots[i].buyCtKwh,
            // the page's chart: the sale price, the Ledger's signal, the sun's surplus this system could take
            sellCtKwh: slots[i].sellCtKwh,
            signal: slots[i].signal,
            cheapKw: r(slots[i].cheapKw),
            costEur: r(p.costEur, 4),
            energyEur: r(p.energyEur, 4),
            baselineEur: r(p.baselineEur, 4),
          })),
        });
      }
      // the strategy followed - the systems' own (the same unless "cheapest" picked each its own)
      const followed: HeatStrategyKey = (systems.find((x) => x.strategy)?.strategy as HeatStrategyKey) ?? strategyChosen;
      // the heating's electricity per slot - for the Ledger's own plan
      const electricity = ledgerSlots.map((s, i) => ({ t: s.t, kw: r(systems.reduce((a, x) => a + (x.slots[i]?.electricKw ?? 0), 0)) }));
      try {
        await apiClient.request(`/heating-planner/${process.id}/plan`, {
          method: "PUT",
          body: JSON.stringify({
            madeAt: now,
            ledgerMadeAt: ledgerPlan.madeAt,
            strategy: { key: strategyChosen, selection },
            // the strategy followed (the chosen one, or the cheapest's)
            followed,
            strategies: HEAT_STRATEGIES.map((x) => totals.get(x.key)).filter(Boolean).map((x) => roundResult(x!)),
            systems,
            electricity,
          }),
        });
        st.madeAt = now;
        st.ledgerMadeAt = ledgerPlan.madeAt;
        st.configKey = configKey;
        logger.info({ processId: process.id, systems: systems.length, slots: ledgerSlots.length }, "heating-planner: plan made");
      } catch (err) {
        logger.warn({ processId: process.id, err }, "heating-planner: the plan wasn't saved");
      }
      st.lastPlan = systems;
      st.lastPlanStrategy = followed;
      st.lastPlanTotals = totals.get(followed) ?? null;
    }

    await apiClient.syncMessages(process.id, "warning", warnings);
    await apiClient.setWarning(process.id, warnings.length > 0);

    // --- metrics: each system's slot now and its sums ---------------------------------------
    const systems = st.lastPlan ?? [];
    const nowOf = (x: any) => (x.slots ?? []).find((s: any) => s.t <= now && now < s.end) ?? null;
    await apiClient.setMetrics(process.id, {
      madeAt: st.madeAt || null,
      ledgerMadeAt: st.ledgerMadeAt,
      // the plan in a sentence (no AI) - the page shows the AI's day plan Summary over it
      date: localParts(now, timeZone).date,
      summary: autoSummary(
        st.lastPlanStrategy ?? "cost",
        ledgerSlots.length ? (ledgerSlots[ledgerSlots.length - 1].end - now) / 3_600_000 : 0,
        st.lastPlanTotals,
      ),
      strategy: { key: HEAT_STRATEGIES.some((x) => x.key === config.strategy?.key) ? config.strategy!.key : "cost", selection: config.strategy?.selection === "cheapest" ? "cheapest" : "fixed" },
      horizonH: ledgerSlots.length ? r((ledgerSlots[ledgerSlots.length - 1].end - now) / 3_600_000, 1) : 0,
      systems: systems.map((x: any) => {
        const s = nowOf(x);
        return {
          processId: x.processId,
          name: x.name,
          mode: x.mode,
          note: x.note ?? null,
          now: s ? { heatKw: s.heatKw, units: s.units, electricKw: s.electricKw, roomOffsetK: s.roomOffsetK, tankC: s.tankC } : null,
          energyEur: x.energyEur ?? null,
          baselineEur: x.baselineEur ?? null,
          savingEur: x.savingEur ?? null,
        };
      }),
      totals: {
        energyEur: r(systems.reduce((a: number, x: any) => a + (x.energyEur ?? 0), 0), 2),
        baselineEur: r(systems.reduce((a: number, x: any) => a + (x.baselineEur ?? 0), 0), 2),
        savingEur: r(systems.reduce((a: number, x: any) => a + (x.savingEur ?? 0), 0), 2),
        electricKw: r(systems.reduce((a: number, x: any) => a + (nowOf(x)?.electricKw ?? 0), 0)),
      },
    });
  });
}
