/**
 * "energy-ledger" process kind - API side (CORE Library package, AGENTS.md
 * section 82): the config's schema; the journal (`ledger_days`, migration
 * 081) - the process writes its day (PUT .../days/:day, internal service
 * only), the UI and the AI read a day, a period's days and the period's sum
 * with the savings bridge; AI tools `ledger.day` and `ledger.history`.
 */
import { addAccounts, roundAccounts } from "./accounts.ts";
import { addDays, bridge, kpis, type LedgerDay } from "./ledger.ts";
import { dayTypeOf, noteOf } from "./notes.ts";
import { analogChoice, featuresOfRecord, similarDays } from "./similar.ts";
import { STRATEGIES } from "./strategies.ts";

const CONFIG_SCHEMA = {
  title: "Energy Ledger config",
  description: "The site's energy and money journal: the energy field, the grid connection and the heatings it records",
  type: "object",
  properties: {
    timeZone: { type: "string", maxLength: 60 },
    fieldProcessId: { type: "integer" },
    gridProcessId: { type: "integer" },
    heatingProcessIds: { type: "array", maxItems: 20, items: { type: "integer" } },
    intervalSeconds: { type: "integer", minimum: 10, maximum: 3600 },
    saveMinutes: { type: "integer", minimum: 1, maximum: 60 },
    plan: {
      type: "object",
      description: "The plan (L2): re-made every intradayMinutes, on new day-ahead prices, when the SoC drifts over deviationPct; the batteries' wear in its money",
      properties: {
        enabled: { type: "boolean" },
        intradayMinutes: { type: "integer", minimum: 15, maximum: 720 },
        deviationPct: { type: "number", minimum: 1, maximum: 50 },
        wearCtKwh: { type: "number", minimum: 0, maximum: 50 },
        efficiency: { type: "number", minimum: 0.7, maximum: 1 },
      },
      additionalProperties: false,
    },
    accounts: {
      type: "array",
      maxItems: 200,
      description:
        "The cost accounts - who the energy is for: private (the owner's), business, tenant (a let unit - what to re-bill). Electricity - its meters (the energy field's sub-meters' node ids) at the slots' purchase prices; heat - a heating's fan coils (nodeIds; none - the system's whole delivered heat) at that system's cost of heat today. A meter already including a heating plant's electricity carries that heat - list no heat of that system then",
      items: {
        type: "object",
        required: ["key", "name", "kind"],
        properties: {
          key: { type: "string", maxLength: 60 },
          name: { type: "string", maxLength: 120 },
          kind: { enum: ["private", "business", "tenant"] },
          meters: { type: "array", maxItems: 50, items: { type: "integer" } },
          heat: {
            type: "array",
            maxItems: 20,
            items: {
              type: "object",
              required: ["processId"],
              properties: { processId: { type: "integer" }, nodeIds: { type: "array", maxItems: 100, items: { type: "integer" } } },
              additionalProperties: false,
            },
          },
        },
        additionalProperties: false,
      },
    },
    reverts: {
      type: "array",
      maxItems: 20,
      description: "Temporary changes to undo by the process itself (the operator's \"For\"): at (ms) - the values to put back (ops; null - the default) - whether to re-plan, why",
      items: {
        type: "object",
        required: ["at", "ops"],
        properties: { at: { type: "number" }, ops: { type: "object" }, replan: { type: "boolean" }, reason: { type: "string", maxLength: 300 } },
        additionalProperties: false,
      },
    },
    calendar: {
      type: "object",
      description: "The operational days' notes: the public holidays of the country (ISO 3166 code, e.g. DE; region - its state / province code, e.g. HE) written as notes aheadDays ahead, once a day - the plan takes a holiday's consumption as a day off's",
      properties: {
        country: { type: "string", minLength: 2, maxLength: 3 },
        region: { type: "string", maxLength: 10 },
        aheadDays: { type: "integer", minimum: 1, maximum: 120 },
      },
      additionalProperties: false,
    },
    strategy: {
      type: "object",
      description:
        "The strategy the plan follows (L3): cost (least money), selfSufficiency, reserve (the batteries kept at reserveHighPct), peakShaving (the import under peakLimitKw - a business's capacity charge), sales (sell only above sellThresholdCt); selection fixed / propose (a cheaper one for the new day-ahead prices proposed - the process's AI instance's Config level: Auto applies, Confirm asks, Off - none) / analog (once a day the strategy best on the most similar recorded days applied by the ledger itself - no AI)",
      properties: {
        key: { enum: ["cost", "selfSufficiency", "reserve", "peakShaving", "sales"] },
        selection: { enum: ["fixed", "propose", "analog"] },
        minGainEur: { type: "number", minimum: 0 },
        reserveHighPct: { type: "number", minimum: 0, maximum: 100 },
        peakLimitKw: { type: ["number", "null"], minimum: 0 },
        peakPenaltyCtKwh: { type: "number", minimum: 0 },
        sellThresholdCt: { type: "number" },
        // the operating parameters the plan keeps, over the energy field's own (the ledger manages the energy)
        reservePct: { type: "number", minimum: 0, maximum: 100, description: "the outage reserve the plan keeps (over the energy field's; never under its socMinPct) - an outage note's window may use it" },
        gridChargeAllowed: { type: "boolean", description: "the plan may charge the batteries from the grid (over the energy field's)" },
        exportAllowed: { type: "boolean", description: "the surplus may be sold (over the energy field's)" },
      },
      additionalProperties: false,
    },
  },
};

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const NOTES_DEFAULT_DAYS = 14;

