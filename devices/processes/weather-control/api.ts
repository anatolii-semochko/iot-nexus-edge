/**
 * "weather-control" process kind - API side: the weather forecast (CORE
 * Library package, AGENTS.md section 82; loaded by apps/api's
 * apiPlugins.ts - everything it needs arrives in the plugin context).
 *
 * A process with `config.forecast.latitude / longitude` gets the forecast
 * for that point from Open-Meteo (free, no key; `services.openMeteoUrl`,
 * .env OPEN_METEO_URL), every `forecast.refreshMinutes` (a demo / a
 * Raspberry - rarely). The last good forecast is stored
 * (`weather_forecasts`, core migration 078) and served as it is when a
 * later fetch fails - the error is kept next to it. Its consumers: the
 * simulated weather node (process.ts follows it), the energy planners,
 * the AI Assistant (`weather.forecast`).
 *
 * Routes (one weather-control process each, scoped to it by the access
 * guard):
 *   GET  /weather-control/:processId/forecast          the stored forecast
 *   POST /weather-control/:processId/forecast/refresh  fetch now
 *   GET  /weather-control/:processId/history?days=N     the past N days
 *        hour by hour plus the next ones (Open-Meteo's past_days - the
 *        weather model's own past, not measurements; nothing stored, a
 *        short in-memory cache)
 */

// How often the due fetches are looked for.
const SCAN_MS = 60_000;
const DEFAULT_REFRESH_MINUTES = 60;
const DEFAULT_DAYS = 3;
// After a failed fetch - the next try no sooner than this (or the refresh
// period, if shorter).
const RETRY_MINUTES = 15;
const FETCH_TIMEOUT_MS = 15_000;
// The history (a widget's popup): at most this many past days (Open-Meteo
// allows 92), the forecast days with it, and how long one fetch is reused.
const HISTORY_MAX_DAYS = 31;
const HISTORY_FORECAST_DAYS = 2;
const HISTORY_CACHE_MINUTES = 30;
// Open-Meteo's terms (CC BY 4.0): the data is credited where it is shown.
const ATTRIBUTION = "Weather data by Open-Meteo.com (CC BY 4.0)";

const HOURLY = [
  "temperature_2m",
  "relative_humidity_2m",
  "pressure_msl",
  "cloud_cover",
  "precipitation",
  "weather_code",
  "shortwave_radiation",
  "wind_speed_10m",
  "wind_direction_10m",
  "wind_gusts_10m",
  "is_day",
] as const;
const DAILY = ["sunrise", "sunset", "temperature_2m_max", "temperature_2m_min", "precipitation_sum", "shortwave_radiation_sum", "wind_speed_10m_max"] as const;

// The stored shape: Open-Meteo's names made short and unit-explicit.
const HOURLY_KEYS: Record<(typeof HOURLY)[number], string> = {
  temperature_2m: "temperatureC",
  relative_humidity_2m: "humidityPct",
  pressure_msl: "pressureHpa",
  cloud_cover: "cloudCoverPct",
  precipitation: "precipitationMm",
  weather_code: "weatherCode",
  shortwave_radiation: "radiationWm2",
  wind_speed_10m: "windSpeedMs",
  wind_direction_10m: "windDirectionDeg",
  wind_gusts_10m: "windGustsMs",
  is_day: "isDay",
};
const DAILY_KEYS: Record<(typeof DAILY)[number], string> = {
  sunrise: "sunrise",
  sunset: "sunset",
  temperature_2m_max: "temperatureMaxC",
  temperature_2m_min: "temperatureMinC",
  precipitation_sum: "precipitationMm",
  shortwave_radiation_sum: "radiationMjM2",
  wind_speed_10m_max: "windSpeedMaxMs",
};

export interface ForecastConfig {
  latitude?: number;
  longitude?: number;
  // shown with the forecast, e.g. "Kassel"
  place?: string;
  refreshMinutes?: number;
  days?: number;
}

interface ForecastRow {
  process_id: number;
  location: { latitude: number; longitude: number; place: string | null };
  fetched_at: Date | null;
  hourly: Record<string, number | null>[];
  daily: Record<string, number | null>[];
  error: string | null;
  error_at: Date | null;
}

