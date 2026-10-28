/**
 * "energy-grid" process kind - API side: the day-ahead market prices and
 * the prices of the process's tariff (CORE Library package, AGENTS.md
 * section 82; everything arrives in the plugin context).
 *
 * Market prices: every bidding zone used by an energy-grid process
 * (`config.market.biddingZone`, e.g. DE-LU) is fetched every
 * `market.refreshMinutes` (default 60 - the next day is published around
 * 13:00 CET) for today and tomorrow: Energy-Charts (Fraunhofer ISE, 15-min
 * slots, CC BY 4.0 - SMARD.de / Bundesnetzagentur data; `.env`
 * ENERGY_CHARTS_URL), aWATTar as the fallback (hourly, DE / AT;
 * AWATTAR_URL). Stored per slot (`energy_prices`, core migration 079); a
 * failed fetch keeps what is stored (the error in `energy_price_fetches`,
 * the next try in 15 minutes).
 *
 * Routes (one energy-grid process each, scoped to it by the access guard):
 *   GET  /energy-grid/:processId/prices[?from=&to=]  the slots' buy / sell prices (default: today and tomorrow)
 *   GET  /energy-grid/:processId/prices/now          the current slot
 *   POST /energy-grid/:processId/prices/refresh      fetch the market now
 */
import { priceSlots, type PurchaseConfig, type SaleConfig } from "./pricing.ts";

const SCAN_MS = 60_000;
const DEFAULT_REFRESH_MINUTES = 60;
const RETRY_MINUTES = 15;
const FETCH_TIMEOUT_MS = 20_000;
const DAY_MS = 86_400_000;
// stored slots older than this are dropped (the ledger keeps the days' sums)
const KEEP_DAYS = 14;
const ATTRIBUTION: Record<string, string> = {
  "energy-charts": "Day-ahead prices: Energy-Charts (Fraunhofer ISE), data Bundesnetzagentur | SMARD.de, CC BY 4.0",
  awattar: "Day-ahead prices: aWATTar (EPEX Spot)",
};

interface GridConfig {
  timeZone?: string;
  purchase?: PurchaseConfig;
  sale?: SaleConfig;
  market?: { biddingZone?: string; refreshMinutes?: number };
}

const zoneProps = {
  type: "object",
  properties: {
    key: { type: "string", maxLength: 30 },
    label: { type: "string", maxLength: 40 },
    from: { type: "string", pattern: "^([01]\\d|2[0-3]):[0-5]\\d$" },
    to: { type: "string", pattern: "^([01]\\d|2[0-3]):[0-5]\\d$" },
    priceCtKwh: { type: "number", minimum: -100, maximum: 500 },
  },
  required: ["key", "from", "to", "priceCtKwh"],
  additionalProperties: false,
};

const CONFIG_SCHEMA = {
  title: "Energy Grid config",
  description: "The grid connection point: its meter, the purchase tariff (time zones or the market), the sale price, the market, the limits and the supply quality",
  type: "object",
  properties: {
    nodeId: { type: "integer" },
    voltageL1DeviceId: { type: "integer" },
    voltageL2DeviceId: { type: "integer" },
    voltageL3DeviceId: { type: "integer" },
    frequencyDeviceId: { type: "integer" },
    powerDeviceId: { type: "integer" },
    importEnergyDeviceId: { type: "integer" },
    exportEnergyDeviceId: { type: "integer" },
    timeZone: { type: "string", maxLength: 60 },
    purchase: {
      type: "object",
      properties: {
        mode: { enum: ["tariff", "market"] },
        zones: { type: "array", maxItems: 12, items: zoneProps },
        surchargeCtKwh: { type: "number", minimum: 0, maximum: 200 },
      },
      additionalProperties: false,
    },
    sale: {
      type: "object",
      properties: {
        mode: { enum: ["fixed", "market"] },
        fixedCtKwh: { type: "number", minimum: 0, maximum: 200 },
        deductionCtKwh: { type: "number", minimum: 0, maximum: 50 },
      },
      additionalProperties: false,
    },
    market: {
      type: "object",
      properties: {
        biddingZone: { type: "string", maxLength: 20 },
        refreshMinutes: { type: "integer", minimum: 15, maximum: 1440 },
      },
      additionalProperties: false,
    },
    limits: {
      type: "object",
      properties: {
        maxImportKw: { type: "number", minimum: 0 },
        maxExportKw: { type: "number", minimum: 0 },
      },
      additionalProperties: false,
    },
    quality: {
      type: "object",
      properties: {
        nominalV: { type: "number", minimum: 100, maximum: 500 },
        voltageTolerancePct: { type: "number", minimum: 1, maximum: 30 },
        nominalHz: { type: "number", enum: [50, 60] },
        frequencyToleranceHz: { type: "number", minimum: 0.01, maximum: 5 },
      },
      additionalProperties: false,
    },
    simulation: {
      type: "object",
      properties: { followNominal: { type: "boolean" }, intervalSeconds: { type: "integer", minimum: 10, maximum: 3600 } },
      additionalProperties: false,
    },
  },
};

