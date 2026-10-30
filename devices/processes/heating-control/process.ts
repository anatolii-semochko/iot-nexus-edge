/**
 * "heating-control" process kind - a site's heating / cooling on water (CORE
 * Library package devices/processes/heating-control/; uses weather-control
 * and, for the money, energy-grid): air / water heat pumps (node type
 * `heat-pump`) charge buffer tanks (`buffer-tank`), the rooms' fan coils
 * (`fan-coil`) draw from them. Three blocks, each with optional groups.
 *
 * Every `simulation.intervalSeconds` (default 30):
 *  1. the mode - auto by the outdoor temperature (heating below
 *     `heatBelowC`, cooling above `coolAboveC`, as it was between - the
 *     hysteresis) or set by hand (heating / cooling / off);
 *  2. the items' readings - each device by its role from the item's config
 *     (`devices.flowTemp`, ... - by id, never by name);
 *  3. the tanks - by the heating planner's slot now (`plannerProcessId`: the
 *     units, their power, the rooms' offset; while its plan is fresh and the
 *     tanks within their safe range), else by the band: the heat pumps charge them while their average temperature
 *     is out of the band (`tank.heating` / `tank.cooling` - start / stop),
 *     staged - as few units as the need takes, all running ones at one
 *     modulation; the running ones keep running (`pumpOrder`: the least run
 *     hours or the user's priority pick the next one);
 *  4. the rooms: each fan coil's thermostat drives its fan from the room's
 *     temperature and the setpoint; it draws from the tanks;
 *  5. a simulated item gets its readings from the models (model.ts): the
 *     heat pumps' COP from the weather, the tanks' energy balance, the
 *     rooms' heat balance (the outside, the people, the fan coil);
 *  6. the switches (relay, AUTO): a heat pump's operation follows its stage
 *     (runs / stands), switched one by one `pumpStaggerS` apart - between the
 *     ticks, every second the orchestrator calls (stops first, then starts);
 *     a fan coil's valve follows the config (`disabled`, the mode off);
 *  7. today's account (heat, cold, electricity, money - the actual cost and
 *     the two baselines: direct electric heating, heat pumps without tanks);
 *  8. WEM, metrics (the panel, the AI, the Energy Field's load), series `heat.*`.
 * Commands (POST /processes/:id/commands - processes.control): `setMode`,
 * `setSetpoint`, `setEnabled` - each one patches the config (kept) and is
 * applied at once.
 */
import {
  autoMode,
  fanCoilRun,
  fanControl,
  gainsAt,
  heatPumpRun,
  maxOutputKw,
  stagePumps,
  stageUnits,
  performance,
  pumpOrder,
  roomStep,
  tankStep,
  tankStored,
  WATER_KW_PER_LPM_K,
  type FanCoilSpec,
  type HeatPumpSpec,
  type Mode,
  type RoomSpec,
  type TankSpec,
} from "./model.ts";

const DEFAULT_INTERVAL_S = 30;
const WEATHER_TTL_MS = 10 * 60_000;
const PRICES_TTL_MS = 10 * 60_000;
const DAY_AHEAD_MS = 24 * 3_600_000;
const COIL_FLOW_LPM = 6; // a fan coil's water flow - for the consumers' return temperature

interface Item {
  nodeId: number;
  name: string;
  group?: string;
  model?: string;
}
interface PumpItem extends Item, HeatPumpSpec {
  priority?: number; // the start order when `control.pumpOrder` is "priority" (1 first)
  devices?: { flowTemp?: number; returnTemp?: number; outdoorTemp?: number; flowRate?: number; heatPower?: number; heatEnergy?: number; power?: number; energy?: number; fanSpeed?: number; relay?: number };
}
interface TankItem extends Item, TankSpec {
  devices?: { topTemp?: number; middleTemp?: number; bottomTemp?: number };
}
interface CoilItem extends Item, FanCoilSpec {
  room: RoomSpec;
  setpointC?: { heating?: number; cooling?: number };
  devices?: { temperature?: number; humidity?: number; valve?: number; power?: number; fanSpeed?: number };
}
interface Control {
  mode: "auto" | Mode | "off";
  heatBelowC: number;
  coolAboveC: number;
  setpointC: { heating: number; cooling: number };
  tank: { heating: { startC: number; stopC: number }; cooling: { startC: number; stopC: number } };
  tankRoomC: number;
  // a closed room's fan coil set back by this much (heating - lower, cooling - higher; a day note room-closed)
  closedSetbackK: number;
  // the heat pumps started / stopped one by one, this many seconds apart (the inrush currents)
  pumpStaggerS: number;
  // which unit starts first: "auto" - the least run hours, "priority" - each unit's `priority`
  pumpOrder: "auto" | "priority";
}
interface HeatingConfig {
  timeZone?: string;
  weatherProcessId?: number;
  gridProcessId?: number;
  groups?: { key: string; name: string; block: "pumps" | "tanks" | "consumers" }[];
  heatPumps?: PumpItem[];
  tanks?: TankItem[];
  consumers?: CoilItem[];
  control?: Partial<Control>;
  disabled?: number[];
  simulation?: { intervalSeconds?: number };
  // the energy-ledger whose heating signal (SG-Ready) the tanks follow: 3 - store more heat now (cheap /
  // sunny), 1 - hold off (dear - the tanks carry it), 2 - normal; none / no fresh signal - normal
  ledgerProcessId?: number;
  // the heating planner whose plan the heat pumps and the rooms follow (2026-10-29): its slot now -
  // the units, their power, the rooms' offset; none / no fresh plan / the tanks out of their safe
  // range - the band above
  plannerProcessId?: number;
}

// a plan older than this - not followed (the planner stopped)
const PLAN_MAX_AGE_MS = 2 * 3_600_000;
// the tanks' safe range while following a plan: heating - over the coldest tank's tMinC by this much
// (else the band charges them), under the hottest allowed by this much (else no more heat)
const PLAN_SAFE_LOW_K = 5;
const PLAN_SAFE_HIGH_K = 2;

// a day note (the core's day_notes - GET /processes/:id/day-notes)
interface DayNote {
  day: string;
  kind: string;
  text: string;
  startsAt: number | null;
  endsAt: number | null;
  nodeIds: number[];
}
const NOTES_TTL_MS = 2 * 60_000;