export const FORECAST_SCHEMA = {
  type: "object",
  properties: {
    latitude: { type: "number", minimum: -90, maximum: 90 },
    longitude: { type: "number", minimum: -180, maximum: 180 },
    place: { type: "string", maxLength: 80 },
    refreshMinutes: { type: "integer", minimum: 10, maximum: 1440 },
    days: { type: "integer", minimum: 1, maximum: 7 },
  },
  additionalProperties: false,
};

// The process config's schema (configSchemas.ts) - the sections a config
// edit may send; the device ids are set by the project's seed.
const CONFIG_SCHEMA = {
  title: "Weather Control config",
  description: "The weather station: its devices, light-level zones, the forecast's location and the simulation",
  type: "object",
  properties: {
    nodeId: { type: "integer" },
    heartbeatDeviceId: { type: "integer" },
    temperatureDeviceId: { type: "integer" },
    humidityDeviceId: { type: "integer" },
    pressureDeviceId: { type: "integer" },
    lightDeviceId: { type: "integer" },
    lightLevelDeviceId: { type: "integer" },
    windSpeedDeviceId: { type: "integer" },
    rainDeviceId: { type: "integer" },
    zones: {
      type: "array",
      items: {
        type: "object",
        properties: { key: { type: "string" }, color: { type: "string" }, min: { type: "number" } },
        required: ["key"],
      },
    },
    forecast: FORECAST_SCHEMA,
    simulation: {
      type: "object",
      properties: {
        // a simulated node follows the forecast (process.ts)
        followForecast: { type: "boolean" },
        intervalSeconds: { type: "integer", minimum: 30, maximum: 3600 },
      },
      additionalProperties: false,
    },
  },
};

