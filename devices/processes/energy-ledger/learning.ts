/**
 * energy-ledger - the learning (L4), pure: every 15-minute slot's forecast
 * against what happened (a sample) -> the forecast's corrections (the PV's
 * and the wind's factor for the month, the consumption's by weekday and
 * hour), the forecast's accuracy; the day as it was for the review
 * (review.ts - the hindsight).
 */
import type { PlanBattery, PlanLimits, PlanSlot } from "./plan.ts";
import { planAll, type StrategyKey, type StrategyParams } from "./strategies.ts";

export interface Sample {
  t: number; // the slot's start
  hours: number; // how long it was recorded
  pvF: number; // forecast kW
  pvA: number; // actual kW (the slot's mean)
  windF: number;
  windA: number;
  loadF: number;
  loadA: number;
  buy: number; // ct/kWh
  sell: number;
  socStart: number; // the array's SoC at the slot's start
  batA?: number; // the array's actual power, the slot's mean (+ discharge / - charge; since 2026-10-25)
  weekday: number; // local 0 Sunday .. 6
  hour: number; // local 0..23
  month: number; // local 1..12
}

export interface Corrections {
  pvFactor: number; // actual / forecast PV - this month's
  windFactor: number;
  load: Record<string, number>; // "<weekday>-<hour>" -> kW to add to the forecast consumption
  samples: number;
  pvMonths: Record<string, number>; // month -> its PV factor (what the ledger learnt, for people)
}

export const NO_CORRECTIONS: Corrections = { pvFactor: 1, windFactor: 1, load: {}, samples: 0, pvMonths: {} };

const MIN_KW = 1; // a slot counts for a factor only when its forecast says something
const MIN_CELL = 2; // a weekday-hour needs as many samples before it corrects
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

/** The corrections from the samples (the last weeks'), for the month `month`. */
export function correctionsOf(samples: Sample[], month: number): Corrections {
  const ratio = (pick: (s: Sample) => [number, number], filter: (s: Sample) => boolean) => {
    let f = 0;
    let a = 0;
    for (const s of samples) {
      if (!filter(s)) continue;
      const [fv, av] = pick(s);
      if (fv < MIN_KW) continue;
      f += fv * s.hours;
      a += av * s.hours;
    }
    return f > 0 ? clamp(a / f, 0.5, 1.5) : null;
  };
  const pvMonths: Record<string, number> = {};
  for (const m of new Set(samples.map((s) => s.month))) {
    const r = ratio((s) => [s.pvF, s.pvA], (s) => s.month === m);
    if (r !== null) pvMonths[m] = r;
  }
  const cells = new Map<string, { sum: number; n: number }>();
  for (const s of samples) {
    const k = `${s.weekday}-${s.hour}`;
    const c = cells.get(k) ?? { sum: 0, n: 0 };
    c.sum += s.loadA - s.loadF;
    c.n += 1;
    cells.set(k, c);
  }
  const load: Record<string, number> = {};
  for (const [k, c] of cells) if (c.n >= MIN_CELL) load[k] = c.sum / c.n;
  return {
    pvFactor: pvMonths[month] ?? ratio((s) => [s.pvF, s.pvA], () => true) ?? 1,
    windFactor: ratio((s) => [s.windF, s.windA], () => true) ?? 1,
    load,
    samples: samples.length,
    pvMonths,
  };
}

/** The forecast's accuracy over samples: 1 - the error over the actual energy, %. */
export function accuracyOf(samples: Sample[]) {
  const acc = (f: (s: Sample) => number, a: (s: Sample) => number) => {
    let err = 0;
    let act = 0;
    for (const s of samples) {
      err += Math.abs(f(s) - a(s)) * s.hours;
      act += Math.abs(a(s)) * s.hours;
    }
    return act > 0.5 ? clamp((1 - err / act) * 100, 0, 100) : null;
  };
  return {
    generationPct: acc((s) => s.pvF + s.windF, (s) => s.pvA + s.windA),
    consumptionPct: acc((s) => s.loadF, (s) => s.loadA),
  };
}

/** The day as it was, as plan slots: the real generation, consumption and prices. */
export function actualSlots(samples: Sample[]): PlanSlot[] {
  return samples.map((s) => ({
    t: s.t,
    end: s.t + s.hours * 3_600_000,
    hours: s.hours,
    buyCtKwh: s.buy,
    sellCtKwh: s.sell,
    generationKw: s.pvA + s.windA,
    loadKw: s.loadA,
  }));
}
