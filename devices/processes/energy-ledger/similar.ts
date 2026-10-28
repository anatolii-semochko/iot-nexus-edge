/**
 * energy-ledger - the similar days (iot AGENTS_TO_DO.md 2026-10-25, stage C),
 * pure: a day's features (the sun, the wind, the temperature, working or not,
 * the prices' level and spread, the season), the recorded days nearest to a
 * day (today - from the forecast), the nearest ones ordered by how well they
 * went (the least left on the table, then the largest saving), and what they
 * say for the day: the strategy best on most of them (weighted by nearness),
 * the parameters their reviews recommend. The ledger's selection "analog"
 * applies that strategy on its own - no AI needed.
 */
import type { DayReview } from "./review.ts";
import type { StrategyKey } from "./strategies.ts";

export interface DayFeatures {
  sunKwhM2: number | null;
  windAvgMs: number | null;
  tempMeanC: number | null;
  working: boolean | null;
  priceAvgCt: number | null;
  priceSpreadCt: number | null;
  month: number; // 1..12
}

export interface RecordedDay {
  day: string;
  data: Record<string, any>; // the ledger's day record (ledger_days.data)
  partial?: boolean;
  final?: boolean;
}

export interface SimilarDay {
  day: string;
  distance: number;
  features: DayFeatures;
  regretEur: number | null; // what it left on the table (its review)
  savedPct: number | null; // its saving against "without the system"
  best: StrategyKey | null; // its best strategy in hindsight
  ran: StrategyKey | null;
  recommendation: string[];
}

// a feature's scale - a difference of this much counts 1
const SCALES = { sunKwhM2: 1.5, windAvgMs: 2.5, tempMeanC: 5, priceAvgCt: 5, priceSpreadCt: 8, month: 2 };
const WORKING_MISMATCH = 1.5;
const DEFAULT_COUNT = 5;
const DEFAULT_MAX_DISTANCE = 3;
const MIN_ANALOGS = 3;
const MIN_SHARE = 0.5;

const weekdayWorking = (day: string) => {
  const w = new Date(`${day}T12:00:00Z`).getUTCDay();
  return w >= 1 && w <= 5;
};

/** A recorded day's features (its record; an older one without its type / prices - by its weekday / none). */
export function featuresOfRecord(day: string, d: Record<string, any>): DayFeatures {
  const mean = d.tempMinC !== null && d.tempMinC !== undefined && d.tempMaxC !== null && d.tempMaxC !== undefined ? (d.tempMinC + d.tempMaxC) / 2 : null;
  return {
    sunKwhM2: Number.isFinite(d.sunKwhM2) ? d.sunKwhM2 : null,
    windAvgMs: Number.isFinite(d.windAvgMs) ? d.windAvgMs : null,
    tempMeanC: mean,
    working: typeof d.dayType?.working === "boolean" ? d.dayType.working : weekdayWorking(day),
    priceAvgCt: Number.isFinite(d.prices?.avgCt) ? d.prices.avgCt : null,
    priceSpreadCt: Number.isFinite(d.prices?.spreadCt) ? d.prices.spreadCt : null,
    month: Number(day.slice(5, 7)),
  };
}

/**
 * A day ahead's features from the forecast: the hourly weather rows of its local day (radiation W/m²,
 * wind m/s, temperature C), its price slots, working or not (its notes).
 */
export function featuresOfForecast(
  day: string,
  weather: { t: number; radiationWm2?: number | null; windSpeedMs?: number | null; temperatureC?: number | null }[],
  prices: { t: number; minutes: number; buyCtKwh: number | null }[],
  working: boolean,
  localDateOf: (ms: number) => string,
): DayFeatures {
  const rows = weather.filter((x) => localDateOf(x.t) === day);
  const avg = (k: "windSpeedMs" | "temperatureC") => {
    const xs = rows.map((x) => x[k]).filter((v): v is number => Number.isFinite(v));
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
  };
  const rad = rows.map((x) => x.radiationWm2).filter((v): v is number => Number.isFinite(v));
  const slots = prices.filter((p) => p.buyCtKwh !== null && localDateOf(p.t) === day);
  const hours = slots.reduce((a, p) => a + p.minutes / 60, 0);
  const buys = slots.map((p) => p.buyCtKwh as number);
  return {
    // hourly rows - each W/m² for an hour
    sunKwhM2: rows.length >= 12 ? rad.reduce((a, b) => a + b, 0) / 1000 : null,
    windAvgMs: rows.length >= 12 ? avg("windSpeedMs") : null,
    tempMeanC: rows.length >= 12 ? avg("temperatureC") : null,
    working,
    priceAvgCt: hours >= 12 ? slots.reduce((a, p) => a + (p.buyCtKwh as number) * (p.minutes / 60), 0) / hours : null,
    priceSpreadCt: hours >= 12 ? Math.max(...buys) - Math.min(...buys) : null,
    month: Number(day.slice(5, 7)),
  };
}