const r = (x: number | null, d = 2) => (x === null ? null : Math.round(x * 10 ** d) / 10 ** d);

/** A day / a period: the record, the bridge, the KPIs - rounded for the wire. */
const view = (record: LedgerDay, batteryKwh: number) => ({
  record,
  bridge: bridge(record).map((s) => ({ ...s, eur: r(s.eur), kwh: r(s.kwh, 1) })),
  kpis: Object.fromEntries(Object.entries(kpis(record, batteryKwh)).map(([k, v]) => [k, typeof v === "boolean" ? v : r(v)])),
});

/** The period around a day: the day itself, its month, its year. */
const periodOf = (period: string, day: string): [string, string] => {
  const [y, m] = day.split("-").map(Number);
  if (period === "month") {
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return [`${y}-${String(m).padStart(2, "0")}-01`, `${y}-${String(m).padStart(2, "0")}-${String(last).padStart(2, "0")}`];
  }
  if (period === "year") return [`${y}-01-01`, `${y}-12-31`];
  return [day, day];
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- a Library package is loaded at run time by the api and imports nothing from it
export default async function energyLedgerApi(app: any, ctx: any): Promise<void> {
  const { pool, registerConfigSchema, registerAiTool, proposeConfig, processMetrics, holidaysOf, dayNotesOf } = ctx;
  registerConfigSchema?.("energy-ledger", CONFIG_SCHEMA);

  const ledgerOf = async (processId: number) =>
    (await pool.query("SELECT id, name, config FROM processes WHERE id = $1 AND kind = 'energy-ledger'", [processId])).rows[0] as
      | { id: number; name: string; config: Record<string, any> }
      | undefined;

  const batteryKwhOf = async (ledger: { config: Record<string, any> }) => {
    const id = ledger.config?.fieldProcessId;
    if (!id) return 0;
    const field = (await pool.query("SELECT config FROM processes WHERE id = $1", [id])).rows[0];
    return (field?.config?.batteries ?? []).reduce((a: number, b: any) => a + (Number(b.capacityKwh) || 0), 0);
  };

  const daysOf = async (processId: number, from: string, to: string) =>
    (
      await pool.query(
        "SELECT to_char(day, 'YYYY-MM-DD') AS day, data, partial, final FROM ledger_days WHERE process_id = $1 AND day BETWEEN $2 AND $3 ORDER BY day",
        [processId, from, to],
      )
    ).rows as { day: string; data: LedgerDay; partial: boolean; final: boolean }[];

  /** A period's days and their sum (day / month / year around `day`). */
  const periodView = async (processId: number, period: string, dayAsked: string) => {
    const ledger = await ledgerOf(processId);
    if (!ledger) return { status: 404 as const, error: "energy-ledger process not found" };
    // "today" - the ledger's own day (its time zone), not the viewer's
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: ledger.config?.timeZone || undefined, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    const day = dayAsked || today;
    if (!DAY.test(day) || !["day", "month", "year"].includes(period)) return { status: 400 as const, error: "period day / month / year and day YYYY-MM-DD" };
    const [from, to] = periodOf(period, day);
    const rows = await daysOf(processId, from, to);
    const batteryKwh = await batteryKwhOf(ledger);
    return {
      status: 200 as const,
      name: ledger.name,
      period,
      day,
      today,
      from,
      to,
      partial: rows.some((x) => x.partial),
      total: view(addDays(rows.map((x) => x.data)), batteryKwh),
      // who the period's energy was for (the cost accounts' sums)
      accounts: ((a) => a && roundAccounts(a))(addAccounts(rows.map((x) => (x.data as any).accounts))),
      days: rows.map((x) => ({
        day: x.day,
        partial: x.partial,
        final: x.final,
        ...view(addDays([x.data]), batteryKwh),
        // what the day learnt (L4): the forecast's accuracy, the strategy it ran, the best one in hindsight
        accuracy: (x.data as any).accuracy ?? null,
        strategy: (x.data as any).strategy ?? null,
        hindsight: (x.data as any).hindsight ?? null,
        // the day's type, prices and review (review.ts - what it could have saved, why, what next time)
        dayType: (x.data as any).dayType ?? null,
        prices: (x.data as any).prices ?? null,
        review: (x.data as any).review ?? null,
        notes: (x.data as any).notes ?? null,
        analog: (x.data as any).analog ?? null,
        accounts: (x.data as any).accounts ?? null,
      })),
    };
  };

  // the process's own record of a day - internal services only
  app.put("/energy-ledger/:processId/days/:day", { config: { permission: "service" } }, async (request: any, reply: any) => {
    const processId = Number(request.params.processId);
    const { day } = request.params;
    if (!DAY.test(day)) return reply.code(400).send({ error: "day YYYY-MM-DD" });
    if (!(await ledgerOf(processId))) return reply.code(404).send({ error: "energy-ledger process not found" });
    const { data, partial, final } = request.body ?? {};
    if (!data || typeof data !== "object") return reply.code(400).send({ error: "data is required" });
    await pool.query(
      `INSERT INTO ledger_days (process_id, day, data, partial, final) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (process_id, day) DO UPDATE SET data = $3, partial = $4, final = $5, updated_at = now()`,
      [processId, day, JSON.stringify(data), partial === true, final === true],
    );
    return { status: "ok" };
  });

  // days from .. to (the plan's history - its heating factor)
  app.get("/energy-ledger/:processId/days", async (request: any, reply: any) => {
    const from = String(request.query?.from ?? "");
    const to = String(request.query?.to ?? "");
    if (!DAY.test(from) || !DAY.test(to)) return reply.code(400).send({ error: "from / to YYYY-MM-DD" });
    if (!(await ledgerOf(Number(request.params.processId)))) return reply.code(404).send({ error: "energy-ledger process not found" });
    return { days: await daysOf(Number(request.params.processId), from, to) };
  });

  // the process's latest plan - written by it (internal service only), read by the UI and the AI
  app.put("/energy-ledger/:processId/plan", { config: { permission: "service" } }, async (request: any, reply: any) => {
    const processId = Number(request.params.processId);
    if (!(await ledgerOf(processId))) return reply.code(404).send({ error: "energy-ledger process not found" });
    const body = request.body ?? {};
    if (!Number.isFinite(body.madeAt) || !Array.isArray(body.slots)) return reply.code(400).send({ error: "madeAt and slots are required" });
    await pool.query(
      `INSERT INTO ledger_plans (process_id, made_at, data) VALUES ($1, to_timestamp($2 / 1000.0), $3)
       ON CONFLICT (process_id) DO UPDATE SET made_at = to_timestamp($2 / 1000.0), data = $3`,
      [processId, body.madeAt, JSON.stringify(body)],
    );
    return { status: "ok" };
  });

  // the process's strategy proposal (selection "propose") - under its AI instance's Config level
  app.post("/energy-ledger/:processId/strategy-proposal", { config: { permission: "service" } }, async (request: any, reply: any) => {
    const processId = Number(request.params.processId);
    const ledger = await ledgerOf(processId);
    if (!ledger) return reply.code(404).send({ error: "energy-ledger process not found" });
    const { key, reason } = request.body ?? {};
    if (typeof key !== "string" || typeof reason !== "string") return reply.code(400).send({ error: "key and reason are required" });
    const proposal = await proposeConfig?.(processId, { strategy: { ...(ledger.config?.strategy ?? {}), key } }, reason);
    return { proposal: proposal ? { id: proposal.id, status: proposal.status } : null };
  });

  // the learning's samples (L4): the process writes a slot's (internal service only), reads a range back
  app.put("/energy-ledger/:processId/samples", { config: { permission: "service" } }, async (request: any, reply: any) => {
    const processId = Number(request.params.processId);
    if (!(await ledgerOf(processId))) return reply.code(404).send({ error: "energy-ledger process not found" });
    const sample = request.body ?? {};
    if (!Number.isFinite(sample.t)) return reply.code(400).send({ error: "t is required" });
    await pool.query(
      `INSERT INTO ledger_samples (process_id, t, data) VALUES ($1, to_timestamp($2 / 1000.0), $3)
       ON CONFLICT (process_id, t) DO UPDATE SET data = $3`,
      [processId, sample.t, JSON.stringify(sample)],
    );
    return { status: "ok" };
  });

  app.get("/energy-ledger/:processId/samples", async (request: any, reply: any) => {
    const processId = Number(request.params.processId);
    const from = Number(request.query?.from);
    const to = Number(request.query?.to ?? Date.now());
    if (!Number.isFinite(from) || !Number.isFinite(to)) return reply.code(400).send({ error: "from / to - ms" });
    if (!(await ledgerOf(processId))) return reply.code(404).send({ error: "energy-ledger process not found" });
    const { rows } = await pool.query(
      "SELECT data FROM ledger_samples WHERE process_id = $1 AND t >= to_timestamp($2 / 1000.0) AND t < to_timestamp($3 / 1000.0) ORDER BY t",
      [processId, from, to],
    );
    return { samples: rows.map((r: { data: unknown }) => r.data) };
  });

  // --- the operational days' notes (notes.ts; migration 088) ---------------------------------
  // the notes the ledger weighs: its own (the logic, its calendar's holidays), its energy field's (technical) and
  // its heatings' (the core's day_notes - each panel writes its own)
  const notesOf = async (processId: number, from: string, to: string) => {
    const cfg = (await ledgerOf(processId))?.config ?? {};
    const ids = [processId, cfg.fieldProcessId, ...(cfg.heatingProcessIds ?? [])].filter((x) => Number.isInteger(x));
    return dayNotesOf ? dayNotesOf(ids, from, to) : [];
  };

  const todayOf = (ledger: { config: Record<string, any> }) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: ledger.config?.timeZone || undefined, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const plusDays = (day: string, n: number) => new Date(Date.parse(`${day}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

  /**
   * Today's description in words: the AI's - its latest scheduled day-plan run today (the "Summary:" line of
   * its answer, else its first paragraph) - over the ledger's own (its metrics' `summary`, no AI needed).
   */
  const summaryOf = async (processId: number, today: string, timeZone?: string) => {
    const ai = (
      await pool.query(
        `SELECT c.id, m.content, m.created_at FROM ai_conversations c
           JOIN LATERAL (SELECT content, created_at FROM ai_messages WHERE conversation_id = c.id AND role = 'assistant' AND content IS NOT NULL AND content <> ''
                          ORDER BY id DESC LIMIT 1) m ON true
          WHERE c.process_id = $1 AND c.work_type = 'day-plan' AND c.created_at > now() - interval '30 hours'
          ORDER BY c.id DESC LIMIT 1`,
        [processId],
      )
    ).rows[0];
    const me = ((await processMetrics?.(processId)) ?? {}) as Record<string, any>;
    const auto = typeof me.summary === "string" && me.date === today ? me.summary : null;
    if (ai) {
      const text = String(ai.content);
      const line = text.match(/^\s*\**summary:?\**\s*(.+)$/im)?.[1] ?? text.split(/\n\s*\n/)[0];
      const day = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(ai.created_at);
      if (day === today) return { text: line.replace(/[*_#`]/g, "").trim(), source: "ai", at: new Date(ai.created_at).getTime(), conversationId: ai.id, auto };
    }
    return auto ? { text: auto, source: "auto", at: null, conversationId: null, auto } : null;
  };

  app.get("/energy-ledger/:processId/notes", async (request: any, reply: any) => {
    const processId = Number(request.params.processId);
    const ledger = await ledgerOf(processId);
    if (!ledger) return reply.code(404).send({ error: "energy-ledger process not found" });
    const from = String(request.query?.from ?? todayOf(ledger));
    const to = String(request.query?.to ?? plusDays(from, NOTES_DEFAULT_DAYS));
    if (!DAY.test(from) || !DAY.test(to)) return reply.code(400).send({ error: "from / to YYYY-MM-DD" });
    return { today: todayOf(ledger), notes: await notesOf(processId, from, to), summary: await summaryOf(processId, todayOf(ledger), ledger.config?.timeZone || undefined) };
  });

  // the automatic notes: the configured country's public holidays from .. to - idempotent (a dismissed or
  // edited one left as it is; a holiday no longer in the calendar - a changed country - removed)
  app.post("/energy-ledger/:processId/notes/sync", { config: { permission: "service" } }, async (request: any, reply: any) => {
    const processId = Number(request.params.processId);
    const ledger = await ledgerOf(processId);
    if (!ledger) return reply.code(404).send({ error: "energy-ledger process not found" });
    const { from, to } = request.body ?? {};
    if (!DAY.test(String(from)) || !DAY.test(String(to))) return reply.code(400).send({ error: "from / to YYYY-MM-DD" });
    const cal = ledger.config?.calendar ?? {};
    const days = cal.country && holidaysOf ? holidaysOf(String(cal.country), cal.region ?? null, from, to) : [];
    const keys: string[] = [];
    for (const h of days) {
      const key = `holiday:${String(cal.country).toUpperCase()}${cal.region ? `-${cal.region}` : ""}:${h.date}`;
      keys.push(key);
      await pool.query(
        `INSERT INTO day_notes (process_id, day, kind, text, source, auto_key) VALUES ($1, $2, 'holiday', $3, 'auto', $4)
         ON CONFLICT (process_id, auto_key) WHERE auto_key IS NOT NULL
         DO UPDATE SET text = EXCLUDED.text, updated_at = now() WHERE day_notes.source = 'auto' AND NOT day_notes.dismissed`,
        [processId, h.date, h.name, key],
      );
    }
    await pool.query(
      `DELETE FROM day_notes WHERE process_id = $1 AND source = 'auto' AND auto_key LIKE 'holiday:%' AND day BETWEEN $2 AND $3 AND NOT (auto_key = ANY($4))`,
      [processId, from, to, keys],
    );
    return { holidays: days };
  });

  const planOf = async (processId: number) =>
    (await pool.query("SELECT data FROM ledger_plans WHERE process_id = $1", [processId])).rows[0]?.data ?? null;

  app.get("/energy-ledger/:processId/plan", async (request: any, reply: any) => {
    const processId = Number(request.params.processId);
    if (!(await ledgerOf(processId))) return reply.code(404).send({ error: "energy-ledger process not found" });
    return { plan: await planOf(processId) };
  });

  // the let units (the tenant accounts - 2026-10-25): what each consumed and is to pay over a period - the
  // closed days only (the current month grows once a day); day / week (Mon-Sun) / month / year around
  // ?day=, or all; each month's figures too (a year / all)
  app.get("/energy-ledger/:processId/tenants", async (request: any, reply: any) => {
    const processId = Number(request.params.processId);
    const ledger = await ledgerOf(processId);
    if (!ledger) return reply.code(404).send({ error: "energy-ledger process not found" });
    const period = String(request.query?.period ?? "month");
    const today = todayOf(ledger);
    const day = String(request.query?.day ?? plusDays(today, -1));
    if (!["day", "week", "month", "year", "all"].includes(period) || !DAY.test(day)) return reply.code(400).send({ error: "period day / week / month / year / all and day YYYY-MM-DD" });
    let range: [string, string];
    if (period === "all") range = ["2000-01-01", today];
    else if (period === "week") {
      const monday = plusDays(day, -((new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7));
      range = [monday, plusDays(monday, 6)];
    } else range = periodOf(period, day);
    const rows = (await daysOf(processId, range[0], range[1])).filter((x) => x.final);
    const tenants = (x: any) => ((x.data as any).accounts?.items ?? []).filter((a: any) => a.kind === "tenant");
    const sum = (days: typeof rows) => {
      const total = addAccounts(days.map((x) => ({ items: tenants(x), byKind: { private: 0, business: 0, tenant: 0 }, otherEur: 0 })));
      return total ? roundAccounts(total).items : [];
    };
    const months = [...new Set(rows.map((x) => x.day.slice(0, 7)))].sort();
    return {
      period,
      day,
      from: range[0],
      to: range[1],
      // the last closed day counted
      through: rows.length ? rows[rows.length - 1].day : null,
      days: rows.length,
      items: sum(rows),
      months: period === "year" || period === "all" ? months.map((m) => ({ month: m, items: sum(rows.filter((x) => x.day.startsWith(m))) })) : [],
    };
  });

  // a period (day / month / year around ?day=) - its days and its sum with the bridge
  app.get("/energy-ledger/:processId/period", async (request: any, reply: any) => {
    const { status, ...body } = await periodView(Number(request.params.processId), String(request.query?.period ?? "day"), String(request.query?.day ?? ""));
    return reply.code(status).send(body);
  });

  const resolveProcess = async (input: Record<string, unknown>, toolCtx: { instance: { processId: number | null } }) => {
    const id = typeof input.processId === "number" ? input.processId : toolCtx.instance.processId;
    if (id !== null) return id;
    const { rows } = await pool.query("SELECT id FROM processes WHERE kind = 'energy-ledger' ORDER BY id");
    if (rows.length !== 1) throw new Error(`processId is required - an energy-ledger process (there are ${rows.length})`);
    return rows[0].id as number;
  };

  registerAiTool?.({
    name: "ledger.anomalies",
    description:
      "What looks wrong today across the site the Energy Ledger records (L5 - for its daily report): a PV block giving clearly less per kWp than its group's median (soiling, shading, a failed string -> maintenance), a turbine less per rated kW than its neighbours, the forecast's accuracy low, the batteries under their reserve, generation held back, rooms far from their setpoint. Each finding - the unit, the evidence (figures), a hint at the cause. Empty - nothing found.",
    input: {
      type: "object",
      properties: { processId: { type: "integer", description: "the energy-ledger process; default - the instance's own, else the only one" } },
      additionalProperties: false,
    },
    async run(input: Record<string, unknown>, toolCtx: { instance: { processId: number | null } }) {
      const processId = await resolveProcess(input, toolCtx);
      const ledger = await ledgerOf(processId);
      if (!ledger) throw new Error("energy-ledger process not found");
      const cfg = ledger.config ?? {};
      const field = cfg.fieldProcessId ? (((await processMetrics?.(cfg.fieldProcessId)) ?? {}) as Record<string, any>) : {};
      const me = ((await processMetrics?.(processId)) ?? {}) as Record<string, any>;
      const findings: { kind: string; unit: string | null; evidence: string; hint: string }[] = [];
      const median = (xs: number[]) => {
        const a = [...xs].sort((x, y) => x - y);
        return a.length ? (a[Math.floor((a.length - 1) / 2)] + a[Math.ceil((a.length - 1) / 2)]) / 2 : 0;
      };
      // the units against their group's median (per kWp / per rated kW), when the day gave enough to compare
      const compare = (items: any[], size: (x: any) => number, minPerSize: number, share: number, kind: string, hint: string) => {
        const groups = new Map<string, any[]>();
        for (const x of items) if (x.on !== false && x.state !== "off" && size(x) > 0) groups.set(x.group ?? "", [...(groups.get(x.group ?? "") ?? []), x]);
        for (const [, list] of groups) {
          if (list.length < 3) continue;
          const m = median(list.map((x) => x.todayKwh / size(x)));
          if (m < minPerSize) continue;
          for (const x of list) {
            const own = x.todayKwh / size(x);
            if (own < m * share)
              findings.push({ kind, unit: x.name, evidence: `${own.toFixed(2)} kWh per ${kind === "pv" ? "kWp" : "rated kW"} today vs the group's median ${m.toFixed(2)} (${Math.round((own / m) * 100)} %)`, hint });
          }
        }
      };
      compare(field.pv ?? [], (x) => x.kWp, 0.3, 0.85, "pv", "less than its neighbours under the same sky - soiling, shading, a failed string or inverter: a maintenance visit");
      compare(field.wind ?? [], (x) => x.ratedKw, 0.3, 0.7, "wind", "less than its neighbours in the same wind - the yaw, a blade, the brake: a check");
      const acc = me.learning?.accuracy ?? {};
      if ((me.learning?.samplesToday ?? 0) >= 16) {
        if (acc.generationPct !== null && acc.generationPct < 75) findings.push({ kind: "forecast", unit: null, evidence: `generation forecast accuracy ${Math.round(acc.generationPct)} % today`, hint: "the weather forecast missed - or a unit gave less than the models expect" });
        if (acc.consumptionPct !== null && acc.consumptionPct < 85) findings.push({ kind: "forecast", unit: null, evidence: `consumption forecast accuracy ${Math.round(acc.consumptionPct)} % today`, hint: "an unusual day (a holiday, a new machine) - or the profile needs updating" });
      }
      const t = field.totals ?? {};
      const reserve = Number(field.strategy?.reservePct);
      if (Number.isFinite(t.socPct) && Number.isFinite(reserve) && t.socPct < reserve - 2) findings.push({ kind: "batteries", unit: null, evidence: `the batteries at ${t.socPct} %, under their ${reserve} % reserve`, hint: "an outage used them, or the plan couldn't recharge yet" });
      const today = field.today ?? {};
      const gen = (today.pvKwh ?? 0) + (today.windKwh ?? 0);
      if (gen > 10 && (today.curtailedKwh ?? 0) / gen > 0.05) findings.push({ kind: "curtailment", unit: null, evidence: `${Math.round(today.curtailedKwh)} kWh held back today (${Math.round((today.curtailedKwh / gen) * 100)} % of the generation)`, hint: "the export limit or the batteries full - a larger connection, more storage or a flexible load" });
      for (const hid of cfg.heatingProcessIds ?? []) {
        const h = ((await processMetrics?.(hid)) ?? {}) as Record<string, any>;
        for (const c of h.consumers ?? [])
          if (c.on && c.roomC !== null && c.setpointC !== null && Math.abs(c.roomC - c.setpointC) > 1.5)
            findings.push({ kind: "comfort", unit: c.name, evidence: `${c.roomC} C, the setpoint ${c.setpointC} C`, hint: "the fan coil can't keep up (an open window, the tanks low) or it is set off" });
      }
      return { findings };
    },
  });

  registerAiTool?.({
    name: "ledger.notes",
    description:
      "The operational days' notes the Energy Ledger's plan weighs - its own, its energy field's and its heatings' (each with its process) - from .. to (default today and 14 days on): what is known about each day - outage (no grid in its window: the batteries charged ahead to carry the site), holiday / day-off (the consumption as a day off's), workday (a working weekend - as a working day's), maintenance (its nodes out in its window: no PV / wind from them, the batteries' power less), other (for people and you). Each day's type (working or not, and why). Source: auto (the country's holidays), ai, user. " +
      "To add / change / remove a note use daynote.propose on the process it belongs to - the energy field's technical ones (outage, maintenance), this ledger's logic (holiday, day-off, workday), a heating's (maintenance, room-closed) - e.g. when a person tells you tomorrow is a day off, or the grid operator announced works. Ask when unsure (a bridge day, a regional holiday).",
    input: {
      type: "object",
      properties: {
        processId: { type: "integer", description: "the energy-ledger process; default - the instance's own, else the only one" },
        from: { type: "string", description: "YYYY-MM-DD; default - the ledger's today" },
        to: { type: "string", description: "YYYY-MM-DD; default - 14 days after from" },
      },
      additionalProperties: false,
    },
    async run(input: Record<string, unknown>, toolCtx: { instance: { processId: number | null } }) {
      const processId = await resolveProcess(input, toolCtx);
      const ledger = await ledgerOf(processId);
      if (!ledger) throw new Error("energy-ledger process not found");
      const from = typeof input.from === "string" && DAY.test(input.from) ? input.from : todayOf(ledger);
      const to = typeof input.to === "string" && DAY.test(input.to) ? input.to : plusDays(from, NOTES_DEFAULT_DAYS);
      const notes = await notesOf(processId, from, to);
      const days: Record<string, unknown>[] = [];
      for (let d = from; d <= to && days.length < 120; d = plusDays(d, 1)) {
        const own = notes.filter((n: any) => n.day === d);
        const type = dayTypeOf(d, own.map(noteOf));
        if (own.length || type.weekday === 0 || type.weekday === 6)
          days.push({ day: d, ...type, notes: own.map((n: any) => ({ ...n, startsAt: n.startsAt && new Date(n.startsAt).toISOString(), endsAt: n.endsAt && new Date(n.endsAt).toISOString() })) });
      }
      return { today: todayOf(ledger), calendar: ledger.config?.calendar ?? null, days, note: "days without notes on working weekdays are left out" };
    },
  });

  registerAiTool?.({
    name: "ledger.similarDays",
    description:
      "The recorded days most similar to a day (default today - its forecast: the sun, the wind, the temperature, working or not, the prices' level and spread, the season), the best-run ones first (the least left on the table by their review, then the largest saving): each one's features, distance, saving %, what it could have saved (regretEur), the strategy it ran and the best one in hindsight, its review's recommendation. And what they say - the strategy best on most of them (weighted by nearness; null - too few or they don't agree). With selection \"analog\" the ledger applies that strategy itself each morning. Use it before proposing a strategy for a day.",
    input: {
      type: "object",
      properties: {
        processId: { type: "integer", description: "the energy-ledger process; default - the instance's own, else the only one" },
        day: { type: "string", description: "a recorded day YYYY-MM-DD to compare with the days before it; default - today (from the forecast)" },
        count: { type: "integer", minimum: 1, maximum: 15, default: 5 },
      },
      additionalProperties: false,
    },
    async run(input: Record<string, unknown>, toolCtx: { instance: { processId: number | null } }) {
      const processId = await resolveProcess(input, toolCtx);
      const ledger = await ledgerOf(processId);
      if (!ledger) throw new Error("energy-ledger process not found");
      const today = todayOf(ledger);
      const day = typeof input.day === "string" && DAY.test(input.day) ? input.day : today;
      const names = Object.fromEntries(STRATEGIES.map((x) => [x.key, x.name]));
      if (day === today) {
        const me = ((await processMetrics?.(processId)) ?? {}) as Record<string, any>;
        if (me.analogs) return { day, selection: ledger.config?.strategy?.selection ?? "fixed", ...me.analogs };
      }
      const rows = await daysOf(processId, plusDays(day, -365), plusDays(day, day === today ? -1 : 0));
      const own = rows.find((x) => x.day === day);
      if (!own && day !== today) throw new Error(`${day} is not recorded`);
      if (!own) return { day, note: "today's forecast features are computed by the ledger with selection \"analog\" - none yet; ask for a recorded day" };
      const target = featuresOfRecord(day, own.data as any);
      const days = similarDays(target, rows.filter((x) => x.day < day), { count: typeof input.count === "number" ? input.count : 5 });
      return { day, target, days, choice: analogChoice(days, names) };
    },
  });

  registerAiTool?.({
    name: "ledger.plan",
    description:
      "The Energy Ledger's plan (L2): for every 15-minute slot ahead (to the end of the day-ahead prices) the forecast (generation, consumption with the heating), the prices (buy / sell ct/kWh), the batteries' planned power (+ discharge / - charge), the grid, the SoC, the money and the same slot without the batteries; the steps (charge / discharge / hold, when, at what power, what each saves) and the sums. The energy field's Auto mode follows the slot now. `slots: true` - every slot too, else the steps and the sums.",
    input: {
      type: "object",
      properties: {
        processId: { type: "integer", description: "the energy-ledger process; default - the instance's own, else the only one" },
        slots: { type: "boolean", default: false },
      },
      additionalProperties: false,
    },
    async run(input: Record<string, unknown>, toolCtx: { instance: { processId: number | null } }) {
      const processId = await resolveProcess(input, toolCtx);
      const plan = await planOf(processId);
      if (!plan) return { note: "no plan yet" };
      const sum = (k: string) => plan.slots.reduce((a: number, x: any) => a + (x[k] ?? 0), 0);
      const totals = { costEur: r(sum("costEur")), baselineEur: r(sum("baselineEur")), savingEur: r(sum("baselineEur") - sum("costEur")) };
      return input.slots ? { ...plan, totals } : { madeAt: plan.madeAt, reason: plan.reason, heating: plan.heating, steps: plan.steps, totals };
    },
  });

  registerAiTool?.({
    name: "ledger.history",
    description:
      "The Energy Ledger's journal for a period (day / month / year around a day): the sum - energy (consumption, the heating's electricity, PV, wind, import, export, charge / discharge, curtailed, the rooms' heat), money (cost, revenue, all the consumption at the slots' prices, the heating's baselines), the savings bridge (without the system - heat pumps - heat storage - own energy - sales = paid; EUR and kWh), the KPIs (saved EUR / %, self-sufficiency, own use of the generation, battery cycles, average purchase price); with `days: true` - every day's too, each with its type (weekday, working), its prices (min / avg / max ct/kWh) and, once closed, its review (what it could have saved at best - regretEur, split into the forecast's part and the strategy's part - every strategy's EUR with a perfect forecast, the forecast's PV / wind / consumption against the actual, and the system's recommendation for next time). A day marked partial was recorded only from the ledger's start.",
    input: {
      type: "object",
      properties: {
        processId: { type: "integer", description: "the energy-ledger process; default - the instance's own, else the only one" },
        period: { enum: ["day", "month", "year"], default: "month" },
        day: { type: "string", description: "a day in the period, YYYY-MM-DD; default - today" },
        days: { type: "boolean", default: false, description: "include every day of the period" },
      },
      additionalProperties: false,
    },
    async run(input: Record<string, unknown>, toolCtx: { instance: { processId: number | null } }) {
      const processId = await resolveProcess(input, toolCtx);
      const day = typeof input.day === "string" ? input.day : ""; // empty - the ledger's today
      const { status, ...body } = await periodView(processId, typeof input.period === "string" ? input.period : "month", day);
      if (status !== 200) throw new Error((body as { error: string }).error);
      const b = body as Exclude<typeof body, { error: string }>;
      return input.days ? b : { ...b, days: b.days.map((x) => ({ day: x.day, partial: x.partial, savedEur: x.kpis.savedEur, netEur: x.kpis.netEur })) };
    },
  });
}
