/**
 * "energy-field" process kind - a site's own generation and storage (CORE
 * Library package devices/processes/energy-field/; depends on
 * weather-control and energy-grid): PV blocks (node type `pv-inverter`),
 * small wind turbines (`wind-turbine`), one battery array of storage units
 * (`battery-storage`) and the site's consumption (`power-meter`) - one
 * consumer; its distribution over buildings is a later package's.
 *
 * Every `simulation.intervalSeconds` (default 30 - a demo polls rarely):
 *  1. the items' devices (resolved by type on each item's node - GET
 *     /devices, re-read every DEVICES_TTL_MS) and their readings;
 *  2. a simulated item gets its readings from the models (model.ts): a PV
 *     block from the weather forecast's solar radiation and temperature, a
 *     turbine from its wind at the hub height (each with its own gusts),
 *     the consumption from its profile (time of day, weekday) plus the
 *     electricity of the `loadProcessIds` (e.g. heating-control);
 *  3. the battery array's dispatch by the strategy's mode (model.ts
 *     `dispatch` - Auto on the Energy Ledger's plan (`ledgerProcessId`) or
 *     rules on the energy-grid's prices, Manual, Island)
 *     split over the enabled units; their SoC, voltage, current, power and
 *     temperature (simulated) follow;
 *  4. the site's balance written to the grid meter's power device (the
 *     energy-grid process's `powerDeviceId`) - the grid sees the site;
 *  5. the items' switches (relay, AUTO) follow the config's `disabled`;
 *  6. WEM, metrics (the scene, the panel, the AI), time series `field.*`.
 * Commands (POST /processes/:id/commands - processes.control): `setMode`,
 * `setManualPower`, `setExport`, `setReserve` (with an Energy Ledger - passed on to it, the owner of
 * the reserve and selling: its `setOperating`), `setEnabled` - each one
 * patches the config (kept) and is applied at once.
 */
import { alertsOf, type AlertConfig } from "./alerts.ts";
import { dispatch, loadAt, nextSoc, pvPower, splitBattery, turbinePower, windAtHub, type BatteryState, type Strategy } from "./model.ts";

const DEFAULT_INTERVAL_S = 30;
const DEVICES_TTL_MS = 5 * 60_000;
const WEATHER_TTL_MS = 10 * 60_000;
const PRICES_TTL_MS = 10 * 60_000;
const DAY_AHEAD_MS = 24 * 3_600_000;

interface Item {
  nodeId: number;
  name: string;
  group?: string;
}
interface PvItem extends Item { kWp: number; acKw: number; yieldFactor?: number }
interface TurbineItem extends Item { model?: string; ratedKw: number; cutInMs: number; ratedMs: number; cutOutMs: number; ratedRpm: number; hubHeightM: number }
interface BatteryItem extends Item { capacityKwh: number; maxChargeKw: number; maxDischargeKw: number; nominalV?: number }
interface SubMeterItem extends Item { share?: number; withLoads?: boolean | number[]; of?: number[] }
interface FieldConfig {
  timeZone?: string;
  weatherProcessId?: number;
  gridProcessId?: number;
  // one level; block - generation (the PV blocks and the turbines, the default) or batteries
  groups?: { key: string; name: string; block?: "generation" | "batteries" }[];
  pvBlocks?: PvItem[];
  turbines?: TurbineItem[];
  batteries?: BatteryItem[];
  // `subMeters` - the rooms' / areas' electricity meters (node type power-meter): a simulated one
  // gets `share` of the profile's consumption (`withLoads` - also the loadProcessIds' electricity, e.g.
  // the heating plant's room: true - all of them, or a list of their ids), `of` - a main meter (a
  // building's) also sums those sub-meters (node ids); a real one is read; each - its power, today's
  // kWh and EUR, a series
  consumer?: Item & { profile: Parameters<typeof loadAt>[0]; subMeters?: SubMeterItem[] };
  // processes whose electricity is part of the site's consumption (their
  // metrics' `electricKw` - e.g. heating-control), added to a simulated
  // consumer's profile
  loadProcessIds?: number[];
  // the energy-ledger whose plan Auto follows (its metrics' planNow); none / no fresh plan - the rules on the prices
  ledgerProcessId?: number;
  strategy?: Partial<Strategy>;
  disabled?: number[];
  // `pvLosses` - a simulated fault the forecast doesn't know (soiling, a failed string): nodeId -> the
  // share a simulated PV block really gives (e.g. 0.8) - the learning and the AI report find it
  simulation?: { intervalSeconds?: number; pvLosses?: Record<string, number> };
  // the critical states shown red (alerts.ts): over the plan by overPlanPct and overPlanMinKw, over a rating by overRatedPct
  alerts?: Partial<AlertConfig>;
  // temporary changes to undo (the scene's "For" - island for a while): at - the previous values back
  reverts?: { at: number; ops: Record<string, unknown>; replan?: boolean; reason?: string }[];
}