/** How far two days are (the features both have; the season's circular distance). Infinity - nothing to compare. */
export function distance(a: DayFeatures, b: DayFeatures): number {
  let sum = 0;
  let n = 0;
  for (const k of ["sunKwhM2", "windAvgMs", "tempMeanC", "priceAvgCt", "priceSpreadCt"] as const) {
    const x = a[k];
    const y = b[k];
    if (x === null || y === null) continue;
    sum += ((x - y) / SCALES[k]) ** 2;
    n++;
  }
  if (n < 2) return Infinity; // the weather or the prices at least
  // the missing features don't make a day nearer: the compared ones' mean, as if all five were there
  let total = (sum / n) * 5;
  const months = Math.min(Math.abs(a.month - b.month), 12 - Math.abs(a.month - b.month));
  total += (months / SCALES.month) ** 2;
  if (a.working !== null && b.working !== null && a.working !== b.working) total += WORKING_MISMATCH ** 2;
  return Math.sqrt(total);
}

/** The recorded days nearest to `target` (closed, reviewed), the best-run ones first. */
export function similarDays(
  target: DayFeatures,
  days: RecordedDay[],
  opts: { count?: number; maxDistance?: number; exclude?: string } = {},
): SimilarDay[] {
  const count = opts.count ?? DEFAULT_COUNT;
  const maxDistance = opts.maxDistance ?? DEFAULT_MAX_DISTANCE;
  return days
    .filter((d) => d.final !== false && !d.partial && d.day !== opts.exclude && d.data?.hindsight?.best)
    .map((d) => {
      const features = featuresOfRecord(d.day, d.data);
      const review = d.data.review as DayReview | undefined;
      const without = d.data.allBoughtEur + d.data.heatDirectEur - d.data.heatCostEur;
      const paid = d.data.costEur - d.data.revenueEur;
      return {
        day: d.day,
        distance: distance(target, features),
        features,
        regretEur: review?.regretEur ?? (review ? review.strategyEur : null),
        savedPct: without > 0 ? Math.round(((without - paid) / without) * 1000) / 10 : null,
        best: (review?.best ?? d.data.hindsight?.best ?? null) as StrategyKey | null,
        ran: (d.data.strategy ?? null) as StrategyKey | null,
        recommendation: review?.recommendation?.reasons ?? [],
      };
    })
    .filter((d) => d.distance <= maxDistance)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, count)
    .sort((a, b) => (a.regretEur ?? Infinity) - (b.regretEur ?? Infinity) || (b.savedPct ?? -Infinity) - (a.savedPct ?? -Infinity));
}

export interface AnalogChoice {
  strategy: StrategyKey | null; // null - the analogs don't agree (or too few)
  share: number; // the winner's weight share
  reason: string;
  days: string[];
}

/** What the similar days say: the strategy best on most of them, weighted by nearness. */
export function analogChoice(analogs: SimilarDay[], names: Record<string, string> = {}): AnalogChoice {
  const days = analogs.map((a) => a.day);
  if (analogs.length < MIN_ANALOGS) return { strategy: null, share: 0, reason: `${analogs.length} similar day(s) recorded - too few to judge (${MIN_ANALOGS} needed)`, days };
  const weights = new Map<StrategyKey, number>();
  let total = 0;
  for (const a of analogs) {
    if (!a.best) continue;
    const w = 1 / (1 + a.distance);
    weights.set(a.best, (weights.get(a.best) ?? 0) + w);
    total += w;
  }
  const [top, w] = [...weights.entries()].sort((x, y) => y[1] - x[1])[0] ?? [null, 0];
  const share = total > 0 ? w / total : 0;
  const count = analogs.filter((a) => a.best === top).length;
  if (!top || share < MIN_SHARE) return { strategy: null, share, reason: `the ${analogs.length} similar days don't agree on a strategy`, days };
  return {
    strategy: top,
    share,
    reason: `"${names[top] ?? top}" was the best on ${count} of the ${analogs.length} most similar days (${days.join(", ")})`,
    days,
  };
}
