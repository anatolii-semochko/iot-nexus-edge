import type { FastifyInstance } from "fastify";

import { requireAuth } from "../auth.js";
import { pool } from "../db.js";
import { consumption, querySeries } from "../timeSeries.js";

// Time series (migrations/1690000000060, timeSeries.ts):
// - GET /series - the series (filter by processId / deviceId) with their
//   recording policy;
// - POST /series/declare - a process declares the values it publishes in
//   its metrics: a series is created with the declared defaults, an
//   existing one keeps its policy (a person may have changed it) and only
//   gets its name / unit / kind refreshed;
// - PATCH /series/:id - the recording policy (a person - Settings -> Logs);
// - POST /samples - the Data Logger's points, many in one request;
// - GET /series/data, GET /series/consumption - reading.
// Like the other device / process routes, reads and the orchestrator's
// writes need no session; a person's policy edit does.

interface SeriesRow {
  id: number;
  key: string;
  name: string;
  unit: string | null;
  device_id: number | null;
  process_id: number | null;
  value_key: string | null;
  kind: string;
  mode: string;
  period_s: number | null;
  deadband: number | null;
  max_interval_s: number | null;
  stale_s: number | null;
}

const toSeries = (r: SeriesRow) => ({
  id: r.id,
  key: r.key,
  name: r.name,
  unit: r.unit,
  deviceId: r.device_id,
  processId: r.process_id,
  valueKey: r.value_key,
  kind: r.kind,
  mode: r.mode,
  periodS: r.period_s,
  deadband: r.deadband,
  maxIntervalS: r.max_interval_s,
  staleS: r.stale_s,
});

interface Declared {
  valueKey: string;
  name: string;
  unit?: string | null;
  kind?: "gauge" | "counter" | "state";
  mode?: "period" | "change" | "off";
  periodS?: number | null;
  deadband?: number | null;
  maxIntervalS?: number | null;
  staleS?: number | null;
}

const MODES = new Set(["period", "change", "off"]);
const positiveOrNull = (v: unknown) => v === null || v === undefined || (typeof v === "number" && Number.isFinite(v) && v > 0);

export async function seriesRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { processId?: string; deviceId?: string } }>("/series", async (request) => {
    const { processId, deviceId } = request.query;
    const rows = (
      await pool.query<SeriesRow>(
        `SELECT * FROM series WHERE ($1::int IS NULL OR process_id = $1) AND ($2::int IS NULL OR device_id = $2) ORDER BY key`,
        [processId ? Number(processId) : null, deviceId ? Number(deviceId) : null],
      )
    ).rows;
    return rows.map(toSeries);
  });

  app.post<{ Body: { processId: number; items: Declared[] } }>("/series/declare", async (request, reply) => {
    const { processId, items } = request.body ?? ({} as never);
    if (!Number.isInteger(processId) || !Array.isArray(items)) return reply.code(400).send({ error: "processId and items are required" });
    for (const it of items) {
      if (!it?.valueKey || !it.name) continue;
      await pool.query(
        `INSERT INTO series (key, name, unit, process_id, value_key, kind, mode, period_s, deadband, max_interval_s, stale_s)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (key) DO UPDATE SET name = $2, unit = $3, kind = $6, updated_at = now()
         WHERE series.name IS DISTINCT FROM $2 OR series.unit IS DISTINCT FROM $3 OR series.kind IS DISTINCT FROM $6`,
        [
          `process:${processId}:${it.valueKey}`,
          it.name,
          it.unit ?? null,
          processId,
          it.valueKey,
          it.kind ?? "gauge",
          it.mode ?? "period",
          it.periodS ?? null,
          it.deadband ?? null,
          it.maxIntervalS ?? null,
          it.staleS ?? null,
        ],
      );
    }
    return { status: "ok" };
  });

  app.patch<{ Params: { id: string }; Body: { mode?: string; periodS?: number | null; deadband?: number | null; maxIntervalS?: number | null; staleS?: number | null } }>(
    "/series/:id",
    { preHandler: requireAuth },
    async (request, reply) => {
      const b = request.body ?? {};
      if (b.mode !== undefined && !MODES.has(b.mode)) return reply.code(400).send({ error: "mode must be period, change or off" });
      for (const f of ["periodS", "maxIntervalS", "staleS"] as const) {
        if (b[f] !== undefined && !positiveOrNull(b[f])) return reply.code(400).send({ error: `${f} must be a positive number or null` });
      }
      if (b.deadband !== undefined && b.deadband !== null && !(typeof b.deadband === "number" && b.deadband >= 0))
        return reply.code(400).send({ error: "deadband must be zero or more, or null" });
      const current = (await pool.query<SeriesRow>("SELECT * FROM series WHERE id = $1", [request.params.id])).rows[0];
      if (!current) return reply.code(404).send({ error: "series not found" });
      const mode = b.mode ?? current.mode;
      const periodS = b.periodS !== undefined ? b.periodS : current.period_s;
      if (mode === "period" && !periodS) return reply.code(400).send({ error: "a period series needs its period" });
      const row = (
        await pool.query<SeriesRow>(
          `UPDATE series SET mode = $2, period_s = $3, deadband = $4, max_interval_s = $5, stale_s = $6, updated_at = now() WHERE id = $1 RETURNING *`,
          [
            current.id,
            mode,
            periodS,
            b.deadband !== undefined ? b.deadband : current.deadband,
            b.maxIntervalS !== undefined ? b.maxIntervalS : current.max_interval_s,
            b.staleS !== undefined ? b.staleS : current.stale_s,
          ],
        )
      ).rows[0];
      return toSeries(row);
    },
  );

  // the Data Logger's points: [{seriesId, t (ms), v}] - one INSERT
  app.post<{ Body: { rows: { seriesId: number; t: number; v: number }[] } }>("/samples", async (request, reply) => {
    const rows = (request.body?.rows ?? []).filter((r) => Number.isInteger(r.seriesId) && Number.isFinite(r.t) && Number.isFinite(r.v));
    if (rows.length === 0) return reply.code(400).send({ error: "rows [{seriesId, t, v}] are required" });
    await pool.query(
      `INSERT INTO samples (series_id, t, v)
       SELECT s, to_timestamp(t / 1000.0), v FROM unnest($1::int[], $2::double precision[], $3::double precision[]) AS x(s, t, v)
       ON CONFLICT (series_id, t) DO UPDATE SET v = EXCLUDED.v`,
      [rows.map((r) => r.seriesId), rows.map((r) => r.t), rows.map((r) => r.v)],
    );
    return { inserted: rows.length };
  });

  app.get<{ Querystring: { keys: string; from: string; to: string; points?: string } }>("/series/data", async (request, reply) => {
    const keys = String(request.query.keys ?? "").split(",").filter(Boolean);
    const from = Number(request.query.from);
    const to = Number(request.query.to);
    if (keys.length === 0 || !Number.isFinite(from) || !Number.isFinite(to) || to <= from)
      return reply.code(400).send({ error: "keys and from < to (ms) are required" });
    const points = Math.min(2000, Math.max(10, Number(request.query.points) || 240));
    return { series: await querySeries(keys, from, to, points) };
  });

  app.get<{ Querystring: { keys: string; from: string; to: string } }>("/series/consumption", async (request, reply) => {
    const keys = String(request.query.keys ?? "").split(",").filter(Boolean);
    const from = Number(request.query.from);
    const to = Number(request.query.to);
    if (keys.length === 0 || !Number.isFinite(from) || !Number.isFinite(to) || to <= from)
      return reply.code(400).send({ error: "keys and from < to (ms) are required" });
    return { totals: await consumption(keys, from, to) };
  });
}
