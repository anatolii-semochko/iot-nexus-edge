/**
 * energy-ledger - the day's review (iot AGENTS_TO_DO.md 2026-10-25, stage A),
 * pure: what the day was (its type, its prices), what it cost against the
 * best it could have cost, why (the forecast or the strategy) and what to do
 * next time - the strategy and the parameters (the reserve, charging from the
 * grid) that would have saved money. Deterministic, no AI: the system makes
 * its own decisions without one (autonomy); the AI adds its words on top.
 *
 * Every figure is the plan's money (purchases - sales + the batteries' wear)
 * on the day's real generation, consumption and prices, the energy left in
 * the batteries at the day's end valued at the day's median purchase price -
 * so a plan that ends fuller is not counted as dearer.
 */
import { actualSlots, type Sample } from "./learning.ts";
import { optimise, slotMoney, type PlanBattery, type PlanLimits, type PlanSlot } from "./plan.ts";
import { shape, STRATEGIES, type StrategyKey, type StrategyParams } from "./strategies.ts";

export interface DayPrices {
  minCt: number;
  avgCt: number; // time-weighted
  maxCt: number;
  spreadCt: number;
  sellAvgCt: number;
}

export interface ReviewParam {
  key: "reservePct" | "gridChargeAllowed";
  from: number | boolean;
  to: number | boolean;
  gainEur: number;
}

export interface DayReview {
  actualEur: number | null; // the day as it ran (null - an older day without the batteries' actual power)
  ran: StrategyKey;
  ranEur: number; // the strategy it ran, had the forecast been perfect
  best: StrategyKey;
  bestEur: number; // the best strategy with a perfect forecast
  eur: Record<string, number>; // every strategy's, with a perfect forecast (the hindsight)
  regretEur: number | null; // actual - best: what the day could have saved
  forecastEur: number | null; // actual - ran: the forecast's (and the execution's) part
  strategyEur: number; // ran - best: the strategy's part
  forecast: Record<"pv" | "wind" | "load", { forecastKwh: number; actualKwh: number }>;
  params: ReviewParam[];
  recommendation: { strategy: StrategyKey | null; params: ReviewParam[]; reasons: string[] };
}

export interface ReviewInput {
  samples: Sample[];
  battery: Omit<PlanBattery, "socPct">;
  limits: PlanLimits;
  params: StrategyParams;
  ran: StrategyKey;
  socEndPct: number | null; // the array's SoC when the day closed
  reserveFloorPct: number; // the lowest reserve a recommendation may suggest (the field's socMinPct)
  reservePct: number; // the reserve in force (the field's strategy)
  minGainEur: number; // a recommendation only for more than this
  gridOffAt?: (t: number) => boolean; // an outage's slots (the day's notes) - islanded as the plan did
}

const RESERVE_STEP_PCT = 10;
const MIN_SAMPLES = 8;
const round2 = (x: number) => Math.round(x * 100) / 100;
const nameOf = (k: StrategyKey) => STRATEGIES.find((x) => x.key === k)?.name ?? k;

/** The day's prices from its samples (time-weighted). */
export function dayPrices(samples: Sample[]): DayPrices | null {
  const hours = samples.reduce((a, s) => a + s.hours, 0);
  if (!samples.length || hours <= 0) return null;
  const buys = samples.map((s) => s.buy);
  const minCt = Math.min(...buys);
  const maxCt = Math.max(...buys);
  return {
    minCt: round2(minCt),
    avgCt: round2(samples.reduce((a, s) => a + s.buy * s.hours, 0) / hours),
    maxCt: round2(maxCt),
    spreadCt: round2(maxCt - minCt),
    sellAvgCt: round2(samples.reduce((a, s) => a + s.sell * s.hours, 0) / hours),
  };
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s[(s.length - 1) >> 1] + s[s.length >> 1]) / 2 : 0;
};