const DEFAULT_CONTROL: Control = {
  mode: "auto",
  heatBelowC: 15,
  coolAboveC: 24,
  setpointC: { heating: 21, cooling: 24 },
  tank: { heating: { startC: 42, stopC: 50 }, cooling: { startC: 14, stopC: 9 } },
  tankRoomC: 15,
  closedSetbackK: 4,
  pumpStaggerS: 2,
  pumpOrder: "auto",
};

type Today = {
  date: string;
  heatKwh: number; // the heat pumps' heat (heating)
  coolKwh: number; // the cold they made (cooling)
  deliveredKwh: number; // what the fan coils gave the rooms (heat or cold)
  pumpsKwh: number; // the heat pumps' electricity
  fansKwh: number; // the fan coils' electricity
  noStorageKwh: number; // baseline: the electricity heat pumps without tanks would take (the heat when needed, at that moment's COP)
  costEur: number | null; // the electricity at the slots' purchase prices
  directEur: number | null; // baseline: the delivered heat by direct electric heating
  noStorageEur: number | null; // baseline: heat pumps without tanks - the heat made when it's needed
};
const emptyToday = (date: string): Today => ({ date, heatKwh: 0, coolKwh: 0, deliveredKwh: 0, pumpsKwh: 0, fansKwh: 0, noStorageKwh: 0, costEur: null, directEur: null, noStorageEur: null });

/**
 * The tanks' band under the Energy Ledger's signal: 3 - charge earlier and
 * hotter (colder when cooling), within the tanks' limit; 1 - start later;
 * 2 - as set.
 */
function signalBand(band: { startC: number; stopC: number }, mode: Mode, signal: 1 | 2 | 3, tMaxC: number) {
  const dir = mode === "heating" ? 1 : -1;
  if (signal === 3) {
    const stop = mode === "heating" ? Math.min(band.stopC + 8, tMaxC - 5) : Math.max(band.stopC - 3, 5);
    return { startC: band.startC + 5 * dir, stopC: stop };
  }
  if (signal === 1) return { startC: band.startC - (mode === "heating" ? 6 : -4), stopC: band.stopC };
  return band;
}

