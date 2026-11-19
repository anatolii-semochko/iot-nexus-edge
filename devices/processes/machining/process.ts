/**
 * "machining" process kind - the blanks and the CNC machining of a job shop (CORE Library package
 * devices/processes/machining/; the metal shop of the demo, iot AGENTS_TO_DO.md 2026-11-19, step 7): the band
 * saw (node type `band-saw`), the CNC machining centres (`cnc-machine`), the bar stock.
 *
 * Every `simulation.intervalSeconds` (default 10):
 *  1. the shift (`shift` - the weekdays' hours): off it everything stops; at its start the stock under its
 *     minimum is delivered (`materials[].lotM`);
 *  2. the saw (model.ts sawStep) cuts the blanks for the machine with the fewest in its buffer; each machine
 *     (machineStep) runs its jobs in turn - the setup, the cycles while it has blanks, the tool's change;
 *  3. a simulated unit gets its readings (the power, the spindle's / the blade's speed); the switches written
 *     (AUTO): the saw's cutting, each machine's cycle;
 *  4. today's account (the parts, the cuts, the kWh), OEE (the quality from QC - `qcProcessId`), WEM (a
 *     material under its minimum, a machine's tool alarm), metrics (the panel), series `mach.*`.
 */
import { localParts } from "../../lib/localTime.ts";
import { wem } from "../../lib/wem.ts";
import { deliver, machineStep, oee, sawStep, type Job, type Machine, type Material, type Saw, type ShopSpec } from "./model.ts";

const DEFAULT_INTERVAL_S = 10;
const SPEC: ShopSpec = { cutS: 45, kerfMm: 3, bufferMax: 12, toolLifeMin: 240, toolChangeMin: 8, performance: 0.95 };
// the electric power by the state, kW (a running cycle - its base plus the cut's wave); the speeds
const POWER = { run: 4.5, runWave: 3, setup: 1.2, idle: 0.9, alarm: 0.9, off: 0 };
const SAW_KW = { cutting: 3.2, idle: 0.3 };
const SPINDLE_RPM = 8000;
const BLADE_RPM = 1450;

interface Unit {
  nodeId?: number;
  devices?: Record<string, number>;
}

interface MachiningConfig {
  timeZone?: string;
  qcProcessId?: number;
  shift?: { fromH: number; toH: number; days: number[] };
  spec?: Partial<ShopSpec>;
  materials?: Material[];
  jobs?: Job[];
  machines?: (Unit & { name: string; startJob?: number })[];
  saw?: Unit;
  simulation?: { intervalSeconds?: number };
}

const r = (x: number, d = 2) => Math.round(x * 10 ** d) / 10 ** d;

const freshMachine = (name: string, job: number): Machine => ({
  name,
  state: "off",
  job,
  done: 0,
  blanks: 0,
  cycleLeftS: 0,
  setupLeftS: 0,
  alarmLeftS: 0,
  toolLeftMin: SPEC.toolLifeMin,
  runS: 0,
  plannedS: 0,
  parts: 0,
});