/** The review of a closed day; null - too few samples to judge. */
export function reviewDay(input: ReviewInput): DayReview | null {
  const { samples, battery, limits, params, ran, socEndPct, minGainEur } = input;
  if (samples.length < MIN_SAMPLES) return null;
  const sorted = [...samples].sort((a, b) => a.t - b.t);
  const slots: PlanSlot[] = actualSlots(sorted).map((x) => (input.gridOffAt?.(x.t + (x.end - x.t) / 2) ? { ...x, gridOff: true } : x));
  const socStart = sorted[0].socStart;
  const medianCt = median(slots.map((s) => s.buyCtKwh));
  // the energy left at the day's end, as it could be sold back to the site tomorrow
  const leftEur = (socEnd: number) => ((socEnd - socStart) / 100) * battery.capacityKwh * battery.efficiency * (medianCt / 100);
  // the real money - the optimiser's steering penalties (over the import limit, the peak) aren't money
  const money = (kw: number[], l: PlanLimits) => slots.reduce((a, s, i) => a + slotMoney(s, kw[i], { ...l, peakLimitKw: null, maxImportKw: null }).eur, 0);

  /** A strategy planned on the real day from its first SoC - its money. */
  const planned = (key: StrategyKey, l: PlanLimits) => {
    const shaped = shape(key, slots, l, params);
    const plan = optimise(shaped.slots, { ...battery, socPct: socStart }, shaped.limits);
    return money(plan.map((x) => x.batteryKw), l) - leftEur(plan[plan.length - 1].socPct);
  };

  const keys = STRATEGIES.map((x) => x.key).filter((k) => !(k === "peakShaving" && params.peakLimitKw === null));
  const eurs = new Map(keys.map((k) => [k, planned(k, limits)]));
  const best = [...eurs.entries()].sort((a, b) => a[1] - b[1])[0];
  const ranEur = eurs.get(ran) ?? planned(ran, limits);

  const withActual = sorted.every((s) => Number.isFinite(s.batA));
  const actualEur = withActual && socEndPct !== null ? money(sorted.map((s) => s.batA as number), limits) - leftEur(socEndPct) : null;

  const kwh = (f: (s: Sample) => number) => round2(sorted.reduce((a, s) => a + f(s) * s.hours, 0));
  const forecast = {
    pv: { forecastKwh: kwh((s) => s.pvF), actualKwh: kwh((s) => s.pvA) },
    wind: { forecastKwh: kwh((s) => s.windF), actualKwh: kwh((s) => s.windA) },
    load: { forecastKwh: kwh((s) => s.loadF), actualKwh: kwh((s) => s.loadA) },
  };

  // the parameters - on the best strategy: what a lower reserve, charging from the grid would have saved
  const params_: ReviewParam[] = [];
  const lowerReserve = Math.max(input.reserveFloorPct, input.reservePct - RESERVE_STEP_PCT);
  if (lowerReserve < input.reservePct) {
    const gain = best[1] - planned(best[0], { ...limits, socMinPct: lowerReserve });
    if (gain > minGainEur) params_.push({ key: "reservePct", from: input.reservePct, to: lowerReserve, gainEur: round2(gain) });
  }
  if (!limits.gridChargeAllowed) {
    const gain = best[1] - planned(best[0], { ...limits, gridChargeAllowed: true });
    if (gain > minGainEur) params_.push({ key: "gridChargeAllowed", from: false, to: true, gainEur: round2(gain) });
  }

  const strategyEur = ranEur - best[1];
  const forecastEur = actualEur === null ? null : actualEur - ranEur;
  const regretEur = actualEur === null ? null : actualEur - best[1];

  const reasons: string[] = [];
  const strategy = best[0] !== ran && strategyEur > minGainEur ? best[0] : null;
  if (strategy) reasons.push(`"${nameOf(strategy)}" would have cost ${round2(strategyEur).toFixed(2)} EUR less than "${nameOf(ran)}"`);
  if (forecastEur !== null && forecastEur > minGainEur) {
    // the forecast's largest miss in energy - where the money went
    const misses = (["pv", "wind", "load"] as const)
      .map((k) => ({ k, f: forecast[k].forecastKwh, a: forecast[k].actualKwh }))
      .sort((x, y) => Math.abs(y.a - y.f) - Math.abs(x.a - x.f));
    const m = misses[0];
    const label = { pv: "PV", wind: "wind", load: "consumption" }[m.k];
    const pct = m.f > 0 ? Math.round(((m.a - m.f) / m.f) * 100) : null;
    reasons.push(
      `The forecast cost ${round2(forecastEur).toFixed(2)} EUR: ${label} ${m.f.toFixed(0)} kWh forecast, ${m.a.toFixed(0)} kWh actual${pct === null ? "" : ` (${pct > 0 ? "+" : ""}${pct} %)`}`,
    );
  }
  for (const p of params_)
    reasons.push(
      p.key === "reservePct"
        ? `A reserve of ${p.to} % instead of ${p.from} % would have saved ${p.gainEur.toFixed(2)} EUR - only if the outage risk allows it`
        : `Charging from the grid would have saved ${p.gainEur.toFixed(2)} EUR`,
    );
  if (!reasons.length) reasons.push("The day ran close to the best it could");

  return {
    actualEur: actualEur === null ? null : round2(actualEur),
    ran,
    ranEur: round2(ranEur),
    best: best[0],
    bestEur: round2(best[1]),
    eur: Object.fromEntries([...eurs.entries()].map(([k, v]) => [k, round2(v)])),
    regretEur: regretEur === null ? null : round2(regretEur),
    forecastEur: forecastEur === null ? null : round2(forecastEur),
    strategyEur: round2(strategyEur),
    forecast,
    params: params_,
    recommendation: { strategy, params: params_, reasons },
  };
}