const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10);

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- a Library package is loaded at run time by the api and imports nothing from it
export default async function energyGridApi(app: any, ctx: any): Promise<void> {
  const { pool, services, registerConfigSchema, registerAiTool } = ctx;
  registerConfigSchema?.("energy-grid", CONFIG_SCHEMA);
  const systemTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  async function fromEnergyCharts(zone: string, from: number, to: number) {
    const url = new URL(services.energyChartsUrl);
    url.search = new URLSearchParams({ bzn: zone, start: ymd(from), end: ymd(to) }).toString();
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`Energy-Charts HTTP ${res.status}`);
    const body = (await res.json()) as { unix_seconds?: number[]; price?: (number | null)[] };
    const ts = body.unix_seconds ?? [];
    const minutes = ts.length > 1 ? Math.round((ts[1] - ts[0]) / 60) : 60;
    return ts
      .map((s, i) => ({ t: s * 1000, minutes, eurMwh: body.price?.[i] }))
      .filter((p): p is { t: number; minutes: number; eurMwh: number } => typeof p.eurMwh === "number");
  }

  async function fromAwattar(zone: string, from: number, to: number) {
    // aWATTar publishes Germany (DE-LU) and Austria only
    const base = zone === "AT" ? services.awattarUrl.replace("api.awattar.de", "api.awattar.at") : services.awattarUrl;
    if (!["DE-LU", "AT"].includes(zone)) throw new Error(`aWATTar has no zone ${zone}`);
    const url = new URL(base);
    url.search = new URLSearchParams({ start: String(from), end: String(to) }).toString();
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`aWATTar HTTP ${res.status}`);
    const body = (await res.json()) as { data?: { start_timestamp: number; end_timestamp: number; marketprice: number }[] };
    return (body.data ?? []).map((d) => ({ t: d.start_timestamp, minutes: Math.round((d.end_timestamp - d.start_timestamp) / 60_000), eurMwh: d.marketprice }));
  }

  async function fetchZone(zone: string): Promise<void> {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const from = start.getTime();
    const to = from + 2 * DAY_MS;
    const errors: string[] = [];
    for (const [source, load] of [
      ["energy-charts", fromEnergyCharts],
      ["awattar", fromAwattar],
    ] as const) {
      try {
        const slots = await load(zone, from, to);
        if (slots.length === 0) throw new Error(`${source}: no prices`);
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          await client.query(
            `INSERT INTO energy_prices (zone, t, minutes, price_eur_mwh, source)
             SELECT $1, to_timestamp((s->>'t')::double precision / 1000), (s->>'minutes')::int, (s->>'eurMwh')::double precision, $2
             FROM jsonb_array_elements($3::jsonb) s
             ON CONFLICT (zone, t) DO UPDATE SET minutes = EXCLUDED.minutes, price_eur_mwh = EXCLUDED.price_eur_mwh, source = EXCLUDED.source`,
            [zone, source, JSON.stringify(slots)],
          );
          await client.query(`DELETE FROM energy_prices WHERE zone = $1 AND t < now() - make_interval(days => $2)`, [zone, KEEP_DAYS]);
          await client.query(
            `INSERT INTO energy_price_fetches (zone, fetched_at, source, error, error_at) VALUES ($1, now(), $2, NULL, NULL)
             ON CONFLICT (zone) DO UPDATE SET fetched_at = now(), source = $2, error = NULL, error_at = NULL`,
            [zone, source],
          );
          await client.query("COMMIT");
        } catch (err) {
          await client.query("ROLLBACK");
          throw err;
        } finally {
          client.release();
        }
        return;
      } catch (err) {
        errors.push(err instanceof Error ? err.message : String(err));
      }
    }
    const message = errors.join("; ");
    app.log.warn({ zone, err: message }, "energy-grid: market prices fetch failed - the stored prices kept");
    await pool.query(
      `INSERT INTO energy_price_fetches (zone, error, error_at) VALUES ($1, $2, now())
       ON CONFLICT (zone) DO UPDATE SET error = $2, error_at = now()`,
      [zone, message],
    );
  }

  // Due: a zone used by a process (market buying or selling, or a zone set)
  // that was never fetched, or whose refresh period passed - after a failure
  // the retry pause first.
  async function scan(): Promise<void> {
    const { rows } = await pool.query(
      `SELECT p.config->'market' AS market, f.fetched_at, f.error_at
       FROM processes p
       LEFT JOIN energy_price_fetches f ON f.zone = p.config->'market'->>'biddingZone'
       WHERE p.kind = 'energy-grid' AND p.config->'market'->>'biddingZone' IS NOT NULL`,
    );
    const now = Date.now();
    const due = new Set<string>();
    for (const r of rows as { market: GridConfig["market"]; fetched_at: Date | null; error_at: Date | null }[]) {
      const refreshMs = (r.market?.refreshMinutes ?? DEFAULT_REFRESH_MINUTES) * 60_000;
      const stale = !r.fetched_at || now - r.fetched_at.getTime() >= refreshMs;
      const pausing = r.error_at && now - r.error_at.getTime() < Math.min(refreshMs, RETRY_MINUTES * 60_000);
      if (stale && !pausing && r.market?.biddingZone) due.add(r.market.biddingZone);
    }
    for (const zone of due) await fetchZone(zone);
  }
  let scanning = false;
  const tick = () => {
    if (scanning) return;
    scanning = true;
    scan()
      .catch((err) => {
        // a fresh database: the tables come with the core migrations
        if ((err as { code?: string }).code !== "42P01") app.log.error({ err }, "energy-grid: price scan failed");
      })
      .finally(() => (scanning = false));
  };
  const timer = setInterval(tick, SCAN_MS);
  timer.unref?.();
  app.addHook?.("onClose", async () => clearInterval(timer));
  tick();

  async function pricesOf(processId: number, from?: number, to?: number) {
    const proc = (await pool.query("SELECT config FROM processes WHERE id = $1 AND kind = 'energy-grid'", [processId])).rows[0];
    if (!proc) return { status: 404 as const, error: "energy-grid process not found" };
    const config = (proc.config ?? {}) as GridConfig;
    const timeZone = config.timeZone || systemTimeZone;
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const a = from ?? start.getTime();
    const b = to ?? a + 2 * DAY_MS;
    const zone = config.market?.biddingZone ?? null;
    const spot = zone
      ? (
          await pool.query(
            `SELECT extract(epoch FROM t) * 1000 AS t, minutes, price_eur_mwh FROM energy_prices
             WHERE zone = $1 AND t >= to_timestamp($2::double precision / 1000) - interval '1 hour' AND t < to_timestamp($3::double precision / 1000) ORDER BY t`,
            [zone, a, b],
          )
        ).rows.map((r: { t: string; minutes: number; price_eur_mwh: number }) => ({ t: Number(r.t), minutes: r.minutes, eurMwh: r.price_eur_mwh }))
      : [];
    const fetch = zone ? (await pool.query("SELECT * FROM energy_price_fetches WHERE zone = $1", [zone])).rows[0] : null;
    // the market's slots where there are any, the tariff's hours after them (tomorrow before ~13:00)
    const lastSpotEnd = spot.length ? spot[spot.length - 1].t + spot[spot.length - 1].minutes * 60_000 : a;
    const slots = [
      ...priceSlots(spot, config.purchase ?? {}, config.sale ?? {}, timeZone, a, b),
      ...(lastSpotEnd < b ? priceSlots([], config.purchase ?? {}, config.sale ?? {}, timeZone, Math.max(a, lastSpotEnd), b) : []),
    ];
    return {
      status: 200 as const,
      timeZone,
      biddingZone: zone,
      purchaseMode: config.purchase?.mode ?? "tariff",
      saleMode: config.sale?.mode ?? "fixed",
      source: fetch?.source ?? null,
      fetchedAt: fetch?.fetched_at?.toISOString() ?? null,
      error: fetch?.error ?? null,
      attribution: fetch?.source ? ATTRIBUTION[fetch.source] : null,
      slots,
    };
  }

  const nowSlot = (slots: { t: number; minutes: number }[], now = Date.now()) => slots.find((s) => s.t <= now && now < s.t + s.minutes * 60_000) ?? null;

  app.get("/energy-grid/:processId/prices", async (request: any, reply: any) => {
    const num = (v: unknown) => (v === undefined ? undefined : Number(v));
    const { status, ...body } = await pricesOf(Number(request.params.processId), num(request.query?.from), num(request.query?.to));
    return reply.code(status).send(body);
  });

  app.get("/energy-grid/:processId/prices/now", async (request: any, reply: any) => {
    const now = Date.now();
    const { status, ...body } = await pricesOf(Number(request.params.processId), now - 3_600_000, now + 3_600_000);
    if (status !== 200) return reply.code(status).send(body);
    const b = body as { slots: { t: number; minutes: number }[] };
    return { ...body, slots: undefined, slot: nowSlot(b.slots, now) };
  });

  app.post("/energy-grid/:processId/prices/refresh", { config: { permission: "processes.control" } }, async (request: any, reply: any) => {
    const id = Number(request.params.processId);
    const proc = (await pool.query("SELECT config FROM processes WHERE id = $1 AND kind = 'energy-grid'", [id])).rows[0];
    if (!proc) return reply.code(404).send({ error: "energy-grid process not found" });
    const zone = proc.config?.market?.biddingZone;
    if (!zone) return reply.code(409).send({ error: "no market bidding zone set (config.market.biddingZone)" });
    await fetchZone(zone);
    const { status, ...body } = await pricesOf(id);
    return reply.code(status).send(body);
  });

  registerAiTool?.({
    name: "energy.prices",
    description:
      "Electricity prices of an energy-grid process (the grid connection): per slot of the next `hours` - the day-ahead spot price (EUR/MWh), what a kWh costs bought (ct/kWh, by the purchase mode: a time-of-use tariff or the market plus surcharge) and earns sold (ct/kWh), the tariff zone; the current slot; the cheapest and dearest slots ahead; the market data's source and freshness.",
    input: {
      type: "object",
      properties: {
        processId: { type: "integer", description: "the energy-grid process; default - the instance's own, else the only one" },
        hours: { type: "integer", minimum: 1, maximum: 48, default: 24 },
      },
      additionalProperties: false,
    },
    async run(input: Record<string, unknown>, toolCtx: { instance: { processId: number | null } }) {
      let processId = typeof input.processId === "number" ? input.processId : toolCtx.instance.processId;
      if (processId === null) {
        const { rows } = await pool.query("SELECT id FROM processes WHERE kind = 'energy-grid' ORDER BY id");
        if (rows.length !== 1) throw new Error(`processId is required - an energy-grid process (there are ${rows.length})`);
        processId = rows[0].id as number;
      }
      const now = Date.now();
      const { status, ...p } = await pricesOf(processId, now - 3_600_000, now + Number(input.hours ?? 24) * 3_600_000);
      if (status !== 200) throw new Error((p as { error: string }).error);
      const ok = p as Extract<Awaited<ReturnType<typeof pricesOf>>, { status: 200 }>;
      const ahead = ok.slots.filter((s) => s.t + s.minutes * 60_000 > now);
      const priced = ahead.filter((s) => s.buyCtKwh !== null);
      const by = (f: (a: number, b: number) => boolean) => priced.reduce<(typeof priced)[number] | null>((m, s) => (m === null || f(s.buyCtKwh!, m.buyCtKwh!) ? s : m), null);
      const iso = (s: { t: number } | null) => (s ? new Date(s.t).toISOString() : null);
      return {
        purchaseMode: ok.purchaseMode,
        saleMode: ok.saleMode,
        biddingZone: ok.biddingZone,
        source: ok.source,
        fetchedAt: ok.fetchedAt,
        lastError: ok.error,
        now: nowSlot(ok.slots, now),
        cheapest: by((a, b) => a < b) && { at: iso(by((a, b) => a < b)), buyCtKwh: by((a, b) => a < b)!.buyCtKwh },
        dearest: by((a, b) => a > b) && { at: iso(by((a, b) => a > b)), buyCtKwh: by((a, b) => a > b)!.buyCtKwh },
        slots: ahead.map(({ t, ...s }) => ({ at: new Date(t).toISOString(), ...s })),
      };
    },
  });
}
