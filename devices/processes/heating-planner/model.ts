/**
 * heating-planner - the plan's model, pure (no I/O; the process and the tests call it): for one
 * heating system, for every slot ahead (the Energy Ledger's - 15 minutes), how much heat (or cold)
 * its heat pumps make and with how many units - the least money over the horizon.
 *
 * - The need: each room's loss to the outside at its setpoint (`uaKwK` x the difference) less its
 *   gains (people, computers - the working hours); cooling - the other way round.
 * - The store: the tanks between `store.minC` and `store.maxC` (their average) and, below them,
 *   the rooms' comfort margin - each room may sit `comfortK` off its setpoint (its `capacityKwhK`
 *   x `comfortK`); one level, the tanks first, the rooms' margin last.
 * - The money: the electricity (the heat over the COP - the Carnot model at the tanks' temperature:
 *   a cooler store is cheaper to fill) at the slot's price - the Ledger's planned export first at
 *   its sell price (the sun's surplus), the rest at the buy price; a unit's start costs
 *   `startPenaltyEur` (the inrush, the wear), a running unit-hour `unitHourEur` (fewer units
 *   rather than more); all units at full power - `boostCtKwh` more per kWh of electricity (the peak);
 *   the rooms held off their setpoint - `comfortCtKwhH` per kWh of the margin used and hour (the
 *   margin is for the dear hours, not for always); the Ledger's signal 1 (hold off) - `holdOffCtKwh`
 *   more per kWh; the need not covered (below the comfort margin) - `SHORT_EUR` per kWh.
 * - The choices: n units at the comfort modulation (fewer, lower, longer), n units matching the need
 *   exactly (they modulate - between their lowest share and full), all of them at full power (the last
 *   resort), none; over the comfort modulation - the peak's `boostCtKwh`.
 * Dynamic programming over the store's level (`LEVELS` steps) and the units running (deterministic,
 * a few hundred thousand steps a system); the store's change at the horizon's end valued at the
 * horizon's mean cost of heat (a surplus discounted, a deficit at full).
 */
import { maxOutputKw, performance, type HeatPumpSpec, type Mode, type RoomSpec } from "../heating-control/model.ts";

export const WATER_KWH_PER_L_K = 0.001163;
const LEVELS = 60;
const SHORT_EUR = 2; // per kWh of the need not covered - over any price
const TERMINAL_DISCOUNT = 0.85;
const FLOW_OVER_STORE_K = 5; // the heat pump's flow over the store's average (heating; under it cooling)

export interface PlannerSlot {
  t: number;
  end: number;
  hours: number;
  buyCtKwh: number;
  sellCtKwh: number;
  cheapKw: number; // the electricity at the sell price (the Ledger's planned export)
  signal: 1 | 2 | 3; // the Ledger's heating signal (SG-Ready)
  outdoorC: number;
  minute: number; // the local minute of the day (the gains)
  weekday: number; // 0 - Sunday (the gains); a day note's type already in it (a holiday - 0, a working weekend - 3)
  setbackK?: number[]; // the day notes' closed rooms: each room's setpoint set back by this much (by the rooms' order)
}

export interface PlannerRoom {
  spec: RoomSpec;
  setpointC: number;
}

export interface PlannerSystem {
  mode: Mode;
  pumps: HeatPumpSpec[]; // the available units
  rooms: PlannerRoom[];
  tankPerK: number; // the tanks' kWh per kelvin together
  tankAvgC: number; // now
  store: { minC: number; maxC: number }; // the tanks' useful band (their average) in this mode
  comfortK: number;
  comfortModulation: number; // 0..1
  startPenaltyEur: number;
  unitHourEur: number;
  holdOffCtKwh: number;
  boostCtKwh: number;
  comfortCtKwhH: number;
  baselineTankC?: number; // the band control's tanks (the baseline's COP) - else the store's middle
}

export interface PlannedHeatSlot {
  t: number;
  needKw: number; // the rooms' need (heat or cold)
  heatKw: number; // the heat pumps' output (heat or cold, by its size)
  units: number;
  modulation: number;
  electricKw: number;
  storeKwh: number; // the store's level at the slot's end (the rooms' margin included)
  tankC: number; // the tanks' average at its end
  roomOffsetK: number; // the rooms off their setpoint at its end (heating - below, cooling - above), 0..comfortK
  costEur: number; // the plan's money - the electricity and its penalties (starts, unit-hours, hold-off, shortage)
  energyEur: number; // its electricity alone
  baselineEur: number; // the same need's electricity made when needed, at a mid-band store (the band control's)
  baselineKw: number; // that electricity's power (a strategy's plan re-priced at the real prices)
}

export interface HeatPlan {
  slots: PlannedHeatSlot[];
  costEur: number;
  energyEur: number;
  baselineEur: number;
  savingEur: number; // the baseline's electricity less the plan's
  storeKwh: number; // the store's size (the rooms' margin included)
  marginKwh: number; // its rooms' part
}