const r = (x: number, d = 2) => Math.round(x * 10 ** d) / 10 ** d;
const add = (a: number | null, b: number) => (a ?? 0) + b;

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- a Library package is loaded at run time by the orchestrator and imports nothing from it
export default function registerHeatingControl(register: any, { apiClient, logger }: any): void {
  const systemTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const states = new Map<
    number,
    {
      lastRun: number;
      mode: Mode | null;
      charging: boolean;
      weather: { at: number; hourly: Record<string, number | null>[] } | null;
      prices: { at: number; slots: { t: number; minutes: number; buyCtKwh: number | null }[] } | null;
      today: Today;
      // the series declared for these units (their ids) - declared again when the plant changes
      declared: string | null;
      // the heat pumps' run hours (the lead - the least run) and the fan coils' working / idle state
      runHours: Map<number, number>;
      working: Map<number, boolean>;
      // each room's heat meter today - the heat (or cold) its fan coil gave, kWh
      roomKwh: { date: string; kwh: Map<number, number> };
      // today's day notes - its own and its ledger's (read every few minutes)
      notes: { at: number; date: string; list: DayNote[] } | null;
      // the heat pumps' operation switches: what each relay should be, what it was last set to, the
      // queue still to switch (one per `pumpStaggerS`) and when the last one was switched
      relays: { written: Map<number, boolean>; queue: { relay: number; on: boolean; nodeId: number }[]; lastAt: number; staggerMs: number };
      // the units that ran last round - kept first in the order
      runningIds: Set<number>;
    }
  >();

  // one switch from the queue when its time came (every orchestrator call - each second)
  async function switchNext(processId: number, relays: { written: Map<number, boolean>; queue: { relay: number; on: boolean; nodeId: number }[]; lastAt: number; staggerMs: number }, now: number) {
    if (!relays.queue.length || now - relays.lastAt < relays.staggerMs) return;
    const next = relays.queue.shift()!;
    relays.lastAt = now;
    try {
      await apiClient.setDeviceAuto(next.relay, next.on);
      relays.written.set(next.relay, next.on);
    } catch (err) {
      // retried on the next tick's queue (written stays unknown)
      logger.warn({ processId, nodeId: next.nodeId, err }, "heating-control: the heat pump's switch didn't take");
    }
  }

  const localParts = (ms: number, timeZone: string) => {
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short", hourCycle: "h23" }).formatToParts(new Date(ms));
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    return {
      date: `${get("year")}-${get("month")}-${get("day")}`,
      minute: Number(get("hour")) * 60 + Number(get("minute")),
      weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday")),
    };
  };

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

  async function applyCommands(process: any, config: HeatingConfig): Promise<HeatingConfig> {
    let next = config;
    for (const cmd of process.commands ?? []) {
      const p = cmd.params ?? {};
      let patch: Partial<HeatingConfig> | null = null;
      const control = { ...(next.control ?? {}) };
      if (cmd.action === "setMode" && ["auto", "heating", "cooling", "off"].includes(p.mode)) patch = { control: { ...control, mode: p.mode } };
      else if (cmd.action === "setSetpoint" && ["heating", "cooling"].includes(p.mode) && Number(p.c) >= 5 && Number(p.c) <= 35) {
        if (Number.isInteger(p.nodeId)) {
          const consumers = (next.consumers ?? []).map((c) => (c.nodeId === p.nodeId ? { ...c, setpointC: { ...(c.setpointC ?? {}), [p.mode]: Number(p.c) } } : c));
          if (consumers.some((c) => c.nodeId === p.nodeId)) patch = { consumers };
        } else patch = { control: { ...control, setpointC: { ...DEFAULT_CONTROL.setpointC, ...(control.setpointC ?? {}), [p.mode]: Number(p.c) } } };
      } else if (cmd.action === "setEnabled" && Number.isInteger(p.nodeId) && typeof p.enabled === "boolean") {
        const disabled = new Set(next.disabled ?? []);
        if (p.enabled) disabled.delete(p.nodeId);
        else disabled.add(p.nodeId);
        patch = { disabled: [...disabled] };
      }
      if (patch) {
        await apiClient.request(`/processes/${process.id}/config`, { method: "PATCH", body: JSON.stringify(patch) });
        next = { ...next, ...patch };
      }
      await apiClient.completeCommand(process.id, cmd.id, patch ? { ok: true } : { ok: false, error: `unknown command or bad params: ${cmd.action}` });
    }
    return next;
  }

  register("heating-control", async (process: any) => {
    const now = Date.now();
    let st = states.get(process.id);
    let config: HeatingConfig = process.config ?? {};
    if ((process.commands ?? []).length) config = await applyCommands(process, config);
    const intervalMs = (config.simulation?.intervalSeconds ?? DEFAULT_INTERVAL_S) * 1000;
    if (st) await switchNext(process.id, st.relays, now);
    if (st && now - st.lastRun < intervalMs && !(process.commands ?? []).length) return;
    const timeZone = config.timeZone || systemTimeZone;
    const local = localParts(now, timeZone);
    if (!st) {
      const saved = process.metrics?.today;
      st = {
        lastRun: 0,
        mode: process.metrics?.mode === "heating" || process.metrics?.mode === "cooling" ? process.metrics.mode : null,
        charging: process.metrics?.charging === true,
        weather: null,
        prices: null,
        today: saved?.date === local.date ? { ...emptyToday(local.date), ...saved } : emptyToday(local.date),
        declared: null,
        runHours: new Map((process.metrics?.pumps ?? []).map((x: any) => [x.nodeId, Number(x.runHours) || 0])),
        working: new Map((process.metrics?.consumers ?? []).map((x: any) => [x.nodeId, x.working === true])),
        notes: null,
        relays: { written: new Map(), queue: [], lastAt: 0, staggerMs: 0 },
        runningIds: new Set((process.metrics?.pumps ?? []).filter((x: any) => x.running).map((x: any) => x.nodeId)),
        roomKwh: {
          date: local.date,
          kwh: new Map(saved?.date === local.date ? (process.metrics?.consumers ?? []).map((x: any) => [x.nodeId, Number(x.todayKwh) || 0]) : []),
        },
      };
      states.set(process.id, st);
    }
    const hours = st.lastRun ? Math.min(intervalMs * 3, now - st.lastRun) / 3_600_000 : intervalMs / 3_600_000;
    st.lastRun = now;
    if (st.today.date !== local.date) st.today = emptyToday(local.date);
    const control: Control = {
      ...DEFAULT_CONTROL,
      ...(config.control ?? {}),
      setpointC: { ...DEFAULT_CONTROL.setpointC, ...(config.control?.setpointC ?? {}) },
      tank: { ...DEFAULT_CONTROL.tank, ...(config.control?.tank ?? {}) },
    };

    // --- the weather and the prices -----------------------------------------
    if (config.weatherProcessId && (!st.weather || now - st.weather.at >= WEATHER_TTL_MS)) {
      try {
        const f = await apiClient.request(`/weather-control/${config.weatherProcessId}/forecast`);
        st.weather = { at: now, hourly: f.hourly ?? [] };
      } catch (err) {
        logger.warn({ processId: process.id, err }, "heating-control: no forecast");
        st.weather = { at: now, hourly: st.weather?.hourly ?? [] };
      }
    }
    const hourly = st.weather?.hourly ?? [];
    const outdoorC = valueAt(hourly, now, "temperatureC");
    const outdoorRh = valueAt(hourly, now, "humidityPct");
    const outdoorIn3h = valueAt(hourly, now + 3 * 3_600_000, "temperatureC");
    if (config.gridProcessId && (!st.prices || now - st.prices.at >= PRICES_TTL_MS)) {
      try {
        const p = await apiClient.request(`/energy-grid/${config.gridProcessId}/prices?from=${now - 3_600_000}&to=${now + DAY_AHEAD_MS}`);
        st.prices = { at: now, slots: p.slots ?? [] };
      } catch (err) {
        logger.warn({ processId: process.id, err }, "heating-control: no prices");
        st.prices = { at: now, slots: st.prices?.slots ?? [] };
      }
    }
    const slotNow = (st.prices?.slots ?? []).find((s) => s.t <= now && s.t + s.minutes * 60_000 > now && s.buyCtKwh !== null) ?? null;
    const buyEurKwh = slotNow ? slotNow.buyCtKwh! / 100 : null;

    // --- the mode --------------------------------------------------------------
    let mode: Mode | null = null;
    if (control.mode === "heating" || control.mode === "cooling") mode = control.mode;
    else if (control.mode === "auto" && outdoorC !== null) mode = autoMode(st.mode, outdoorC, control.heatBelowC, control.coolAboveC);
    if (mode !== st.mode) st.charging = false;
    if (mode) st.mode = mode;

    // --- the heating planner's slot now ------------------------------------------------
    let planned: { heatKw: number; units: number; roomOffsetK: number; madeAt: number } | null = null;
    let planWhy: string | null = config.plannerProcessId ? null : "no planner";
    if (config.plannerProcessId && mode && control.mode !== "off") {
      try {
        const p = await apiClient.request(`/heating-planner/${config.plannerProcessId}/now?heating=${process.id}`);
        if (!p.slot) planWhy = "no slot now";
        else if (now - p.madeAt > PLAN_MAX_AGE_MS) planWhy = "the plan is old";
        else if (p.mode !== mode) planWhy = "the plan is for the other mode";
        else planned = { heatKw: Number(p.slot.heatKw) || 0, units: Number(p.slot.units) || 0, roomOffsetK: Number(p.slot.roomOffsetK) || 0, madeAt: p.madeAt };
      } catch (err) {
        planWhy = "the planner didn't answer";
        logger.warn({ processId: process.id, err }, "heating-control: no plan");
      }
    } else if (config.plannerProcessId) planWhy = "off";

    // --- the readings ------------------------------------------------------------
    const pumps = config.heatPumps ?? [];
    const tanks = config.tanks ?? [];
    const coils = config.consumers ?? [];
    const disabled = new Set(config.disabled ?? []);
    // the day's notes (the core's day_notes, 2026-10-25): its own - maintenance (the units out in its window)
    // and a room closed (its fan coil set back; no units named - every room) - and its ledger's - a holiday /
    // a day off (no working-hours gains in the rooms), a working weekend (the gains as on a working day)
    if (!st.notes || st.notes.date !== local.date || now - st.notes.at >= NOTES_TTL_MS) {
      const ids = [process.id, config.ledgerProcessId].filter((x): x is number => Number.isInteger(x));
      const lists = await Promise.all(
        ids.map((id) =>
          apiClient
            .request(`/processes/${id}/day-notes?from=${local.date}&to=${local.date}`)
            .then((x: any) => (x.notes ?? []) as DayNote[])
            .catch(() => [] as DayNote[]),
        ),
      );
      st.notes = { at: now, date: local.date, list: lists.flat() };
    }
    const covers = (n: DayNote) => (n.startsAt !== null || n.endsAt !== null ? (n.startsAt ?? -Infinity) <= now && now < (n.endsAt ?? Infinity) : n.day === local.date);
    const active = st.notes.list.filter(covers);
    const outForWork = new Set(active.filter((n) => n.kind === "maintenance").flatMap((n) => n.nodeIds));
    for (const id of outForWork) disabled.add(id);
    const closedAll = active.some((n) => n.kind === "room-closed" && !n.nodeIds.length);
    const closed = new Set(active.filter((n) => n.kind === "room-closed").flatMap((n) => n.nodeIds));
    const dayOff = st.notes.list.some((n) => n.day === local.date && (n.kind === "holiday" || n.kind === "day-off"));
    const workday = st.notes.list.some((n) => n.day === local.date && n.kind === "workday");
    const gainsWeekday = dayOff ? 0 : workday && (local.weekday === 0 || local.weekday === 6) ? 3 : local.weekday;
    const nodes = new Map<number, { simulated: boolean }>((await apiClient.listNodes()).map((n: any) => [n.id, n]));
    const simulated = (it: Item) => nodes.get(it.nodeId)?.simulated === true;
    const ids = [...pumps, ...tanks, ...coils].flatMap((it) => Object.values(it.devices ?? {}).filter((x): x is number => typeof x === "number"));
    const { values: readings } = ids.length ? await apiClient.getDeviceValues([...new Set(ids)]) : { values: {} };
    const num = (id: number | undefined): number | null => {
      if (typeof id !== "number") return null;
      const v = readings?.[id];
      const n = v && v.source !== "error" ? Number(v.value) : NaN;
      return Number.isFinite(n) ? n : null;
    };
    const writes: { id: number; value: unknown }[] = [];
    const write = (id: number | undefined, value: number) => {
      if (typeof id === "number") writes.push({ id, value: r(value, 3) });
    };

    // --- the tanks: one store of all the readable ones ---------------------------
    // a tank whose temperature isn't readable now sits this round out - never integrated on a guess
    const tankNow = tanks.map((t) => {
      const top = num(t.devices?.topTemp);
      const middle = num(t.devices?.middleTemp);
      const bottom = num(t.devices?.bottomTemp);
      const avg = middle ?? (top !== null && bottom !== null ? (top + bottom) / 2 : null);
      return { item: t, avg, top: top ?? avg, bottom: bottom ?? avg, perK: (t.volumeL * 1.163) / 1000 };
    });
    // a simulated tank never read yet (new) starts at its neighbours' average (else its useful range's
    // middle) - a simulation's start, not a guess about a real one
    const known = tankNow.filter((t) => t.avg !== null);
    for (const t of tankNow) {
      if (t.avg !== null || !simulated(t.item)) continue;
      const startC = known.length ? known.reduce((a, x) => a + x.avg!, 0) / known.length : (t.item.tMinC + t.item.tMaxC) / 2;
      Object.assign(t, { avg: startC, top: startC, bottom: startC });
    }
    const live = tankNow.filter((t) => t.avg !== null);
    const perK = live.reduce((a, t) => a + t.perK, 0);
    const avgC = perK > 0 ? live.reduce((a, t) => a + t.avg! * t.perK, 0) / perK : null;
    const topC = perK > 0 ? live.reduce((a, t) => a + t.top! * t.perK, 0) / perK : null;
    const bottomC = perK > 0 ? live.reduce((a, t) => a + t.bottom! * t.perK, 0) / perK : null;

    // --- the heat pumps: charge the tanks while out of the band ------------------
    // the Energy Ledger's signal for the slot now (SG-Ready)
    let signal: 1 | 2 | 3 = 2;
    if (config.ledgerProcessId) {
      const h = (await apiClient.listProcesses()).find((x: any) => x.id === config.ledgerProcessId)?.metrics?.heatingNow;
      if (h && h.t <= now && now < h.until && [1, 2, 3].includes(h.signal)) signal = h.signal;
    }
    let demand = 0;
    if (mode && control.mode !== "off" && avgC !== null) {
      const band = signalBand(control.tank[mode], mode, signal, Math.min(...live.map((t) => t.item.tMaxC)));
      const need = mode === "heating" ? band.stopC - avgC : avgC - band.stopC; // > 0 - not there yet
      const start = mode === "heating" ? avgC <= band.startC : avgC >= band.startC;
      if (start) st.charging = true;
      if (need <= 0) st.charging = false;
      // hold off: the tanks carry the rooms until the lowered start
      if (signal === 1 && !start) st.charging = false;
      if (st.charging) demand = Math.min(1, need / Math.max(1, Math.abs(band.stopC - band.startC)) + 0.3);
    } else st.charging = false;
    const pumpReturnC = mode === "cooling" ? (topC ?? 20) : (bottomC ?? 20);
    // staged: as few units as the need takes; the running ones keep running, the next - by the policy
    // (a real unit too: its relay - its operation - follows the stage, it modulates itself)
    const outputs = pumps.map((p) => (!disabled.has(p.nodeId) && control.mode !== "off" && mode && outdoorC !== null ? maxOutputKw(p, mode, outdoorC) : 0));
    const order = pumpOrder(
      pumps.map((p, i) => i).filter((i) => outputs[i] > 0),
      (i) => st!.runningIds.has(pumps[i].nodeId),
      control.pumpOrder === "priority" ? "priority" : "auto",
      (i) => st!.runHours.get(pumps[i].nodeId) ?? 0,
      (i) => (Number.isFinite(pumps[i].priority) ? pumps[i].priority : undefined),
    );
    // the plan - while the tanks are within their safe range (else the band above)
    if (planned && mode && avgC !== null) {
      const lowC = Math.max(...live.map((t) => t.item.tMinC)) + PLAN_SAFE_LOW_K;
      const highC = Math.min(...live.map((t) => t.item.tMaxC)) - PLAN_SAFE_HIGH_K;
      if (mode === "heating" && avgC < lowC) [planned, planWhy] = [null, "the tanks too cold - the band charges them"];
      else if (mode === "heating" && avgC > highC) planned = { ...planned, heatKw: 0, units: 0 };
      else if (mode === "cooling" && avgC > control.tank.cooling.startC + PLAN_SAFE_HIGH_K) [planned, planWhy] = [null, "the tanks too warm - the band charges them"];
    }
    const staged = planned ? stageUnits(planned.units, planned.heatKw, outputs, order) : stagePumps(demand, outputs, order);
    if (planned) st.charging = staged.some((x) => x > 0);
    st.runningIds = new Set(pumps.filter((p, i) => staged[i] > 0).map((p) => p.nodeId));
    const pumpView = pumps.map((p, i) => {
      const on = !disabled.has(p.nodeId);
      if (simulated(p)) {
        const run = on && mode && outdoorC !== null ? heatPumpRun(p, mode, staged[i], outdoorC, pumpReturnC) : heatPumpRun(p, mode ?? "heating", 0, outdoorC ?? 10, pumpReturnC);
        return { item: p, on, ...run };
      }
      const heatKw = num(p.devices?.heatPower) ?? 0;
      const electricKw = num(p.devices?.power) ?? 0;
      const flowC = num(p.devices?.flowTemp) ?? pumpReturnC;
      const returnC = num(p.devices?.returnTemp) ?? pumpReturnC;
      return {
        item: p,
        on,
        running: electricKw > 0.05,
        modulation: Math.min(1, Math.abs(heatKw) / p.ratedHeatKw),
        heatKw,
        electricKw,
        cop: electricKw > 0.05 ? Math.abs(heatKw) / electricKw : null,
        flowC,
        returnC,
        flowLpm: num(p.devices?.flowRate) ?? 0,
        fanRpm: num(p.devices?.fanSpeed) ?? 0,
      };
    });
    for (const x of pumpView) if (x.running) st.runHours.set(x.item.nodeId, (st.runHours.get(x.item.nodeId) ?? 0) + hours);
    const pumpsHeatKw = pumpView.reduce((a, x) => a + x.heatKw, 0);
    const pumpsElectricKw = pumpView.reduce((a, x) => a + x.electricKw, 0);

    // --- the rooms ----------------------------------------------------------------
    const supplyC = mode === "cooling" ? (bottomC ?? 20) : (topC ?? 20);
    const coilView = coils.map((c) => {
      const on = !disabled.has(c.nodeId) && control.mode !== "off";
      const roomC = num(c.devices?.temperature);
      const isClosed = closedAll || closed.has(c.nodeId);
      const baseC = mode ? (c.setpointC?.[mode] ?? control.setpointC[mode]) : null;
      // a closed room rests - its setpoint set back (still kept from frost / heat)
      // the plan's comfort margin: the rooms a little off their setpoint in its dear hours
      const offsetK = (isClosed ? control.closedSetbackK : 0) + (planned?.roomOffsetK ?? 0);
      const setpointC = baseC !== null ? baseC + (mode === "heating" ? -offsetK : offsetK) : baseC;
      if (!simulated(c)) {
        const fanW = (num(c.devices?.power) ?? 0) * 1000;
        return { item: c, on, roomC, humidityPct: num(c.devices?.humidity), setpointC, fan: fanW > 0 ? 1 : 0, heatKw: 0, fanW, fanRpm: num(c.devices?.fanSpeed) ?? 0 };
      }
      // a room whose temperature isn't readable now sits this round out
      if (roomC === null) return { item: c, on, roomC, humidityPct: null, setpointC, fan: 0, heatKw: 0, fanW: 0, fanRpm: 0 };
      const thermostat = on && mode && setpointC !== null ? fanControl(mode, roomC, setpointC, st!.working.get(c.nodeId) ?? false) : { working: false, fan: 0 };
      st!.working.set(c.nodeId, thermostat.working);
      const fan = thermostat.fan;
      const run = fanCoilRun(c, fan, supplyC, roomC);
      // the water gives only in its direction: no heat from colder water, no cold from warmer
      const heatKw = mode === "heating" ? Math.max(0, run.heatKw) : mode === "cooling" ? Math.min(0, run.heatKw) : 0;
      const nextC = outdoorC !== null ? roomStep(c.room, roomC, heatKw, outdoorC, gainsAt(c.room, local.minute, gainsWeekday), hours) : roomC;
      // the room's humidity: the outside air's, dried by heating it up, condensed on a cooling coil
      const baseRh = outdoorRh !== null && outdoorC !== null ? outdoorRh * Math.pow(2, (outdoorC - nextC) / 10) : 45;
      const humidityPct = Math.max(20, Math.min(75, baseRh + (mode === "cooling" && fan > 0 ? -8 : 0) + (Math.random() - 0.5)));
      return { item: c, on, roomC: nextC, humidityPct, setpointC, fan, ...run, heatKw };
    });
    if (st.roomKwh.date !== local.date) st.roomKwh = { date: local.date, kwh: new Map() };
    for (const x of coilView) st.roomKwh.kwh.set(x.item.nodeId, (st.roomKwh.kwh.get(x.item.nodeId) ?? 0) + Math.abs(x.heatKw) * hours);
    const coilsHeatKw = coilView.reduce((a, x) => a + x.heatKw, 0);
    const fansKw = coilView.reduce((a, x) => a + x.fanW, 0) / 1000;
    const activeCoils = coilView.filter((x) => x.fan > 0).length;
    const consumersReturnC = activeCoils > 0 ? supplyC - coilsHeatKw / (activeCoils * COIL_FLOW_LPM * WATER_KW_PER_LPM_K) : supplyC;

    // --- the tanks' balance ------------------------------------------------------------
    const tankView = tankNow.map((t) => {
      const share = perK > 0 && t.avg !== null ? t.perK / perK : 0;
      // the tank's share of the flows: + charged (heat in when heating, cold in when cooling), - drawn
      const chargeKw = (pumpsHeatKw - coilsHeatKw) * share * (mode === "cooling" ? -1 : 1);
      // its two heat exchangers apart (2026-10-29): what comes in from the heat pumps, what goes out to
      // the fan coils - both at once, each by its size (heat or cold)
      const inKw = Math.abs(pumpsHeatKw) * share;
      const outKw = Math.abs(coilsHeatKw) * share;
      const flowing = (Math.abs(pumpsHeatKw) + Math.abs(coilsHeatKw)) * share > 0.05;
      if (!simulated(t.item) || t.avg === null) return { ...t, ...tankStored(t.item, t.avg ?? t.item.tMinC), lossKw: 0, chargeKw, inKw, outKw, flowing };
      const step = tankStep(t.item, t.avg, (pumpsHeatKw - coilsHeatKw) * share, (Math.abs(pumpsHeatKw) + Math.abs(coilsHeatKw)) * share, control.tankRoomC, hours);
      return { ...t, avg: step.avgC, top: step.topC, bottom: step.bottomC, lossKw: step.lossKw, chargeKw, inKw, outKw, flowing, ...tankStored(t.item, step.avgC) };
    });
    const storedKwh = tankView.reduce((a, t) => a + t.kwh, 0);
    const fullKwh = tankView.reduce((a, t) => a + t.fullKwh, 0);

    // --- simulated readings --------------------------------------------------------
    for (const x of pumpView) {
      if (!simulated(x.item)) continue;
      const d = x.item.devices ?? {};
      write(d.flowTemp, x.flowC);
      write(d.returnTemp, x.returnC);
      if (outdoorC !== null) write(d.outdoorTemp, outdoorC);
      write(d.flowRate, x.flowLpm);
      write(d.heatPower, x.heatKw);
      write(d.heatEnergy, (num(d.heatEnergy) ?? 0) + Math.abs(x.heatKw) * hours);
      write(d.power, x.electricKw);
      write(d.energy, (num(d.energy) ?? 0) + x.electricKw * hours);
      write(d.fanSpeed, x.fanRpm);
    }
    for (const t of tankView) {
      if (!simulated(t.item) || t.avg === null) continue;
      write(t.item.devices?.topTemp, t.top!);
      write(t.item.devices?.middleTemp, t.avg);
      write(t.item.devices?.bottomTemp, t.bottom!);
    }
    for (const x of coilView) {
      if (!simulated(x.item) || x.roomC === null) continue;
      const d = x.item.devices ?? {};
      write(d.temperature, x.roomC);
      if (x.humidityPct !== null) write(d.humidity, x.humidityPct);
      write(d.power, x.fanW / 1000);
      write(d.fanSpeed, x.fanRpm);
    }
    if (writes.length) await apiClient.simulateDevices(writes);

    // the heat pumps' operation follows the stage, one switch per `pumpStaggerS` (the inrush currents
    // never all at once): the queue - the stops first (in the reverse order), then the starts (in the
    // order); a relay never set yet (a restart) - queued too
    const wantOn = new Map(pumps.map((p, i) => [p.nodeId, staged[i] > 0]));
    const changes = pumps
      .filter((p) => typeof p.devices?.relay === "number" && st!.relays.written.get(p.devices.relay) !== wantOn.get(p.nodeId))
      .map((p) => ({ relay: p.devices!.relay!, on: wantOn.get(p.nodeId)!, nodeId: p.nodeId }));
    const at = (id: number) => {
      const k = order.findIndex((i) => pumps[i].nodeId === id);
      return k < 0 ? Infinity : k;
    };
    st.relays.queue = [...changes.filter((x) => !x.on).sort((a, b) => at(b.nodeId) - at(a.nodeId)), ...changes.filter((x) => x.on).sort((a, b) => at(a.nodeId) - at(b.nodeId))];
    st.relays.staggerMs = Math.max(0, Number(control.pumpStaggerS) || 0) * 1000;
    await switchNext(process.id, st.relays, now);

    // a fan coil's valve follows the config (AUTO); one switch failing - e.g. its device not
    // provisioned yet - doesn't stop the rest
    const switches: [number | undefined, boolean, number][] = coils.map((c) => [c.devices?.valve, !disabled.has(c.nodeId) && control.mode !== "off", c.nodeId]);
    for (const [relay, on, nodeId] of switches) {
      if (typeof relay !== "number") continue;
      try {
        await apiClient.setDeviceAuto(relay, on);
      } catch (err) {
        logger.warn({ processId: process.id, nodeId, err }, "heating-control: the switch didn't take");
      }
    }

    // --- today -------------------------------------------------------------------
    const t = st.today;
    if (pumpsHeatKw > 0) t.heatKwh += pumpsHeatKw * hours;
    else t.coolKwh += -pumpsHeatKw * hours;
    t.deliveredKwh += Math.abs(coilsHeatKw) * hours;
    t.pumpsKwh += pumpsElectricKw * hours;
    t.fansKwh += fansKw * hours;
    // without tanks the heat pumps would make the rooms' heat when it's needed, at that moment's COP
    const reference = pumps[0];
    const needCop = reference && mode && outdoorC !== null ? performance(reference, mode, outdoorC, supplyC) : null;
    const delivered = Math.abs(coilsHeatKw) * hours;
    t.noStorageKwh += (needCop ? delivered / needCop : 0) + fansKw * hours;
    if (buyEurKwh !== null) {
      t.costEur = add(t.costEur, (pumpsElectricKw + fansKw) * hours * buyEurKwh);
      t.directEur = add(t.directEur, (mode === "heating" ? delivered : needCop ? delivered / needCop : 0) * buyEurKwh + fansKw * hours * buyEurKwh);
      t.noStorageEur = add(t.noStorageEur, (needCop ? delivered / needCop : 0) * buyEurKwh + fansKw * hours * buyEurKwh);
    }

    // --- WEM ---------------------------------------------------------------------
    const errors: { code: string; level: number; text: string }[] = [];
    const warnings: { code: string; level: number; text: string }[] = [];
    for (const x of coilView) if (x.roomC !== null && x.roomC < 5) errors.push({ code: `frost_${x.item.nodeId}`, level: 1, text: `${x.item.name}: ${x.roomC.toFixed(1)} C - frost risk` });
    for (const x of tankView) {
      if (x.avg !== null && x.avg < 5) errors.push({ code: `tank_frost_${x.item.nodeId}`, level: 1, text: `${x.item.name}: ${x.avg.toFixed(1)} C - frost risk` });
      if (x.top !== null && x.top > x.item.tMaxC) warnings.push({ code: `tank_hot_${x.item.nodeId}`, level: 1, text: `${x.item.name}: ${x.top.toFixed(1)} C at the top - over its ${x.item.tMaxC} C` });
    }
    for (const x of pumpView) if (x.running && x.cop !== null && x.cop < 2) warnings.push({ code: `low_cop_${x.item.nodeId}`, level: 1, text: `${x.item.name}: ${mode === "cooling" ? "EER" : "COP"} ${x.cop.toFixed(1)} - inefficient at this weather` });
    if (mode === "heating" && fullKwh > 0 && storedKwh / fullKwh < 0.1 && coilsHeatKw > 0) warnings.push({ code: "tanks_low", level: 1, text: "The tanks are nearly empty - the rooms may cool down" });
    if (config.weatherProcessId && outdoorC === null) warnings.push({ code: "no_forecast", level: 1, text: "No weather forecast - the outdoor temperature is unknown" });
    await apiClient.syncMessages(process.id, "error", errors);
    await apiClient.syncMessages(process.id, "warning", warnings);
    await apiClient.setCritical(process.id, errors.length > 0);
    await apiClient.setWarning(process.id, warnings.length > 0);

    // --- metrics -------------------------------------------------------------------
    const running = pumpView.filter((x) => x.running);
    const cop = running.length && pumpsElectricKw > 0 ? Math.abs(pumpsHeatKw) / pumpsElectricKw : null;
    const pumpsFlowC = running.length ? running.reduce((a, x) => a + x.flowC * x.flowLpm, 0) / running.reduce((a, x) => a + x.flowLpm, 0) : pumpReturnC;
    const values: Record<string, number> = {
      "heat.heatKw": r(pumpsHeatKw, 3),
      "heat.electricKw": r(pumpsElectricKw + fansKw, 3),
      "heat.consumersKw": r(coilsHeatKw, 3),
      // the tanks' net: + storing heat (cold when cooling), - giving it back (the scene's chart, 2026-10-24)
      "heat.tanksKw": r((pumpsHeatKw - coilsHeatKw) * (mode === "cooling" ? -1 : 1), 3),
    };
    if (outdoorC !== null) values["heat.outdoorC"] = r(outdoorC, 1);
    if (cop !== null) values["heat.cop"] = r(cop, 2);
    if (fullKwh > 0) values["heat.tankPct"] = r((storedKwh / fullKwh) * 100, 1);
    // each unit's own (its popup's charts, 2026-10-29): a heat pump's heat and COP, a tank's heat in /
    // out and charge, a fan coil's heat and its room
    for (const x of pumpView) {
      values[`heat.pump.${x.item.nodeId}.kw`] = r(x.heatKw, 3);
      if (x.cop !== null) values[`heat.pump.${x.item.nodeId}.cop`] = r(x.cop, 2);
    }
    for (const x of tankView) {
      values[`heat.tank.${x.item.nodeId}.inKw`] = r(x.inKw, 3);
      values[`heat.tank.${x.item.nodeId}.outKw`] = r(x.outKw, 3);
      if (x.avg !== null) values[`heat.tank.${x.item.nodeId}.pct`] = r(x.pct, 1);
    }
    for (const x of coilView) {
      values[`heat.coil.${x.item.nodeId}.kw`] = r(x.heatKw, 3);
      if (x.roomC !== null) values[`heat.coil.${x.item.nodeId}.roomC`] = r(x.roomC, 1);
    }
    // the series between the blocks: what the heat pumps give the tanks, what the tanks give the rooms (abs)
    values["heat.tanksInKw"] = r(Math.abs(pumpsHeatKw), 3);
    values["heat.tanksOutKw"] = r(Math.abs(coilsHeatKw), 3);
    const plant = [...pumps, ...tanks, ...coils].map((u) => u.nodeId).join(",");
    if (st.declared !== plant) {
      try {
        await apiClient.declareSeries(process.id, [
          { valueKey: "heat.outdoorC", name: "Outdoor temperature", unit: "C", kind: "gauge", mode: "period", periodS: 300 },
          { valueKey: "heat.heatKw", name: "Heat pumps (+ heat / - cold)", unit: "kW", kind: "gauge", mode: "period", periodS: 300 },
          { valueKey: "heat.electricKw", name: "Heating electricity", unit: "kW", kind: "gauge", mode: "period", periodS: 300 },
          { valueKey: "heat.consumersKw", name: "Consumers (+ heat / - cold)", unit: "kW", kind: "gauge", mode: "period", periodS: 300 },
          { valueKey: "heat.cop", name: "COP / EER", unit: "", kind: "gauge", mode: "period", periodS: 300 },
          { valueKey: "heat.tankPct", name: "Tanks' stored heat", unit: "%", kind: "gauge", mode: "period", periodS: 300 },
          { valueKey: "heat.tanksKw", name: "Tanks (+ storing / - giving back)", unit: "kW", kind: "gauge", mode: "period", periodS: 300 },
          { valueKey: "heat.tanksInKw", name: "Tanks - heat in (from the heat pumps)", unit: "kW", kind: "gauge", mode: "period", periodS: 300 },
          { valueKey: "heat.tanksOutKw", name: "Tanks - heat out (to the fan coils)", unit: "kW", kind: "gauge", mode: "period", periodS: 300 },
          ...pumps.flatMap((u) => [
            { valueKey: `heat.pump.${u.nodeId}.kw`, name: `${u.name} - heat (+ heat / - cold)`, unit: "kW", kind: "gauge", mode: "period", periodS: 300 },
            { valueKey: `heat.pump.${u.nodeId}.cop`, name: `${u.name} - COP / EER`, unit: "", kind: "gauge", mode: "period", periodS: 300 },
          ]),
          ...tanks.flatMap((u) => [
            { valueKey: `heat.tank.${u.nodeId}.inKw`, name: `${u.name} - heat in`, unit: "kW", kind: "gauge", mode: "period", periodS: 300 },
            { valueKey: `heat.tank.${u.nodeId}.outKw`, name: `${u.name} - heat out`, unit: "kW", kind: "gauge", mode: "period", periodS: 300 },
            { valueKey: `heat.tank.${u.nodeId}.pct`, name: `${u.name} - stored heat`, unit: "%", kind: "gauge", mode: "period", periodS: 300 },
          ]),
          ...coils.flatMap((u) => [
            { valueKey: `heat.coil.${u.nodeId}.kw`, name: `${u.name} - heat (+ heat / - cold)`, unit: "kW", kind: "gauge", mode: "period", periodS: 300 },
            { valueKey: `heat.coil.${u.nodeId}.roomC`, name: `${u.name} - room temperature`, unit: "C", kind: "gauge", mode: "period", periodS: 300 },
          ]),
        ]);
        st.declared = plant;
      } catch (err) {
        logger.warn({ processId: process.id, err }, "heating-control: failed to declare the series");
      }
    }
    const round = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === "number" ? r(v, 2) : v]));
    await apiClient.setMetrics(process.id, {
      mode: mode ?? null,
      control: control.mode,
      charging: st.charging,
      signal,
      // what the heat pumps follow now: the planner's slot or the band (and why)
      plan: planned
        ? { source: "planner", heatKw: r(planned.heatKw), units: planned.units, roomOffsetK: r(planned.roomOffsetK), madeAt: planned.madeAt }
        : { source: "band", why: planWhy },
      // the electricity the heating takes now - the Energy Field counts it in the site's consumption
      electricKw: r(pumpsElectricKw + fansKw, 3),
      outdoor: outdoorC === null ? null : { temperatureC: r(outdoorC, 1), humidityPct: outdoorRh === null ? null : r(outdoorRh, 0), in3hC: outdoorIn3h === null ? null : r(outdoorIn3h, 1) },
      totals: {
        heatKw: r(pumpsHeatKw),
        electricKw: r(pumpsElectricKw),
        fansKw: r(fansKw, 3),
        cop: cop === null ? null : r(cop, 2),
        consumersKw: r(coilsHeatKw),
        storedKwh: r(storedKwh, 1),
        fullKwh: r(fullKwh, 1),
        tankPct: fullKwh > 0 ? r((storedKwh / fullKwh) * 100, 1) : null,
      },
      // the two lines between the blocks: warm / cold water and the heat they carry
      lines: {
        pumpsTanks: { warmC: r(mode === "cooling" ? pumpReturnC : pumpsFlowC, 1), coldC: r(mode === "cooling" ? pumpsFlowC : pumpReturnC, 1), kw: r(pumpsHeatKw) },
        tanksConsumers: { warmC: r(mode === "cooling" ? consumersReturnC : supplyC, 1), coldC: r(mode === "cooling" ? supplyC : consumersReturnC, 1), kw: r(coilsHeatKw) },
      },
      price: slotNow ? { buyCtKwh: slotNow.buyCtKwh } : null,
      groups: (config.groups ?? []).map((g) => ({ key: g.key, name: g.name, block: g.block })),
      pumps: pumpView.map((x) => ({
        nodeId: x.item.nodeId,
        name: x.item.name,
        group: x.item.group ?? null,
        model: x.item.model ?? null,
        on: x.on,
        running: x.running,
        modulation: r(x.modulation),
        heatKw: r(x.heatKw),
        electricKw: r(x.electricKw),
        cop: x.cop === null ? null : r(x.cop, 2),
        flowC: r(x.flowC, 1),
        returnC: r(x.returnC, 1),
        flowLpm: r(x.flowLpm, 1),
        fanRpm: r(x.fanRpm, 0),
        ratedHeatKw: x.item.ratedHeatKw,
        priority: x.item.priority ?? null,
        // waiting for its turn to start / stop (the stagger)
        switching: st!.relays.queue.some((q) => q.nodeId === x.item.nodeId),
        runHours: r(st!.runHours.get(x.item.nodeId) ?? 0, 2),
        // out for maintenance now (a day note)
        maintenance: outForWork.has(x.item.nodeId),
      })),
      tanks: tankView.map((x) => ({
        nodeId: x.item.nodeId,
        name: x.item.name,
        group: x.item.group ?? null,
        model: x.item.model ?? null,
        volumeL: x.item.volumeL,
        tMinC: x.item.tMinC,
        tMaxC: x.item.tMaxC,
        avgC: x.avg === null ? null : r(x.avg, 1),
        topC: x.top === null ? null : r(x.top, 1),
        bottomC: x.bottom === null ? null : r(x.bottom, 1),
        storedKwh: r(x.kwh, 1),
        fullKwh: r(x.fullKwh, 1),
        pct: r(x.pct, 1),
        chargeKw: r(x.chargeKw),
        inKw: r(x.inKw),
        outKw: r(x.outKw),
        flowing: x.flowing,
      })),
      consumers: coilView.map((x) => ({
        nodeId: x.item.nodeId,
        name: x.item.name,
        group: x.item.group ?? null,
        model: x.item.model ?? null,
        on: x.on,
        roomC: x.roomC === null ? null : r(x.roomC, 1),
        humidityPct: x.humidityPct === null ? null : r(x.humidityPct, 0),
        setpointC: x.setpointC,
        fan: r(x.fan),
        heatKw: r(x.heatKw),
        fanW: r(x.fanW, 0),
        fanRpm: r(x.fanRpm, 0),
        fanRatedW: x.item.fanRatedW,
        ratedKw: x.item.ratedKw,
        // working - heating / cooling now (the fan turns), else idle
        working: x.fan > 0,
        // the room closed now (a day note) - its setpoint set back; out for maintenance
        closed: closedAll || closed.has(x.item.nodeId),
        maintenance: outForWork.has(x.item.nodeId),
        todayKwh: r(st!.roomKwh.kwh.get(x.item.nodeId) ?? 0, 2),
      })),
      today: round(t),
      values,
    });
  });
}
