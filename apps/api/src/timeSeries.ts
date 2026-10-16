import { pool } from "./db.js";

// Reading the time series (migrations/1690000000060): a chart's points and
// a period's consumption - for the API's routes and the plugins (their
// context's `series`). A query picks its source by the bucket it needs:
// the raw points, or the hourly / daily continuous aggregates (TimescaleDB;
// without the extension - always the raw points), so a year's chart reads
// a few hundred rows. By kind: a gauge - the average in a bucket, a
// counter - its last value, a state - its value weighted by the time it
// held it.

export type SeriesKind = "gauge" | "counter" | "state";
interface SeriesRow {
  id: number;
  key: string;
  kind: SeriesKind;
}
export type Point = { t: number; v: number };

const HOUR_S = 3600;
const DAY_S = 86400;

let aggregates: boolean | null = null;
/** The continuous aggregates exist (TimescaleDB) - checked once. */
async function hasAggregates(): Promise<boolean> {
  if (aggregates === null) {
    const r = await pool.query("SELECT 1 FROM pg_matviews WHERE matviewname IN ('samples_hourly', 'samples_daily')");
    aggregates = r.rowCount === 2;
  }
  return aggregates;
}

async function seriesOf(keys: string[]): Promise<SeriesRow[]> {
  return (await pool.query<SeriesRow>("SELECT id, key, kind FROM series WHERE key = ANY($1::text[])", [keys])).rows;
}

/** The bucket a range needs for at most `points` points, seconds (a minute at least). */
const bucketOf = (from: number, to: number, points: number) => Math.max(60, Math.ceil((to - from) / 1000 / points));

// the source table for a bucket: raw under an hour, hourly under a day, daily above
async function sourceOf(bucketS: number): Promise<"raw" | "hourly" | "daily"> {
  if (!(await hasAggregates())) return "raw";
  return bucketS >= DAY_S ? "daily" : bucketS >= HOUR_S ? "hourly" : "raw";
}

/**
 * Points of the series `keys` between `from` and `to` (ms), at most about
 * `points` of each - { key: [{t, v}] } (t - the bucket's middle).
 */
export async function querySeries(keys: string[], from: number, to: number, points = 240): Promise<Record<string, Point[]>> {
  const out: Record<string, Point[]> = Object.fromEntries(keys.map((k) => [k, []]));
  const rows = await seriesOf(keys);
  const bucketS = bucketOf(from, to, points);
  const source = await sourceOf(bucketS);
  const keyOf = new Map(rows.map((r) => [r.id, r.key]));
  const mid = (b: Date) => b.getTime() + (bucketS * 1000) / 2;

  const averaged = rows.filter((r) => r.kind !== "state");
  if (averaged.length > 0) {
    const ids = averaged.map((r) => r.id);
    const counters = averaged.filter((r) => r.kind === "counter").map((r) => r.id);
    const sql =
      source === "raw"
        ? `SELECT series_id, date_bin(make_interval(secs => $4), t, to_timestamp($2 / 1000.0)) AS b,
                  CASE WHEN series_id = ANY($5::int[]) THEN (array_agg(v ORDER BY t DESC))[1] ELSE avg(v) END AS v
           FROM samples WHERE series_id = ANY($1::int[]) AND t >= to_timestamp($2 / 1000.0) AND t <= to_timestamp($3 / 1000.0)
           GROUP BY series_id, b ORDER BY b`
        : `SELECT series_id, date_bin(make_interval(secs => $4), bucket, to_timestamp($2 / 1000.0)) AS b,
                  CASE WHEN series_id = ANY($5::int[]) THEN (array_agg(v_last ORDER BY bucket DESC))[1]
                       ELSE sum(v_avg * n) / NULLIF(sum(n), 0) END AS v
           FROM samples_${source} WHERE series_id = ANY($1::int[]) AND bucket >= to_timestamp($2 / 1000.0) AND bucket <= to_timestamp($3 / 1000.0)
           GROUP BY series_id, b ORDER BY b`;
    const result = await pool.query<{ series_id: number; b: Date; v: number }>(sql, [ids, from, to, bucketS, counters]);
    for (const r of result.rows) if (r.v !== null) out[keyOf.get(r.series_id)!].push({ t: mid(r.b), v: Number(r.v) });
  }

  // a state: weighted by the time it held each value, from its raw steps
  for (const r of rows.filter((x) => x.kind === "state")) {
    const steps = await stateSteps(r.id, from, to);
    out[r.key] = timeWeighted(steps, from, to, bucketS * 1000);
  }
  return out;
}

// a state's steps in [from, to]: the one held at `from` first
async function stateSteps(seriesId: number, from: number, to: number): Promise<Point[]> {
  const result = await pool.query<{ t: Date; v: number }>(
    `(SELECT t, v FROM samples WHERE series_id = $1 AND t < to_timestamp($2 / 1000.0) ORDER BY t DESC LIMIT 1)
     UNION ALL
     (SELECT t, v FROM samples WHERE series_id = $1 AND t >= to_timestamp($2 / 1000.0) AND t <= to_timestamp($3 / 1000.0) ORDER BY t)`,
    [seriesId, from, to],
  );
  return result.rows.map((x) => ({ t: Math.max(from, x.t.getTime()), v: Number(x.v) }));
}

// each bucket's time-weighted average of a step function (no value before the first step)
function timeWeighted(steps: Point[], from: number, to: number, bucketMs: number): Point[] {
  const out: Point[] = [];
  const end = Math.min(to, Date.now());
  for (let b = from; b < end; b += bucketMs) {
    const be = Math.min(b + bucketMs, end);
    let area = 0;
    let covered = 0;
    for (let i = 0; i < steps.length; i++) {
      const s = Math.max(steps[i].t, b);
      const e = Math.min(i + 1 < steps.length ? steps[i + 1].t : end, be);
      if (e > s) {
        area += steps[i].v * (e - s);
        covered += e - s;
      }
    }
    if (covered > 0) out.push({ t: b + bucketMs / 2, v: area / covered });
  }
  return out;
}

/**
 * What the series `keys` added up to between `from` and `to` (ms): a
 * counter - its rise (a reset counts from its new zero); a state - its
 * integral over time in hours (a power in W -> Wh); a gauge - its average.
 */
export async function consumption(keys: string[], from: number, to: number): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  const rows = await seriesOf(keys);
  for (const r of rows) {
    if (r.kind === "state") {
      const steps = await stateSteps(r.id, from, to);
      const end = Math.min(to, Date.now());
      out[r.key] = steps.reduce((sum, s, i) => sum + (s.v * (Math.min(i + 1 < steps.length ? steps[i + 1].t : end, end) - s.t)) / 3_600_000, 0);
    } else if (r.kind === "counter") {
      const result = await pool.query<{ total: number }>(
        `SELECT COALESCE(sum(GREATEST(d, 0)), 0) AS total FROM (
           SELECT v - lag(v) OVER (ORDER BY t) AS d FROM samples
           WHERE series_id = $1 AND t >= to_timestamp($2 / 1000.0) AND t <= to_timestamp($3 / 1000.0)
         ) x`,
        [r.id, from, to],
      );
      out[r.key] = Number(result.rows[0].total) || 0;
    } else {
      const result = await pool.query<{ v: number }>(
        "SELECT avg(v) AS v FROM samples WHERE series_id = $1 AND t >= to_timestamp($2 / 1000.0) AND t <= to_timestamp($3 / 1000.0)",
        [r.id, from, to],
      );
      out[r.key] = Number(result.rows[0].v) || 0;
    }
  }
  return out;
}

export const timeSeries = { query: querySeries, consumption };
