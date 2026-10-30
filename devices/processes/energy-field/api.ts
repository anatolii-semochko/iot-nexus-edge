/**
 * "energy-field" process kind - API side (CORE Library package, AGENTS.md
 * section 82): the config's schema (configSchemas.ts - config edits and
 * the commands' patches are checked) and the AI Assistant's tool
 * `energy.field` - the field's state now (from the process's metrics).
 * The commands themselves are the core's (POST /processes/:id/commands,
 * processes.control) - process.ts applies them.
 */

const item = {
  nodeId: { type: "integer" },
  name: { type: "string", maxLength: 60 },
  group: { type: "string", maxLength: 30 },
};

const CONFIG_SCHEMA = {
  title: "Energy Field config",
  description:
    "The site's generation and storage: PV blocks, wind turbines, the battery array, the consumption; the groups; the strategy (mode, reserve, export, grid charging, manual power); the weather and grid processes it uses",
  type: "object",
  properties: {
    timeZone: { type: "string", maxLength: 60 },
    weatherProcessId: { type: "integer" },
    gridProcessId: { type: "integer" },
    groups: {
      type: "array",
      maxItems: 20,
      items: {
        type: "object",
        // block - which units the group holds: generation (the PV blocks and the turbines - the default) or batteries
        properties: { key: { type: "string", maxLength: 30 }, name: { type: "string", maxLength: 60 }, block: { enum: ["generation", "batteries"] } },
        required: ["key", "name"],
        additionalProperties: false,
      },
    },
    pvBlocks: {
      type: "array",
      items: {
        type: "object",
        properties: { ...item, kWp: { type: "number", exclusiveMinimum: 0 }, acKw: { type: "number", exclusiveMinimum: 0 }, yieldFactor: { type: "number", minimum: 0, maximum: 1.2 } },
        required: ["nodeId", "name", "kWp", "acKw"],
      },
    },
    turbines: {
      type: "array",
      items: {
        type: "object",
        properties: {
          ...item,
          model: { type: "string" },
          ratedKw: { type: "number", exclusiveMinimum: 0 },
          cutInMs: { type: "number", minimum: 0 },
          ratedMs: { type: "number", exclusiveMinimum: 0 },
          cutOutMs: { type: "number", exclusiveMinimum: 0 },
          ratedRpm: { type: "number", exclusiveMinimum: 0 },
          hubHeightM: { type: "number", exclusiveMinimum: 0 },
        },
        required: ["nodeId", "name", "ratedKw", "cutInMs", "ratedMs", "cutOutMs", "ratedRpm", "hubHeightM"],
      },
    },
    batteries: {
      type: "array",
      items: {
        type: "object",
        properties: {
          ...item,
          capacityKwh: { type: "number", exclusiveMinimum: 0 },
          maxChargeKw: { type: "number", exclusiveMinimum: 0 },
          maxDischargeKw: { type: "number", exclusiveMinimum: 0 },
          nominalV: { type: "number", exclusiveMinimum: 0 },
        },
        required: ["nodeId", "name", "capacityKwh", "maxChargeKw", "maxDischargeKw"],
      },
    },
    consumer: {
      type: "object",
      properties: {
        ...item,
        profile: {
          type: "object",
          properties: {
            baseKw: { type: "number", minimum: 0 },
            weekdayPeakKw: { type: "number", minimum: 0 },
            weekendPeakKw: { type: "number", minimum: 0 },
            workFrom: { type: "string", pattern: "^([01]\\d|2[0-3]):[0-5]\\d$" },
            workTo: { type: "string", pattern: "^([01]\\d|2[0-3]):[0-5]\\d$" },
          },
          required: ["baseKw", "weekdayPeakKw", "weekendPeakKw", "workFrom", "workTo"],
        },
        subMeters: {
          type: "array",
          maxItems: 100,
          description: "the rooms' / areas' electricity meters (power-meter nodes): a simulated one gets `share` of the profile's consumption (withLoads - plus the loadProcessIds' electricity: true - all of them, or a list of process ids); `of` - a main meter (a building's) summing other sub-meters (their node ids) on top",
          items: {
            type: "object",
            properties: {
              ...item,
              share: { type: "number", minimum: 0, maximum: 1 },
              withLoads: { oneOf: [{ type: "boolean" }, { type: "array", items: { type: "integer" }, maxItems: 20 }] },
              of: { type: "array", items: { type: "integer" }, maxItems: 100 },
            },
            required: ["nodeId", "name"],
          },
        },
      },
      required: ["nodeId", "name", "profile"],
    },
    strategy: {
      type: "object",
      properties: {
        mode: { enum: ["auto", "manual", "island"] },
        socMinPct: { type: "number", minimum: 0, maximum: 50 },
        socMaxPct: { type: "number", minimum: 50, maximum: 100 },
        reservePct: { type: "number", minimum: 0, maximum: 100 },
        exportAllowed: { type: "boolean" },
        gridChargeAllowed: { type: "boolean" },
        manualBatteryKw: { type: "number" },
      },
      additionalProperties: false,
    },
    ledgerProcessId: { type: "integer", description: "the energy-ledger whose plan Auto follows" },
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
    alerts: {
      type: "object",
      description: "The critical states the scene shows red: the import / the consumption over the plan's by overPlanPct (30) and overPlanMinKw (20); a unit over its rating by overRatedPct (2)",
      properties: {
        overPlanPct: { type: "number", minimum: 0, maximum: 500 },
        overPlanMinKw: { type: "number", minimum: 0 },
        overRatedPct: { type: "number", minimum: 0, maximum: 100 },
      },
      additionalProperties: false,
    },
    selfSufficiencyLevels: {
      type: "object",
      description: "the Ledger block's self-sufficiency today coloured: green from `good` (60) %, yellow from `fair` (30) %, red under it",
      properties: { good: { type: "number", minimum: 0, maximum: 100 }, fair: { type: "number", minimum: 0, maximum: 100 } },
      additionalProperties: false,
    },
    loadProcessIds: { type: "array", maxItems: 20, items: { type: "integer" }, description: "processes whose electricity (metrics electricKw) is part of the site's consumption - e.g. heating-control" },
    disabled: { type: "array", items: { type: "integer" } },
    simulation: {
      type: "object",
      properties: {
        intervalSeconds: { type: "integer", minimum: 5, maximum: 3600 },
        pvLosses: { type: "object", description: "a simulated fault the forecast doesn't know: PV block nodeId -> the share it really gives", additionalProperties: { type: "number", minimum: 0, maximum: 1 } },
      },
      additionalProperties: false,
    },
  },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- a Library package is loaded at run time by the api and imports nothing from it
export default async function energyFieldApi(_app: any, ctx: any): Promise<void> {
  const { pool, registerConfigSchema, registerAiTool, processMetrics } = ctx;
  registerConfigSchema?.("energy-field", CONFIG_SCHEMA);

  registerAiTool?.({
    name: "energy.field",
    description:
      "The energy field now (an energy-field process): the mode (auto / manual / island) and its current decision, the totals (PV, wind, consumption, battery + discharge / - charge, grid + import / - export, curtailed, the array's SoC), the price now and its rank in the day ahead, the weather it runs on, the groups' generation, every PV block / turbine / battery (power, state, SoC), today's energy (PV, wind, consumption, charge / discharge, import / export, curtailed, self-sufficiency %). Changes go through the process's commands (setMode, setManualPower, setExport, setReserve, setEnabled) - propose them with the control tool.",
    input: {
      type: "object",
      properties: {
        processId: { type: "integer", description: "the energy-field process; default - the instance's own, else the only one" },
        items: { type: "boolean", default: false, description: "include every block / turbine / battery" },
      },
      additionalProperties: false,
    },
    async run(input: Record<string, unknown>, toolCtx: { instance: { processId: number | null } }) {
      let processId = typeof input.processId === "number" ? input.processId : toolCtx.instance.processId;
      if (processId === null) {
        const { rows } = await pool.query("SELECT id FROM processes WHERE kind = 'energy-field' ORDER BY id");
        if (rows.length !== 1) throw new Error(`processId is required - an energy-field process (there are ${rows.length})`);
        processId = rows[0].id as number;
      }
      const { rows } = await pool.query("SELECT id, name FROM processes WHERE id = $1 AND kind = 'energy-field'", [processId]);
      if (!rows[0]) throw new Error("energy-field process not found");
      const m = ((await processMetrics?.(processId)) ?? {}) as Record<string, any>;
      if (!m.totals) return { name: rows[0].name, note: "no state yet - the process hasn't run" };
      const { values: _values, pv, wind, batteries, ...rest } = m;
      return input.items ? { name: rows[0].name, ...rest, pv, wind, batteries } : { name: rows[0].name, ...rest, batteries };
    },
  });
}