/** The rooms' need now (kW, heat or cold by its size); `setbackK` - each room's set back (a closed room). */
export function needKw(mode: Mode, rooms: PlannerRoom[], outdoorC: number, minute: number, weekday: number, setbackK: number[] = []): number {
  const working = weekday >= 1 && weekday <= 5 && minute >= 7 * 60 && minute < 19 * 60;
  return rooms.reduce((a, r, i) => {
    const gains = r.spec.gainsKw * (working ? 1 : 0.15);
    const setpointC = r.setpointC + (mode === "heating" ? -1 : 1) * (setbackK[i] ?? 0);
    const loss = r.spec.uaKwK * (mode === "heating" ? setpointC - outdoorC : outdoorC - setpointC);
    return a + Math.max(0, mode === "heating" ? loss - gains : loss + gains);
  }, 0);
}

/** The electricity's money for `kw` over `hours`: the cheap part (the surplus) at the sell price, the rest at the buy price. */
const electricityEur = (s: PlannerSlot, kw: number, hours: number) => {
  const cheap = Math.min(kw, Math.max(0, s.cheapKw));
  return ((cheap * s.sellCtKwh + (kw - cheap) * s.buyCtKwh) * hours) / 100;
};

/** The plan of one system over the slots. */
export function planHeating(sys: PlannerSystem, slots: PlannerSlot[]): HeatPlan {
  const heating = sys.mode === "heating";
  const marginKwh = sys.rooms.reduce((a, r) => a + r.spec.capacityKwhK, 0) * sys.comfortK;
  const tankKwh = Math.max(0, sys.tankPerK * (sys.store.maxC - sys.store.minC));
  const size = marginKwh + tankKwh;
  const empty = { slots: [], costEur: 0, energyEur: 0, baselineEur: 0, savingEur: 0, storeKwh: size, marginKwh };
  if (!slots.length || size <= 0) return empty;
  const step = size / LEVELS;
  // the store's level: the rooms' margin at the bottom, the tanks above it
  const stored = heating ? sys.tankAvgC - sys.store.minC : sys.store.maxC - sys.tankAvgC;
  const start = Math.max(0, Math.min(size, marginKwh + sys.tankPerK * stored));
  const tankAt = (level: number) => {
    const k = sys.tankPerK > 0 ? Math.max(0, level - marginKwh) / sys.tankPerK : 0;
    return heating ? sys.store.minC + k : sys.store.maxC - k;
  };
  const capK = sys.rooms.reduce((a, r) => a + r.spec.capacityKwhK, 0);
  const offsetAt = (level: number) => (capK > 0 ? Math.max(0, marginKwh - level) / capK : 0);
  const reference = sys.pumps[0];
  const copAt = (outdoorC: number, level: number) =>
    reference ? performance(reference, sys.mode, outdoorC, tankAt(level) + (heating ? FLOW_OVER_STORE_K : -FLOW_OVER_STORE_K)) : 1;
  const units = sys.pumps.length;
  const midLevel = marginKwh + tankKwh / 2;

  // each slot's choices: [units, modulation]
  const choicesOf = (s: PlannerSlot, need: number) => {
    const outputs = sys.pumps.map((p) => maxOutputKw(p, sys.mode, s.outdoorC));
    const out: { n: number; mod: number; kw: number }[] = [{ n: 0, mod: 0, kw: 0 }];
    for (let n = 1; n <= units; n++) {
      const lowest = sys.pumps[n - 1].minModulation ?? 0.3;
      const full = outputs.slice(0, n).reduce((a, b) => a + b, 0);
      const mod = Math.max(lowest, sys.comfortModulation);
      out.push({ n, mod, kw: full * mod });
      const match = full > 0 ? need / full : 0;
      if (match >= lowest && match <= 1 && Math.abs(match - mod) > 0.02) out.push({ n, mod: match, kw: need });
    }
    if (units && sys.comfortModulation < 1) out.push({ n: units, mod: 1, kw: outputs.reduce((a, b) => a + b, 0) });
    return out;
  };
  const needs = slots.map((s) => needKw(sys.mode, sys.rooms, s.outdoorC, s.minute, s.weekday, s.setbackK));
  const choices = slots.map((s, i) => choicesOf(s, needs[i]));

  // the heat's mean cost over the horizon (the terminal value of the store's change)
  const meanCt = slots.reduce((a, s) => a + s.buyCtKwh, 0) / slots.length;
  const meanCop = slots.reduce((a, s) => a + copAt(s.outdoorC, midLevel), 0) / slots.length;
  const heatEurKwh = meanCt / 100 / Math.max(1, meanCop);

  // one step: the money and the next level from (level, units before) by a choice
  const move = (i: number, level: number, before: number, c: { n: number; mod: number; kw: number }) => {
    const s = slots[i];
    let next = level + (c.kw - needs[i]) * s.hours;
    let eur = 0;
    if (next > size + 1e-9) return null; // no room to store it - not this choice
    if (next < 0) {
      eur += -next * SHORT_EUR;
      next = 0;
    }
    const electric = c.kw > 0 ? c.kw / copAt(s.outdoorC, (level + next) / 2) : 0;
    const energy = electricityEur(s, electric, s.hours);
    eur += energy;
    if (s.signal === 1) eur += (electric * s.hours * sys.holdOffCtKwh) / 100;
    if (c.n > 0 && c.mod > sys.comfortModulation + 1e-9) eur += (electric * s.hours * sys.boostCtKwh) / 100;
    // the rooms' margin in use over the slot (its mean)
    const used = Math.max(0, marginKwh - (level + next) / 2);
    eur += (used * s.hours * sys.comfortCtKwhH) / 100;
    eur += Math.max(0, c.n - before) * sys.startPenaltyEur + c.n * s.hours * sys.unitHourEur;
    return { next, eur, electric, energy };
  };

  // backward: value[level][units] - the least money from slot i on
  const L = LEVELS + 1;
  const N = units + 1;
  let value = new Float64Array(L * N);
  // the store's change at the end: a surplus worth the mean heat (discounted - it may go unused), a
  // deficit to be made up at its full cost, the rooms' margin left in use - back to their setpoint
  const terminal = (level: number) => {
    const d = level - start;
    return (d > 0 ? -d * heatEurKwh * TERMINAL_DISCOUNT : -d * heatEurKwh) + (Math.max(0, marginKwh - level) * sys.comfortCtKwhH) / 100;
  };
  for (let l = 0; l < L; l++) for (let n = 0; n < N; n++) value[l * N + n] = terminal(l * step);
  const best: Int16Array[] = [];
  for (let i = slots.length - 1; i >= 0; i--) {
    const now = new Float64Array(L * N).fill(Infinity);
    const pick = new Int16Array(L * N).fill(0);
    for (let l = 0; l < L; l++) {
      for (let n = 0; n < N; n++) {
        choices[i].forEach((c, k) => {
          const m = move(i, l * step, n, c);
          if (!m) return;
          // the next level between two grid points - their values interpolated
          const x = m.next / step;
          const lo = Math.min(LEVELS, Math.floor(x));
          const hi = Math.min(LEVELS, lo + 1);
          const w = x - lo;
          const v = m.eur + (1 - w) * value[lo * N + c.n] + w * value[hi * N + c.n];
          if (v < now[l * N + n]) {
            now[l * N + n] = v;
            pick[l * N + n] = k;
          }
        });
      }
    }
    value = now;
    best[i] = pick;
  }

  // forward from now: the exact level (not the grid's), the choice of its nearest grid point
  const out: PlannedHeatSlot[] = [];
  let level = start;
  let before = 0;
  let costEur = 0;
  let energyEur = 0;
  let baselineEur = 0;
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i];
    const l = Math.max(0, Math.min(LEVELS, Math.round(level / step)));
    let c = choices[i][best[i][l * N + before]];
    let m = move(i, level, before, c);
    if (!m) {
      // the exact level a bit above the grid's - the next smaller choice that fits
      const fits = choices[i].filter((x) => x.kw <= c.kw).reverse().map((x) => [x, move(i, level, before, x)] as const).find(([, y]) => y);
      [c, m] = fits ? [fits[0], fits[1]!] : [choices[i][0], move(i, level, before, choices[i][0])!];
    }
    const baseCop =
      reference && sys.baselineTankC !== undefined
        ? performance(reference, sys.mode, s.outdoorC, sys.baselineTankC + (heating ? FLOW_OVER_STORE_K : -FLOW_OVER_STORE_K))
        : copAt(s.outdoorC, midLevel);
    const baseKw = needs[i] > 0 ? needs[i] / baseCop : 0;
    const base = baseKw > 0 ? electricityEur(s, baseKw, s.hours) : 0;
    costEur += m.eur;
    energyEur += m.energy;
    baselineEur += base;
    out.push({
      t: s.t,
      needKw: needs[i],
      heatKw: c.kw,
      units: c.n,
      modulation: c.mod,
      electricKw: m.electric,
      storeKwh: m.next,
      tankC: tankAt(m.next),
      roomOffsetK: offsetAt(m.next),
      costEur: m.eur,
      energyEur: m.energy,
      baselineEur: base,
      baselineKw: baseKw,
    });
    level = m.next;
    before = c.n;
  }
  return { slots: out, costEur, energyEur, baselineEur, savingEur: baselineEur - energyEur, storeKwh: size, marginKwh };
}