export default function registerMachining(register: any, { apiClient, logger, stepDue }: any): void {
  const systemTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const states = new Map<
    number,
    { lastRun: number; date: string; onShift: boolean | null; stock: Material[]; machines: Machine[]; saw: Saw; kwh: number; declared: boolean }
  >();

  register("machining", async (process: any) => {
    const now = Date.now();
    const config: MachiningConfig = process.config ?? {};
    const intervalMs = (config.simulation?.intervalSeconds ?? DEFAULT_INTERVAL_S) * 1000;
    let st = states.get(process.id);
    if (st && !stepDue(process.id, intervalMs, st.lastRun, now)) return;
    const local = localParts(now, config.timeZone || systemTimeZone);
    const spec: ShopSpec = { ...SPEC, ...(config.spec ?? {}) };
    const jobs = config.jobs ?? [];
    const units = config.machines ?? [];
    if (!jobs.length || !units.length) {
      await apiClient.syncMessages(process.id, "warning", [{ code: "not_configured", level: 1, ...wem("No machines or no jobs - nothing runs") }]);
      await apiClient.setWarning(process.id, true);
      return;
    }
    if (!st) {
      // the stock, the machines and the day's account survive a restart (the last metrics)
      const m = process.metrics ?? {};
      const today = m.today?.date === local.date;
      const savedStock = new Map<string, number>((m.stock ?? []).map((s: any) => [s.key, Number(s.stockM)]));
      const savedMachines = new Map<string, any>((m.machines ?? []).map((x: any) => [x.name, x]));
      st = {
        lastRun: 0,
        date: local.date,
        onShift: null,
        stock: (config.materials ?? []).map((s) => ({ ...s, stockM: Number.isFinite(savedStock.get(s.key)) ? savedStock.get(s.key)! : s.stockM })),
        machines: units.map((u, i) => {
          const fresh = freshMachine(u.name, (u.startJob ?? i) % jobs.length);
          const x = savedMachines.get(u.name);
          if (!x?.raw) return fresh;
          const raw = { ...fresh, ...x.raw };
          return today ? raw : { ...raw, runS: 0, plannedS: 0, parts: 0 };
        }),
        saw: { cutting: null, cutLeftS: 0, cuts: today ? Number(m.saw?.cuts) || 0 : 0 },
        kwh: today ? Number(m.today?.kwh) || 0 : 0,
        declared: false,
      };
      states.set(process.id, st);
    }
    const seconds = st.lastRun ? Math.min(intervalMs * 3, now - st.lastRun) / 1000 : intervalMs / 1000;
    st.lastRun = now;
    if (st.date !== local.date) {
      st.date = local.date;
      st.saw.cuts = 0;
      st.kwh = 0;
      for (const m of st.machines) Object.assign(m, { runS: 0, plannedS: 0, parts: 0 });
    }

    // 1. the shift, the deliveries at its start
    const shift = config.shift ?? { fromH: 6, toH: 22, days: [1, 2, 3, 4, 5] };
    const onShift = shift.days.includes(local.weekday) && local.hour >= shift.fromH && local.hour < shift.toH;
    const delivered = st.onShift === false && onShift ? deliver(st.stock) : [];
    st.onShift = onShift;

    // 2. the saw and the machines
    sawStep(spec, st.saw, st.machines, jobs, st.stock, seconds, onShift);
    let parts = 0;
    for (const m of st.machines) parts += machineStep(spec, m, jobs, seconds, onShift);
    const wave = (k: number) => Math.abs(Math.sin(now / 23_000 + k * 1.7));
    const machineKw = st.machines.map((m, k) => (m.state === "run" ? POWER.run + POWER.runWave * wave(k) : POWER[m.state]));
    const sawKw = st.saw.cutting ? SAW_KW.cutting : onShift ? SAW_KW.idle : 0;
    const powerKw = sawKw + machineKw.reduce((a, b) => a + b, 0);
    st.kwh += (powerKw * seconds) / 3600;

    // 3. readings and switches
    const nodes = new Map<number, any>((await apiClient.listNodes()).map((n: any) => [n.id, n]));
    const sim = (u?: Unit) => u?.nodeId !== undefined && nodes.get(u.nodeId)?.simulated === true;
    const writes: { id: number; value: unknown }[] = [];
    const auto: Promise<unknown>[] = [];
    const sawU = config.saw;
    if (sim(sawU)) {
      if (typeof sawU?.devices?.power === "number") writes.push({ id: sawU.devices.power, value: r(sawKw, 2) });
      if (typeof sawU?.devices?.speed === "number") writes.push({ id: sawU.devices.speed, value: st.saw.cutting ? BLADE_RPM : 0 });
    }
    if (typeof sawU?.devices?.relay === "number") auto.push(apiClient.setDeviceAuto(sawU.devices.relay, st.saw.cutting !== null));
    units.forEach((u, k) => {
      const m = st!.machines[k];
      if (sim(u)) {
        if (typeof u.devices?.power === "number") writes.push({ id: u.devices.power, value: r(machineKw[k], 2) });
        if (typeof u.devices?.speed === "number")
          writes.push({ id: u.devices.speed, value: m.state === "run" ? Math.round(SPINDLE_RPM * (0.8 + 0.2 * wave(k))) : 0 });
      }
      if (typeof u.devices?.cycle === "number") auto.push(apiClient.setDeviceAuto(u.devices.cycle, m.state === "run"));
    });
    await Promise.allSettled([writes.length ? apiClient.simulateDevices(writes) : Promise.resolve(), ...auto]);

    // 4. OEE (the quality from QC), WEM, metrics, series
    const qc = config.qcProcessId ? (await apiClient.listProcesses()).find((p: any) => p.id === config.qcProcessId)?.metrics : null;
    const quality = 1 - (Number(qc?.today?.rejectsPct) || 0) / 100;
    const warnings: any[] = [];
    for (const s of st.stock)
      if (s.stockM < s.minM)
        warnings.push({ code: `stock_${s.key}`, level: 1, ...wem("{{name}} - {{m}} m in stock, its minimum {{min}} m", { name: s.name, m: r(s.stockM, 1), min: s.minM }) });
    for (const m of st.machines)
      if (m.state === "alarm") warnings.push({ code: `tool_${m.name}`, level: 1, ...wem("{{name}} - the tool is worn, its change", { name: m.name }) });
    await apiClient.syncMessages(process.id, "warning", warnings);
    await apiClient.setWarning(process.id, warnings.length > 0);
    if (!st.declared) {
      try {
        await apiClient.declareSeries(process.id, [
          { valueKey: "mach.powerKw", name: "Machining - electricity", unit: "kW", kind: "gauge", mode: "period", periodS: 300 },
          { valueKey: "mach.parts", name: "Machining - parts today", unit: "", kind: "gauge", mode: "period", periodS: 300 },
          ...units.map((u, k) => ({ valueKey: `mach.m${k}.powerKw`, name: `${u.name} - electricity`, unit: "kW", kind: "gauge", mode: "period", periodS: 300 })),
        ]);
        st.declared = true;
      } catch (err) {
        logger.warn({ processId: process.id, err }, "machining: failed to declare the series");
      }
    }
    const partsToday = st.machines.reduce((a, m) => a + m.parts, 0);
    const oees = st.machines.map((m) => oee(spec, m, quality));
    const values: Record<string, number> = { "mach.powerKw": r(powerKw, 2), "mach.parts": partsToday };
    machineKw.forEach((kw, k) => (values[`mach.m${k}.powerKw`] = r(kw, 2)));
    await apiClient.setMetrics(process.id, {
      onShift,
      powerKw: r(powerKw, 2),
      saw: { cutting: st.saw.cutting, cuts: st.saw.cuts, powerKw: r(sawKw, 2) },
      stock: st.stock.map((s) => ({ key: s.key, name: s.name, stockM: r(s.stockM, 2), minM: s.minM })),
      delivered,
      machines: st.machines.map((m, k) => {
        const job = jobs[m.job];
        return {
          name: m.name,
          state: m.state,
          program: job?.program,
          part: job?.part,
          done: m.done,
          qty: job?.qty,
          blanks: m.blanks,
          cycleS: job?.cycleS,
          cycleLeftS: m.state === "run" ? Math.max(0, Math.round(m.cycleLeftS)) : null,
          setupLeftMin: m.state === "setup" ? r(m.setupLeftS / 60, 1) : null,
          toolLeftMin: Math.round(m.toolLeftMin),
          powerKw: r(machineKw[k], 2),
          parts: m.parts,
          oeePct: Math.round(oees[k] * 100),
          raw: { ...m },
        };
      }),
      today: { date: local.date, parts: partsToday, finished: parts, cuts: st.saw.cuts, kwh: r(st.kwh, 2), oeePct: Math.round((oees.reduce((a, b) => a + b, 0) / oees.length) * 100) },
      values,
    });
  });
}