/** Open-Meteo's response -> the stored rows ({ t: ms, ...values }). */
function rowsOf(block: Record<string, unknown[]> | undefined, names: readonly string[], keys: Record<string, string>): Record<string, number | null>[] {
  const times = (block?.time ?? []) as number[];
  return times.map((t, i) => {
    const row: Record<string, number | null> = { t: t * 1000 };
    for (const name of names) {
      const v = (block?.[name] as unknown[] | undefined)?.[i];
      row[keys[name]] = typeof v === "number" ? v : null;
    }
    // sunrise / sunset come as unix seconds too
    if ("sunrise" in row && row.sunrise !== null) row.sunrise = row.sunrise * 1000;
    if ("sunset" in row && row.sunset !== null) row.sunset = row.sunset * 1000;
    return row;
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- a Library package is loaded at run time by the api and imports nothing from it
export default async function weatherControlApi(app: any, ctx: any): Promise<void> {
  const { pool, services, registerConfigSchema, registerAiTool } = ctx;
  registerConfigSchema?.("weather-control", CONFIG_SCHEMA);

  const located = (f: ForecastConfig | undefined): f is ForecastConfig & { latitude: number; longitude: number } =>
    typeof f?.latitude === "number" && typeof f?.longitude === "number";

  async function fetchForecast(processId: number, f: ForecastConfig & { latitude: number; longitude: number }): Promise<void> {
    const location = { latitude: f.latitude, longitude: f.longitude, place: f.place ?? null };
    const url = new URL(services.openMeteoUrl);
    url.search = new URLSearchParams({
      latitude: String(f.latitude),
      longitude: String(f.longitude),
      hourly: HOURLY.join(","),
      daily: DAILY.join(","),
      wind_speed_unit: "ms",
      timeformat: "unixtime",
      timezone: "auto",
      past_days: "1",
      forecast_days: String(f.days ?? DEFAULT_DAYS),
    }).toString();
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      const body = (await res.json().catch(() => null)) as { error?: boolean; reason?: string; hourly?: Record<string, unknown[]>; daily?: Record<string, unknown[]> } | null;
      if (!res.ok || !body || body.error) throw new Error(body?.reason ?? `HTTP ${res.status}`);
      await pool.query(
        `INSERT INTO weather_forecasts (process_id, location, fetched_at, hourly, daily, error, error_at)
         VALUES ($1, $2, now(), $3, $4, NULL, NULL)
         ON CONFLICT (process_id) DO UPDATE SET location = $2, fetched_at = now(), hourly = $3, daily = $4, error = NULL, error_at = NULL`,
        [processId, JSON.stringify(location), JSON.stringify(rowsOf(body.hourly, HOURLY, HOURLY_KEYS)), JSON.stringify(rowsOf(body.daily, DAILY, DAILY_KEYS))],
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      app.log.warn({ processId, err: message }, "weather-control: forecast fetch failed - the last forecast kept");
      // the last good forecast stays; a location never fetched gets an empty row with the error
      await pool.query(
        `INSERT INTO weather_forecasts (process_id, location, error, error_at) VALUES ($1, $2, $3, now())
         ON CONFLICT (process_id) DO UPDATE SET error = $3, error_at = now()`,
        [processId, JSON.stringify(location), message],
      );
    }
  }

  // Due: never fetched, the refresh period passed, the location changed;
  // after a failure - the retry pause first.
  async function scan(): Promise<void> {
    const { rows } = await pool.query(
      `SELECT p.id, p.config->'forecast' AS forecast, f.location, f.fetched_at, f.error_at
       FROM processes p LEFT JOIN weather_forecasts f ON f.process_id = p.id
       WHERE p.kind = 'weather-control'`,
    );
    const now = Date.now();
    for (const r of rows as { id: number; forecast: ForecastConfig | null; location: ForecastRow["location"] | null; fetched_at: Date | null; error_at: Date | null }[]) {
      const f = r.forecast ?? undefined;
      if (!located(f)) continue;
      const refreshMs = (f.refreshMinutes ?? DEFAULT_REFRESH_MINUTES) * 60_000;
      const moved = r.location && (r.location.latitude !== f.latitude || r.location.longitude !== f.longitude);
      const stale = !r.fetched_at || now - r.fetched_at.getTime() >= refreshMs;
      const pausing = r.error_at && now - r.error_at.getTime() < Math.min(refreshMs, RETRY_MINUTES * 60_000);
      if (moved || (stale && !pausing)) await fetchForecast(r.id, f);
    }
  }
  let scanning = false;
  const tick = () => {
    if (scanning) return;
    scanning = true;
    scan()
      .catch((err) => {
        // a fresh database: the table comes with the core migrations
        if ((err as { code?: string }).code !== "42P01") app.log.error({ err }, "weather-control: forecast scan failed");
      })
      .finally(() => (scanning = false));
  };
  const timer = setInterval(tick, SCAN_MS);
  timer.unref?.();
  app.addHook?.("onClose", async () => clearInterval(timer));
  tick();

  async function forecastOf(processId: number) {
    const proc = (await pool.query("SELECT id, config FROM processes WHERE id = $1 AND kind = 'weather-control'", [processId])).rows[0];
    if (!proc) return { status: 404 as const, error: "weather-control process not found" };
    const row = (await pool.query("SELECT * FROM weather_forecasts WHERE process_id = $1", [processId])).rows[0] as ForecastRow | undefined;
    if (!located(proc.config?.forecast)) return { status: 409 as const, error: "no forecast location set (config.forecast.latitude / longitude)" };
    return {
      status: 200 as const,
      location: row?.location ?? null,
      fetchedAt: row?.fetched_at?.toISOString() ?? null,
      error: row?.error ?? null,
      errorAt: row?.error_at?.toISOString() ?? null,
      attribution: ATTRIBUTION,
      hourly: row?.hourly ?? [],
      daily: row?.daily ?? [],
    };
  }

  // the history - fetched on demand, the same fetch reused for a while (per process and days)
  const historyCache = new Map<string, { at: number; hourly: Record<string, number | null>[] }>();
  app.get("/weather-control/:processId/history", async (request: any, reply: any) => {
    const id = Number(request.params.processId);
    const days = Math.min(HISTORY_MAX_DAYS, Math.max(1, Math.round(Number(request.query?.days ?? 1)) || 1));
    const proc = (await pool.query("SELECT config FROM processes WHERE id = $1 AND kind = 'weather-control'", [id])).rows[0];
    if (!proc) return reply.code(404).send({ error: "weather-control process not found" });
    const f = proc.config?.forecast as ForecastConfig | undefined;
    if (!located(f)) return reply.code(409).send({ error: "no forecast location set (config.forecast.latitude / longitude)" });
    const key = `${id}:${days}:${f.latitude}:${f.longitude}`;
    const cached = historyCache.get(key);
    if (cached && Date.now() - cached.at < HISTORY_CACHE_MINUTES * 60_000) return { days, attribution: ATTRIBUTION, hourly: cached.hourly };
    const url = new URL(services.openMeteoUrl);
    url.search = new URLSearchParams({
      latitude: String(f.latitude),
      longitude: String(f.longitude),
      hourly: HOURLY.join(","),
      wind_speed_unit: "ms",
      timeformat: "unixtime",
      timezone: "auto",
      past_days: String(days),
      forecast_days: String(HISTORY_FORECAST_DAYS),
    }).toString();
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      const body = (await res.json().catch(() => null)) as { error?: boolean; reason?: string; hourly?: Record<string, unknown[]> } | null;
      if (!res.ok || !body || body.error) throw new Error(body?.reason ?? `HTTP ${res.status}`);
      const hourly = rowsOf(body.hourly, HOURLY, HOURLY_KEYS);
      historyCache.set(key, { at: Date.now(), hourly });
      return { days, attribution: ATTRIBUTION, hourly };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      app.log.warn({ processId: id, err: message }, "weather-control: history fetch failed");
      // an older fetch is better than nothing
      if (cached) return { days, attribution: ATTRIBUTION, hourly: cached.hourly, error: message };
      return reply.code(502).send({ error: message });
    }
  });

  app.get("/weather-control/:processId/forecast", async (request: any, reply: any) => {
    const { status, ...body } = await forecastOf(Number(request.params.processId));
    return reply.code(status).send(body);
  });

  app.post(
    "/weather-control/:processId/forecast/refresh",
    { config: { permission: "processes.control" } },
    async (request: any, reply: any) => {
      const id = Number(request.params.processId);
      const proc = (await pool.query("SELECT config FROM processes WHERE id = $1 AND kind = 'weather-control'", [id])).rows[0];
      if (!proc) return reply.code(404).send({ error: "weather-control process not found" });
      if (!located(proc.config?.forecast)) return reply.code(409).send({ error: "no forecast location set" });
      await fetchForecast(id, proc.config.forecast);
      const { status, ...body } = await forecastOf(id);
      return reply.code(status).send(body);
    },
  );

  registerAiTool?.({
    name: "weather.forecast",
    description:
      "The weather forecast of a weather-control process (Open-Meteo): the place, when fetched, hour by hour for the next `hours` (temperature C, humidity %, pressure hPa, cloud cover %, precipitation mm, solar radiation W/m2, wind m/s and direction, gusts) and the days (sunrise / sunset, min / max temperature, precipitation, radiation, max wind).",
    input: {
      type: "object",
      properties: {
        processId: { type: "integer", description: "the weather-control process; default - the instance's own, else the only one" },
        hours: { type: "integer", minimum: 1, maximum: 168, default: 24 },
      },
      additionalProperties: false,
    },
    async run(input: Record<string, unknown>, toolCtx: { instance: { processId: number | null } }) {
      let processId = typeof input.processId === "number" ? input.processId : toolCtx.instance.processId;
      if (processId === null) {
        const { rows } = await pool.query("SELECT id FROM processes WHERE kind = 'weather-control' ORDER BY id");
        if (rows.length !== 1) throw new Error(`processId is required - a weather-control process (there are ${rows.length})`);
        processId = rows[0].id as number;
      }
      const { status, ...f } = await forecastOf(processId);
      if (status !== 200) throw new Error((f as { error: string }).error);
      const ok = f as Exclude<Awaited<ReturnType<typeof forecastOf>>, { error: string; status: 404 | 409 }>;
      const now = Date.now();
      const hours = Number(input.hours ?? 24);
      const iso = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString());
      return {
        place: ok.location?.place ?? null,
        fetchedAt: ok.fetchedAt,
        lastError: ok.error,
        hourly: ok.hourly.filter((h) => (h.t as number) >= now - 3_600_000).slice(0, hours).map(({ t, ...v }) => ({ at: iso(t), ...v })),
        daily: ok.daily.map(({ t, sunrise, sunset, ...v }) => ({ day: iso(t)?.slice(0, 10), sunrise: iso(sunrise), sunset: iso(sunset), ...v })),
      };
    },
  });
}
