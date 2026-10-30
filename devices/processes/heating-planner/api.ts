/**
 * "heating-planner" process kind - API side (CORE Library package, AGENTS.md section 82): the
 * config's schema; the plan (`heating_plans`, migration 101) - the process writes it (PUT .../plan,
 * internal services only), the UI and the AI read it whole, a heating system its slot now (GET
 * .../now?heating=<processId> - what heating-control executes) and the Energy Ledger the heating's
 * electricity per slot (in the whole plan's `electricity`). The plan in a sentence (GET .../summary): the
 * AI's - its latest scheduled heating-plan run today (the "Summary:" line) - over the process's own. AI
 * tool `heatingPlanner.plan` (P4).
 */

const CONFIG_SCHEMA = {
  title: "Heating Planner config",
  description:
    "Plans the heating systems' heat pumps ahead (15-minute slots, the Energy Ledger's): the rooms' need from the weather, the tanks' and the rooms' comfort margin as the store, the Ledger's prices, the sun's surplus and its signal - the heat, the units and the rooms' offset for each slot, executed by each heating-control",
  type: "object",
  properties: {
    timeZone: { type: "string", maxLength: 60 },
    ledgerProcessId: { type: "integer", description: "the energy-ledger whose plan (prices, the planned export, the heating signal) it plans on" },
    heatingProcessIds: { type: "array", maxItems: 20, items: { type: "integer" }, description: "the heating-control systems it plans" },
    intervalSeconds: { type: "integer", minimum: 10, maximum: 3600 },
    replanMinutes: { type: "integer", minimum: 5, maximum: 240, description: "the plan made again at least this often (and on a new Ledger plan)" },
    comfortK: { type: "number", minimum: 0, maximum: 3, description: "how far a room may sit off its setpoint in the dear hours (heating - below, cooling - above), K" },
    comfortModulation: { type: "number", minimum: 0.3, maximum: 1, description: "the heat pumps' comfortable share of their output - fewer units, lower, longer" },
    startPenaltyEur: { type: "number", minimum: 0, maximum: 5, description: "a heat pump's start in the plan's money (the inrush, the wear)" },
    unitHourEur: { type: "number", minimum: 0, maximum: 1, description: "a running unit-hour in the plan's money (fewer units rather than more)" },
    holdOffCtKwh: { type: "number", minimum: 0, maximum: 100, description: "the Ledger's signal 1 (hold off): this much more per kWh" },
    boostCtKwh: { type: "number", minimum: 0, maximum: 100, description: "all the heat pumps at full power: this much more per kWh of electricity (the peak)" },
    comfortCtKwhH: { type: "number", minimum: 0, maximum: 50, description: "the rooms held off their setpoint: this much per kWh of the margin used and hour" },
    strategy: {
      type: "object",
      description: "the strategy the plan follows (key) and how it is chosen: fixed - the key, cheapest - the least electricity's at each plan",
      properties: { key: { enum: ["cost", "gentle", "comfort", "sun"] }, selection: { enum: ["fixed", "cheapest"] } },
      additionalProperties: false,
    },
    store: {
      type: "object",
      description: "the tanks' useful band (their average temperature) the plan uses",
      properties: {
        heating: { type: "object", properties: { minC: { type: "number" }, maxC: { type: "number" } }, required: ["minC", "maxC"], additionalProperties: false },
        cooling: { type: "object", properties: { minC: { type: "number" }, maxC: { type: "number" } }, required: ["minC", "maxC"], additionalProperties: false },
      },
      additionalProperties: false,
    },
  },
  additionalProperties: false,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- a Library package is loaded at run time by the api and imports nothing from it
export default async function heatingPlannerApi(app: any, ctx: any): Promise<void> {
  const { pool, registerConfigSchema, registerAiTool, processMetrics } = ctx;
  registerConfigSchema?.("heating-planner", CONFIG_SCHEMA);

  const plannerOf = async (processId: number) =>
    (await pool.query("SELECT id FROM processes WHERE id = $1 AND kind = 'heating-planner'", [processId])).rows[0] as { id: number } | undefined;
  const planOf = async (processId: number) => (await pool.query("SELECT data FROM heating_plans WHERE process_id = $1", [processId])).rows[0]?.data ?? null;

  app.put("/heating-planner/:processId/plan", { config: { permission: "service" } }, async (request: any, reply: any) => {
    const processId = Number(request.params.processId);
    if (!(await plannerOf(processId))) return reply.code(404).send({ error: "heating-planner process not found" });
    const body = request.body ?? {};
    if (!Number.isFinite(body.madeAt) || !Array.isArray(body.systems)) return reply.code(400).send({ error: "madeAt and systems are required" });
    await pool.query(
      `INSERT INTO heating_plans (process_id, made_at, data) VALUES ($1, to_timestamp($2 / 1000.0), $3)
       ON CONFLICT (process_id) DO UPDATE SET made_at = to_timestamp($2 / 1000.0), data = $3`,
      [processId, body.madeAt, JSON.stringify(body)],
    );
    return { status: "ok" };
  });

  app.get("/heating-planner/:processId/plan", async (request: any, reply: any) => {
    const processId = Number(request.params.processId);
    if (!(await plannerOf(processId))) return reply.code(404).send({ error: "heating-planner process not found" });
    return { plan: await planOf(processId) };
  });

  // the plan in a sentence: the AI's day plan today (its Summary line) over the process's own
  app.get("/heating-planner/:processId/summary", async (request: any, reply: any) => {
    const processId = Number(request.params.processId);
    const planner = (await pool.query("SELECT id, config FROM processes WHERE id = $1 AND kind = 'heating-planner'", [processId])).rows[0];
    if (!planner) return reply.code(404).send({ error: "heating-planner process not found" });
    const timeZone = planner.config?.timeZone || undefined;
    const dayOf = (at: Date | number) => new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
    const today = dayOf(Date.now());
    const m = ((await processMetrics?.(processId)) ?? {}) as Record<string, any>;
    const auto = typeof m.summary === "string" && m.date === today ? m.summary : null;
    const ai = (
      await pool.query(
        `SELECT c.id, m.content, m.created_at FROM ai_conversations c
           JOIN LATERAL (SELECT content, created_at FROM ai_messages WHERE conversation_id = c.id AND role = 'assistant' AND content IS NOT NULL AND content <> ''
                          ORDER BY id DESC LIMIT 1) m ON true
          WHERE c.process_id = $1 AND c.work_type = 'heating-plan' AND c.created_at > now() - interval '30 hours'
          ORDER BY c.id DESC LIMIT 1`,
        [processId],
      )
    ).rows[0];
    if (ai && dayOf(ai.created_at) === today) {
      const text = String(ai.content);
      const line = text.match(/^\s*\**summary:?\**\s*(.+)$/im)?.[1] ?? text.split(/\n\s*\n/)[0];
      return { text: line.replace(/[*_#`]/g, "").trim(), source: "ai", at: new Date(ai.created_at).getTime(), conversationId: ai.id, auto };
    }
    return auto ? { text: auto, source: "auto", at: null, conversationId: null, auto } : { text: null, source: null, at: null, conversationId: null, auto: null };
  });

  // one heating system's slot now (and the next few) - what its heating-control executes
  app.get("/heating-planner/:processId/now", async (request: any, reply: any) => {
    const processId = Number(request.params.processId);
    const heating = Number(request.query?.heating);
    if (!Number.isInteger(heating)) return reply.code(400).send({ error: "heating=<processId> is required" });
    if (!(await plannerOf(processId))) return reply.code(404).send({ error: "heating-planner process not found" });
    const plan = await planOf(processId);
    const system = plan?.systems?.find((x: any) => x.processId === heating);
    if (!system) return { madeAt: plan?.madeAt ?? null, slot: null, next: [] };
    const now = Date.now();
    const at = (system.slots ?? []).findIndex((x: any) => x.t <= now && now < x.end);
    return {
      madeAt: plan.madeAt,
      mode: system.mode,
      strategy: system.strategy ?? null,
      slot: at >= 0 ? system.slots[at] : null,
      next: at >= 0 ? system.slots.slice(at + 1, at + 5) : [],
    };
  });

  /** The plan's runs (one choice of units in a row) - its steps in words. */
  const stepsOf = (slots: any[]) =>
    slots.reduce((out: any[], x: any) => {
      const last = out[out.length - 1];
      if (last && last.units === x.units) {
        last.end = x.end;
        last.heatKwh += x.heatKw * ((x.end - x.t) / 3_600_000);
        last.n += 1;
        last.ct += x.buyCtKwh;
        last.maxRoomOffsetK = Math.max(last.maxRoomOffsetK, x.roomOffsetK ?? 0);
      } else out.push({ from: x.t, end: x.end, units: x.units, heatKwh: x.heatKw * ((x.end - x.t) / 3_600_000), n: 1, ct: x.buyCtKwh, maxRoomOffsetK: x.roomOffsetK ?? 0 });
      return out;
    }, [])
      .map((x: any) => ({ from: new Date(x.from).toISOString(), to: new Date(x.end).toISOString(), units: x.units, heatKwh: Math.round(x.heatKwh * 10) / 10, avgBuyCtKwh: Math.round((x.ct / x.n) * 10) / 10, maxRoomOffsetK: Math.round(x.maxRoomOffsetK * 100) / 100 }));

  registerAiTool?.({
    name: "heatingPlanner.plan",
    description:
      "The heating planner's plan (heating-planner): for every 15-minute slot of the Energy Ledger's plan and each heating system - the rooms' need, the heat pumps' heat and units, their electricity, the store (the tanks and the rooms' comfort margin), the tanks' temperature, the rooms off their setpoint, the price and the Ledger's signal. Its sums - the electricity against the band control (the same need made when needed), the saving; every strategy compared the same hours ahead (Least cost `cost`, Gentle `gentle` - few starts and low power, Comfort `comfort` - no comfort margin, The sun `sun` - the surplus stored as heat): the electricity, the saving, the starts, the rooms' K-h off, the sun's kWh; the strategy followed and the choice (fixed / cheapest); each system's steps (runs of the same units: from, to, the heat, the price, the rooms). The heatings follow their slot (else their tanks' band). Change the strategy with config.propose on this planner's `strategy` ({ key, selection }); the comfort margin `comfortK` (K), the comfortable modulation `comfortModulation` too. `slots: true` - every slot too.",
    input: {
      type: "object",
      properties: {
        processId: { type: "integer", description: "the heating-planner process; default - the instance's own, else the only one" },
        slots: { type: "boolean", default: false, description: "every slot of every system too" },
      },
      additionalProperties: false,
    },
    async run(input: Record<string, unknown>, toolCtx: { instance: { processId: number | null } }) {
      let processId = typeof input.processId === "number" ? input.processId : toolCtx.instance.processId;
      if (processId === null || !(await plannerOf(processId))) {
        const { rows } = await pool.query("SELECT id FROM processes WHERE kind = 'heating-planner' ORDER BY id");
        if (rows.length !== 1) throw new Error(`processId is required - a heating-planner process (there are ${rows.length})`);
        processId = rows[0].id as number;
      }
      const plan = await planOf(processId);
      if (!plan) return { note: "no plan yet - it waits for the Energy Ledger's plan" };
      const now = Date.now();
      return {
        madeAt: new Date(plan.madeAt).toISOString(),
        strategy: plan.strategy,
        followed: plan.followed ?? plan.strategy?.key,
        strategies: plan.strategies,
        systems: (plan.systems ?? []).map((x: any) => {
          const ahead = (x.slots ?? []).filter((s: any) => s.end > now);
          return {
            processId: x.processId,
            name: x.name,
            mode: x.mode,
            note: x.note,
            units: x.units,
            storeKwh: x.storeKwh,
            marginKwh: x.marginKwh,
            energyEur: x.energyEur,
            baselineEur: x.baselineEur,
            savingEur: x.savingEur,
            strategy: x.strategy,
            strategies: x.strategies,
            now: ahead[0] ?? null,
            steps: stepsOf(ahead),
            ...(input.slots ? { slots: ahead } : {}),
          };
        }),
      };
    },
  });
}