const DEFAULT_STRATEGY: Strategy = {
  mode: "auto",
  socMinPct: 10,
  socMaxPct: 95,
  reservePct: 20,
  exportAllowed: true,
  gridChargeAllowed: true,
  manualBatteryKw: 0,
  maxImportKw: null,
  maxExportKw: null,
};

const r = (x: number, d = 2) => Math.round(x * 10 ** d) / 10 ** d;

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- a Library package is loaded at run time by the orchestrator and imports nothing from it
export default function registerEnergyField(register: any, { apiClient, logger }: any): void {
  const systemTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  // per process: when it last ran, caches, the turbines' gusts, today's sums
  const states = new Map<
    number,
    {
      lastRun: number;
      devices: { at: number; byNode: Map<number, Map<string, number>> } | null;
      weather: { at: number; hourly: Record<string, number | null>[] } | null;
      prices: { at: number; slots: { t: number; minutes: number; buyCtKwh: number | null; sellCtKwh: number | null }[] } | null;
      gusts: Map<number, number>;
      // each block's / turbine's yield today, kWh (the AI report compares them with their neighbours)
      units: { date: string; kwh: Record<string, number>; eur: Record<string, number> };
      today: { date: string; pvKwh: number; windKwh: number; loadKwh: number; chargeKwh: number; dischargeKwh: number; importKwh: number; exportKwh: number; curtailedKwh: number };
      declared: boolean;
    }
  >();

  const localParts = (ms: number, timeZone: string) => {
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short", hourCycle: "h23" }).formatToParts(new Date(ms));
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    return {
      date: `${get("year")}-${get("month")}-${get("day")}`,
      minute: Number(get("hour")) * 60 + Number(get("minute")),
      weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday")),
    };
  };

  const interpolate = (rows: Record<string, number | null>[], now: number) => {
    const after = rows.findIndex((x) => (x.t as number) > now);
    if (after <= 0) return null;
    const a = rows[after - 1];
    const b = rows[after];
    const k = (now - (a.t as number)) / ((b.t as number) - (a.t as number));
    const v = (key: string) => {
      const x = a[key];
      const y = b[key];
      return x === null || y === null || x === undefined || y === undefined ? (x ?? y ?? null) : x + (y - x) * k;
    };
    return { radiation: v("radiationWm2") ?? 0, temperature: v("temperatureC") ?? 15, wind: v("windSpeedMs") ?? 0 };
  };

  async function applyCommands(process: any, config: FieldConfig): Promise<FieldConfig> {
    let next = config;
    for (const cmd of process.commands ?? []) {
      const p = cmd.params ?? {};
      let patch: Partial<FieldConfig> | null = null;
      const strategy = { ...(next.strategy ?? {}) };
      // the reserve and selling belong to the Energy Ledger when there is one (its plan keeps them) - passed on
      if (next.ledgerProcessId && (cmd.action === "setExport" || cmd.action === "setReserve")) {
        const params = cmd.action === "setExport" ? { exportAllowed: p.allowed === true } : { reservePct: Number(p.pct) };
        const result = await apiClient
          .request(`/processes/${next.ledgerProcessId}/commands`, { method: "POST", body: JSON.stringify({ action: "setOperating", params: { ...params, replan: true } }) })
          .then(() => ({ ok: true, passedTo: next.ledgerProcessId }))
          .catch((err: any) => ({ ok: false, error: String(err?.message ?? err) }));
        await apiClient.completeCommand(process.id, cmd.id, result);
        continue;
      }
      if (cmd.action === "setMode" && ["auto", "manual", "island"].includes(p.mode)) {
        patch = { strategy: { ...strategy, mode: p.mode } };
        // only for a while - the previous mode put back by the field itself at the time
        if (Number(p.forMinutes) > 0)
          patch.reverts = [
            ...(next.reverts ?? []),
            { at: Date.now() + Number(p.forMinutes) * 60_000, ops: { mode: strategy.mode ?? "auto" }, ...(typeof p.reason === "string" ? { reason: p.reason.slice(0, 300) } : {}) },
          ];
      }
      else if (cmd.action === "setManualPower" && Number.isFinite(Number(p.kw))) patch = { strategy: { ...strategy, manualBatteryKw: Number(p.kw) } };
      else if (cmd.action === "setExport" && typeof p.allowed === "boolean") patch = { strategy: { ...strategy, exportAllowed: p.allowed } };
      else if (cmd.action === "setReserve" && Number(p.pct) >= 0 && Number(p.pct) <= 100) patch = { strategy: { ...strategy, reservePct: Number(p.pct) } };
      else if (cmd.action === "setEnabled" && Number.isInteger(p.nodeId) && typeof p.enabled === "boolean") {
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

  register("energy-field", async (process: any) => {
    const now = Date.now();
    let st = states.get(process.id);
    let config: FieldConfig = process.config ?? {};
    if ((process.commands ?? []).length) config = await applyCommands(process, config);
    // the temporary changes whose time came - put back (the operator's "For")
    const due = (config.reverts ?? []).filter((x) => x.at <= now);
    if (due.length) {
      const strategy: Record<string, unknown> = { ...(config.strategy ?? {}) };
      for (const r of due) for (const [k, v] of Object.entries(r.ops)) if (v === null) delete strategy[k]; else strategy[k] = v;
      const patch = { strategy, reverts: (config.reverts ?? []).filter((x) => x.at > now) };
      await apiClient.request(`/processes/${process.id}/config`, { method: "PATCH", body: JSON.stringify(patch) });
      config = { ...config, ...patch } as FieldConfig;
      logger.info({ processId: process.id, reverted: due.map((r) => r.ops) }, "energy-field: temporary changes put back");
    }
    const intervalMs = (config.simulation?.intervalSeconds ?? DEFAULT_INTERVAL_S) * 1000;
    if (st && now - st.lastRun < intervalMs && !(process.commands ?? []).length) return;
    const timeZone = config.timeZone || systemTimeZone;
    const local = localParts(now, timeZone);
    if (!st) {
      const saved = process.metrics?.today;
      st = {
        lastRun: 0,
        devices: null,
        weather: null,
        prices: null,
        gusts: new Map(),
        units: process.metrics?.units?.date === local.date ? { date: local.date, kwh: { ...process.metrics.units.kwh }, eur: { ...(process.metrics.units.eur ?? {}) } } : { date: local.date, kwh: {}, eur: {} },
        today: saved?.date === local.date ? { ...saved } : { date: local.date, pvKwh: 0, windKwh: 0, loadKwh: 0, chargeKwh: 0, dischargeKwh: 0, importKwh: 0, exportKwh: 0, curtailedKwh: 0 },
        declared: false,
      };
      states.set(process.id, st);
    }
    const hours = st.lastRun ? Math.min(intervalMs * 3, now - st.lastRun) / 3_600_000 : intervalMs / 3_600_000;
    st.lastRun = now;
    if (st.units.date !== local.date) st.units = { date: local.date, kwh: {}, eur: {} };
    if (st.today.date !== local.date) st.today = { date: local.date, pvKwh: 0, windKwh: 0, loadKwh: 0, chargeKwh: 0, dischargeKwh: 0, importKwh: 0, exportKwh: 0, curtailedKwh: 0 };

    // --- the items' devices ------------------------------------------------
    if (!st.devices || now - st.devices.at >= DEVICES_TTL_MS) {
      const all = await apiClient.request("/devices");
      const byNode = new Map<number, Map<string, number>>();
      for (const d of all as { id: number; type: string; node_id: number | null }[]) {
        if (d.node_id === null) continue;
        if (!byNode.has(d.node_id)) byNode.set(d.node_id, new Map());
        byNode.get(d.node_id)!.set(d.type, d.id);
      }
      st.devices = { at: now, byNode };
    }
    const dev = (nodeId: number, type: string) => st!.devices!.byNode.get(nodeId)?.get(type);
    const nodes = new Map<number, { simulated: boolean }>((await apiClient.listNodes()).map((n: any) => [n.id, n]));
    const pvBlocks = config.pvBlocks ?? [];
    const turbines = config.turbines ?? [];
    const batteryItems = config.batteries ?? [];
    const consumer = config.consumer;
    const disabled = new Set(config.disabled ?? []);
    const allItems: Item[] = [...pvBlocks, ...turbines, ...batteryItems, ...(consumer ? [consumer, ...(consumer.subMeters ?? [])] : [])];
    const ids = allItems.flatMap((it) => ["power", "energy", "state-of-charge", "rotational-speed", "relay", "voltage", "current", "temperature"].map((t) => dev(it.nodeId, t)).filter((x): x is number => typeof x === "number"));
    const { values: readings } = ids.length ? await apiClient.getDeviceValues([...new Set(ids)]) : { values: {} };
    const num = (id: number | undefined): number | null => {
      if (typeof id !== "number") return null;
      const v = readings?.[id];
      const n = v && v.source !== "error" ? Number(v.value) : NaN;
      return Number.isFinite(n) ? n : null;
    };
    const simulated = (it: Item) => nodes.get(it.nodeId)?.simulated === true;
    const writes: { id: number; value: unknown }[] = [];
    const write = (id: number | undefined, value: number) => {
      if (typeof id === "number") writes.push({ id, value: r(value, 3) });
    };

    // --- the weather and the prices -----------------------------------------
    if (config.weatherProcessId && (!st.weather || now - st.weather.at >= WEATHER_TTL_MS)) {
      try {
        const f = await apiClient.request(`/weather-control/${config.weatherProcessId}/forecast`);
        st.weather = { at: now, hourly: f.hourly ?? [] };
      } catch (err) {
        logger.warn({ processId: process.id, err }, "energy-field: no forecast");
        st.weather = { at: now, hourly: st.weather?.hourly ?? [] };
      }
    }
    const weather = interpolate(st.weather?.hourly ?? [], now);
    if (config.gridProcessId && (!st.prices || now - st.prices.at >= PRICES_TTL_MS)) {
      try {
        const p = await apiClient.request(`/energy-grid/${config.gridProcessId}/prices?from=${now - 3_600_000}&to=${now + DAY_AHEAD_MS}`);
        st.prices = { at: now, slots: p.slots ?? [] };
      } catch (err) {
        logger.warn({ processId: process.id, err }, "energy-field: no prices");
        st.prices = { at: now, slots: st.prices?.slots ?? [] };
      }
    }
    const slots = (st.prices?.slots ?? []).filter((s) => s.t + s.minutes * 60_000 > now && s.buyCtKwh !== null);
    const slotNow = slots.find((s) => s.t <= now) ?? null;
    const buys = slots.map((s) => s.buyCtKwh!).sort((a, b) => a - b);
    const rankNow = slotNow && buys.length > 1 ? buys.filter((b) => b < slotNow.buyCtKwh!).length / (buys.length - 1) : null;

    // --- generation ----------------------------------------------------------
    const pv = pvBlocks.map((b) => {
      const on = !disabled.has(b.nodeId);
      const kw = !on ? 0 : simulated(b) ? (weather ? pvPower(b, weather.radiation, weather.temperature) * (config.simulation?.pvLosses?.[String(b.nodeId)] ?? 1) : 0) : (num(dev(b.nodeId, "power")) ?? 0);
      return { item: b, on, kw };
    });
    const wind = turbines.map((t) => {
      const on = !disabled.has(t.nodeId);
      // each turbine its own gusts: a slow random walk around the forecast's wind
      const g = Math.max(-0.25, Math.min(0.25, (st!.gusts.get(t.nodeId) ?? 0) + (Math.random() - 0.5) * 0.1));
      st!.gusts.set(t.nodeId, g);
      const sim = weather ? turbinePower(t, windAtHub(weather.wind, t.hubHeightM) * (1 + g)) : { kw: 0, rpm: 0, state: "idle" as const };
      const kw = !on ? 0 : simulated(t) ? sim.kw : (num(dev(t.nodeId, "power")) ?? 0);
      const rpm = !on ? 0 : simulated(t) ? sim.rpm : (num(dev(t.nodeId, "rotational-speed")) ?? 0);
      return { item: t, on, kw, rpm, state: !on ? "off" : simulated(t) ? sim.state : kw > 0 ? "running" : "idle" };
    });
    const processes = config.gridProcessId || config.loadProcessIds?.length || config.ledgerProcessId ? await apiClient.listProcesses() : [];
    const ledgerProc = processes.find((p: any) => p.id === config.ledgerProcessId);
    const planNow = ledgerProc?.metrics?.planNow;
    const planKw = planNow && planNow.t <= now && now < planNow.until && Number.isFinite(Number(planNow.batteryKw)) ? Number(planNow.batteryKw) : null;
    const planFloorPct = planKw !== null && Number.isFinite(Number(planNow.floorPct)) ? Number(planNow.floorPct) : null;
    const loadKwOf = (ids: number[]) =>
      ids.reduce((a, id) => {
        const kw = Number(processes.find((p: any) => p.id === id)?.metrics?.electricKw);
        return a + (Number.isFinite(kw) ? Math.max(0, kw) : 0);
      }, 0);
    const loadsKw = loadKwOf(config.loadProcessIds ?? []);
    const profileKw = consumer && simulated(consumer) ? loadAt(consumer.profile, local.minute, local.weekday) * (1 + (Math.random() - 0.5) * 0.06) : 0;
    const loadKw = consumer ? (simulated(consumer) ? profileKw + loadsKw : (num(dev(consumer.nodeId, "power")) ?? 0)) : 0;
    // the plain meters first, then the main ones summing them (`of`)
    const ownKw = (sm: SubMeterItem) =>
      Math.max(0, (simulated(consumer!) ? profileKw : loadKw - loadsKw) * (sm.share ?? 0) * (1 + (Math.random() - 0.5) * 0.1)) +
      (sm.withLoads === true ? loadsKw : Array.isArray(sm.withLoads) ? loadKwOf(sm.withLoads.filter((id) => config.loadProcessIds?.includes(id))) : 0);
    const plainKw = new Map<number, number>();
    for (const sm of consumer?.subMeters ?? []) if (!sm.of?.length) plainKw.set(sm.nodeId, simulated(sm) ? ownKw(sm) : (num(dev(sm.nodeId, "power")) ?? 0));
    const subMeters = (consumer?.subMeters ?? []).map((sm) => ({
      item: sm,
      kw: plainKw.get(sm.nodeId) ?? (simulated(sm) ? ownKw(sm) + sm.of!.reduce((a, id) => a + (plainKw.get(id) ?? 0), 0) : (num(dev(sm.nodeId, "power")) ?? 0)),
    }));
    const generation = pv.reduce((a, x) => a + x.kw, 0) + wind.reduce((a, x) => a + x.kw, 0);

    // --- the battery array ---------------------------------------------------
    // the operating parameters the Energy Ledger owns (its reserve, selling, charging from the grid - stage D,
    // the scene writes them there) over the field's own; the field keeps the plant's limits and its mode
    const ledgerOps = processes.find((p: any) => p.id === config.ledgerProcessId)?.config?.strategy ?? {};
    const strategy: Strategy = {
      ...DEFAULT_STRATEGY,
      ...(config.strategy ?? {}),
      ...(Number.isFinite(ledgerOps.reservePct) ? { reservePct: ledgerOps.reservePct } : {}),
      ...(typeof ledgerOps.exportAllowed === "boolean" ? { exportAllowed: ledgerOps.exportAllowed } : {}),
      ...(typeof ledgerOps.gridChargeAllowed === "boolean" ? { gridChargeAllowed: ledgerOps.gridChargeAllowed } : {}),
    };
    // the grid process: the connection's limits and its meter's power device (the site's balance goes there)
    let gridPowerId: number | undefined;
    if (config.gridProcessId) {
      const grid = processes.find((p: any) => p.id === config.gridProcessId);
      strategy.maxImportKw = grid?.config?.limits?.maxImportKw ?? null;
      strategy.maxExportKw = grid?.config?.limits?.maxExportKw ?? null;
      gridPowerId = grid?.config?.powerDeviceId;
    }
    // a unit whose SoC isn't readable now (a device not ready, a read error)
    // sits this round out - never dispatched or integrated on a guess
    const socs = batteryItems.map((b) => num(dev(b.nodeId, "state-of-charge")));
    const batteries: BatteryState[] = batteryItems.map((b, i) => ({
      capacityKwh: b.capacityKwh,
      socPct: socs[i] ?? 0,
      maxChargeKw: b.maxChargeKw,
      maxDischargeKw: b.maxDischargeKw,
      enabled: !disabled.has(b.nodeId) && socs[i] !== null,
    }));
    const d = dispatch(generation, loadKw, batteries, strategy, { buyNow: slotNow?.buyCtKwh ?? null, sellNow: slotNow?.sellCtKwh ?? null, rankNow }, Math.max(hours, intervalMs / 3_600_000), planKw, planFloorPct);
    const shares = splitBattery(batteries, d.batteryKw, strategy, Math.max(hours, intervalMs / 3_600_000));
    // curtailment: held back from the PV blocks in proportion
    const pvTotal = pv.reduce((a, x) => a + x.kw, 0);
    if (d.curtailedKw > 0 && pvTotal > 0) {
      const k = Math.max(0, 1 - d.curtailedKw / pvTotal);
      pv.forEach((x) => (x.kw *= k));
    }

    // --- simulated readings ----------------------------------------------------
    for (const x of pv) {
      if (!simulated(x.item)) continue;
      write(dev(x.item.nodeId, "power"), x.kw);
      write(dev(x.item.nodeId, "energy"), (num(dev(x.item.nodeId, "energy")) ?? 0) + x.kw * hours);
      // the string's DC voltage: near its MPP while producing, the open-circuit voltage when idle
      write(dev(x.item.nodeId, "voltage"), x.kw > 0 ? 560 + Math.random() * 40 : weather && weather.radiation > 0 ? 720 : 0);
    }
    for (const x of wind) {
      if (!simulated(x.item)) continue;
      write(dev(x.item.nodeId, "power"), x.kw);
      write(dev(x.item.nodeId, "energy"), (num(dev(x.item.nodeId, "energy")) ?? 0) + x.kw * hours);
      write(dev(x.item.nodeId, "rotational-speed"), x.rpm);
    }
    const batteryView = batteryItems.map((b, i) => {
      const kw = shares[i] ?? 0;
      const soc = simulated(b) ? nextSoc(batteries[i], kw, hours) : batteries[i].socPct;
      const nominalV = b.nominalV ?? 700;
      const voltage = nominalV * (0.9 + 0.15 * (soc / 100)) + (kw > 0 ? -5 : kw < 0 ? 5 : 0);
      const current = (kw * 1000) / voltage;
      if (simulated(b) && socs[i] !== null) {
        write(dev(b.nodeId, "state-of-charge"), soc);
        write(dev(b.nodeId, "power"), kw);
        write(dev(b.nodeId, "voltage"), voltage);
        write(dev(b.nodeId, "current"), current);
        write(dev(b.nodeId, "temperature"), 22 + (Math.abs(kw) / Math.max(1, b.maxDischargeKw)) * 8);
      }
      return { item: b, on: !disabled.has(b.nodeId), kw, soc, voltage, current };
    });
    if (consumer && simulated(consumer)) {
      write(dev(consumer.nodeId, "power"), loadKw);
      write(dev(consumer.nodeId, "energy"), (num(dev(consumer.nodeId, "energy")) ?? 0) + loadKw * hours);
    }
    for (const x of subMeters) {
      if (!simulated(x.item)) continue;
      write(dev(x.item.nodeId, "power"), x.kw);
      write(dev(x.item.nodeId, "energy"), (num(dev(x.item.nodeId, "energy")) ?? 0) + x.kw * hours);
    }
    // the site's balance on the grid meter (the energy-grid process integrates its registers)
    write(gridPowerId, d.gridKw);
    if (writes.length) await apiClient.simulateDevices(writes);

    // the switches follow the config (AUTO)
    // (one switch failing - e.g. its device not provisioned yet - doesn't stop the field)
    for (const it of [...pvBlocks, ...turbines, ...batteryItems]) {
      const relay = dev(it.nodeId, "relay");
      if (typeof relay !== "number") continue;
      try {
        await apiClient.setDeviceAuto(relay, !disabled.has(it.nodeId));
      } catch (err) {
        logger.warn({ processId: process.id, nodeId: it.nodeId, err }, "energy-field: the switch didn't take");
      }
    }

    // --- today ---------------------------------------------------------------
    const t = st.today;
    for (const x of [...pv, ...wind, ...subMeters]) st.units.kwh[x.item.nodeId] = (st.units.kwh[x.item.nodeId] ?? 0) + x.kw * hours;
    if (slotNow?.buyCtKwh != null)
      for (const x of subMeters) st.units.eur[x.item.nodeId] = (st.units.eur[x.item.nodeId] ?? 0) + (x.kw * hours * slotNow.buyCtKwh) / 100;
    t.pvKwh += pv.reduce((a, x) => a + x.kw, 0) * hours;
    t.windKwh += wind.reduce((a, x) => a + x.kw, 0) * hours;
    t.loadKwh += Math.max(0, loadKw - d.shedKw) * hours;
    t.chargeKwh += Math.max(0, -d.batteryKw) * hours;
    t.dischargeKwh += Math.max(0, d.batteryKw) * hours;
    t.importKwh += Math.max(0, d.gridKw) * hours;
    t.exportKwh += Math.max(0, -d.gridKw) * hours;
    t.curtailedKwh += d.curtailedKw * hours;
    const selfSufficiencyPct = t.loadKwh > 0 ? Math.max(0, Math.min(100, (1 - t.importKwh / t.loadKwh) * 100)) : null;

    // --- WEM -----------------------------------------------------------------
    const capacity = batteries.reduce((a, b) => a + (b.enabled ? b.capacityKwh : 0), 0);
    const socPct = capacity > 0 ? batteryView.reduce((a, b, i) => a + (batteries[i].enabled ? b.soc * batteries[i].capacityKwh : 0), 0) / capacity : null;
    const errors: { code: string; level: number; text: string }[] = [];
    const warnings: { code: string; level: number; text: string }[] = [];
    if (d.shedKw > 0.01) errors.push({ code: "load_shed", level: 1, text: `Island: ${d.shedKw.toFixed(1)} kW of consumption not covered` });
    if (socPct !== null && socPct < strategy.reservePct && strategy.mode !== "island")
      warnings.push({ code: "below_reserve", level: 1, text: `Batteries at ${socPct.toFixed(1)} % - below the ${strategy.reservePct} % outage reserve` });
    for (const x of wind) if (x.state === "storm") warnings.push({ code: `storm_${x.item.nodeId}`, level: 1, text: `${x.item.name}: braked - the wind is over its cut-out speed` });
    if (d.curtailedKw > 0.01) warnings.push({ code: "curtailed", level: 1, text: `${d.curtailedKw.toFixed(1)} kW of generation held back - no room in the batteries${strategy.exportAllowed ? " and the export at its limit" : ", export not allowed"}` });
    if (config.weatherProcessId && !weather) warnings.push({ code: "no_forecast", level: 1, text: "No weather forecast - the simulated generation is 0" });
    await apiClient.syncMessages(process.id, "error", errors);
    await apiClient.syncMessages(process.id, "warning", warnings);
    await apiClient.setCritical(process.id, errors.length > 0);
    await apiClient.setWarning(process.id, warnings.length > 0);

    // --- metrics -------------------------------------------------------------
    const group = (g: string | undefined) => g ?? "";
    const groups = (config.groups ?? []).map((g) => ({
      key: g.key,
      name: g.name,
      block: g.block ?? "generation",
      pvKw: r(pv.filter((x) => group(x.item.group) === g.key).reduce((a, x) => a + x.kw, 0)),
      windKw: r(wind.filter((x) => group(x.item.group) === g.key).reduce((a, x) => a + x.kw, 0)),
    }));
    const values: Record<string, number> = {
      "field.pvKw": r(pv.reduce((a, x) => a + x.kw, 0), 3),
      "field.windKw": r(wind.reduce((a, x) => a + x.kw, 0), 3),
      "field.loadKw": r(loadKw, 3),
      "field.batteryKw": r(d.batteryKw, 3),
      "field.gridKw": r(d.gridKw, 3),
    };
    if (socPct !== null) values["field.socPct"] = r(socPct, 1);
    for (const x of subMeters) values[`field.meter.${x.item.nodeId}.kw`] = r(x.kw, 3);
    if (!st.declared) {
      try {
        await apiClient.declareSeries(process.id, [
          { valueKey: "field.pvKw", name: "PV generation", unit: "kW", kind: "gauge", mode: "period", periodS: 300 },
          { valueKey: "field.windKw", name: "Wind generation", unit: "kW", kind: "gauge", mode: "period", periodS: 300 },
          { valueKey: "field.loadKw", name: "Consumption", unit: "kW", kind: "gauge", mode: "period", periodS: 300 },
          { valueKey: "field.batteryKw", name: "Battery (+ discharge / - charge)", unit: "kW", kind: "gauge", mode: "period", periodS: 300 },
          { valueKey: "field.gridKw", name: "Grid (+ import / - export)", unit: "kW", kind: "gauge", mode: "period", periodS: 300 },
          { valueKey: "field.socPct", name: "Battery state of charge", unit: "%", kind: "gauge", mode: "period", periodS: 300 },
          ...subMeters.map((x) => ({ valueKey: `field.meter.${x.item.nodeId}.kw`, name: `${x.item.name} - power`, unit: "kW", kind: "gauge", mode: "period", periodS: 300 })),
        ]);
        st.declared = true;
      } catch (err) {
        logger.warn({ processId: process.id, err }, "energy-field: failed to declare the series");
      }
    }
    await apiClient.setMetrics(process.id, {
      mode: strategy.mode,
      decision: d.decision,
      strategy: { reservePct: strategy.reservePct, exportAllowed: strategy.exportAllowed, gridChargeAllowed: strategy.gridChargeAllowed, manualBatteryKw: strategy.manualBatteryKw },
      totals: { pvKw: values["field.pvKw"], windKw: values["field.windKw"], loadKw: values["field.loadKw"], batteryKw: values["field.batteryKw"], gridKw: values["field.gridKw"], curtailedKw: r(d.curtailedKw), shedKw: r(d.shedKw), socPct: socPct === null ? null : r(socPct, 1) },
      price: slotNow ? { buyCtKwh: slotNow.buyCtKwh, sellCtKwh: slotNow.sellCtKwh, rank: rankNow === null ? null : r(rankNow) } : null,
      weather: weather ? { radiationWm2: r(weather.radiation, 0), temperatureC: r(weather.temperature, 1), windMs: r(weather.wind, 1) } : null,
      groups,
      pv: pv.map((x) => ({ nodeId: x.item.nodeId, name: x.item.name, group: x.item.group ?? null, kw: r(x.kw), on: x.on, kWp: x.item.kWp, todayKwh: r(st!.units.kwh[x.item.nodeId] ?? 0) })),
      wind: wind.map((x) => ({ nodeId: x.item.nodeId, name: x.item.name, group: x.item.group ?? null, kw: r(x.kw), rpm: r(x.rpm, 0), state: x.state, ratedKw: x.item.ratedKw, todayKwh: r(st!.units.kwh[x.item.nodeId] ?? 0) })),
      units: st.units,
      subMeters: subMeters.map((x) => ({
        nodeId: x.item.nodeId,
        name: x.item.name,
        kw: r(x.kw, 2),
        todayKwh: r(st!.units.kwh[x.item.nodeId] ?? 0),
        todayEur: r(st!.units.eur[x.item.nodeId] ?? 0),
      })),
      batteries: batteryView.map((b) => ({ nodeId: b.item.nodeId, name: b.item.name, group: b.item.group ?? null, kw: r(b.kw), socPct: r(b.soc, 1), voltage: r(b.voltage, 0), currentA: r(b.current, 1), on: b.on })),
      consumer: consumer ? { nodeId: consumer.nodeId, name: consumer.name, kw: r(loadKw), loadsKw: r(loadsKw), shedKw: r(d.shedKw) } : null,
      today: { ...Object.fromEntries(Object.entries(t).map(([k, v]) => [k, typeof v === "number" ? r(v, 2) : v])), selfSufficiencyPct: selfSufficiencyPct === null ? null : r(selfSufficiencyPct, 1) },
      // the critical states (alerts.ts) - the scene shows them red
      alerts: alertsOf({
        gridKw: Number(values["field.gridKw"]) || 0,
        loadKw,
        plan: planKw !== null ? planNow : null,
        maxImportKw: strategy.maxImportKw ?? null,
        peakLimitKw: ledgerProc?.config?.strategy?.peakLimitKw ?? null,
        pv: pv.filter((x) => x.on).map((x) => ({ nodeId: x.item.nodeId, kw: x.kw, acKw: x.item.acKw })),
        wind: wind.filter((x) => x.on).map((x) => ({ nodeId: x.item.nodeId, kw: x.kw, ratedKw: x.item.ratedKw })),
        batteries: batteryView.filter((b) => b.on).map((b) => ({ nodeId: b.item.nodeId, kw: b.kw, maxChargeKw: b.item.maxChargeKw, maxDischargeKw: b.item.maxDischargeKw })),
        config: config.alerts,
      }),
      values,
    });
  });
}
