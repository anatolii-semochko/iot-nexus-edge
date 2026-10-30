/**
 * "heating-control" process kind - API side (CORE Library package, AGENTS.md
 * section 82): the config's schema (configSchemas.ts - config edits and
 * the commands' patches are checked) and the AI Assistant's tool
 * `heating.status` - the heating / cooling now (from the process's metrics).
 * The commands themselves are the core's (POST /processes/:id/commands,
 * processes.control) - process.ts applies them.
 */

const item = {
  nodeId: { type: "integer" },
  name: { type: "string", maxLength: 60 },
  group: { type: "string", maxLength: 30 },
  model: { type: "string", maxLength: 60 },
};
const deviceIds = (roles: string[]) => ({
  type: "object",
  description: "the item's devices by their role (device ids)",
  properties: Object.fromEntries(roles.map((k) => [k, { type: "integer" }])),
  additionalProperties: false,
});
const band = {
  type: "object",
  properties: { startC: { type: "number" }, stopC: { type: "number" } },
  required: ["startC", "stopC"],
  additionalProperties: false,
};

const CONFIG_SCHEMA = {
  title: "Heating Control config",
  description:
    "A site's heating / cooling on water: heat pumps, buffer tanks, consumers (fan coils) with their rooms; the groups of each block; the control (mode auto / heating / cooling / off, the auto mode's outdoor thresholds, the room setpoints, the tanks' start / stop temperatures); the weather and grid processes it uses",
  type: "object",
  properties: {
    timeZone: { type: "string", maxLength: 60 },
    weatherProcessId: { type: "integer" },
    gridProcessId: { type: "integer" },
    groups: {
      type: "array",
      maxItems: 30,
      items: {
        type: "object",
        properties: { key: { type: "string", maxLength: 30 }, name: { type: "string", maxLength: 60 }, block: { enum: ["pumps", "tanks", "consumers"] } },
        required: ["key", "name", "block"],
        additionalProperties: false,
      },
    },
    heatPumps: {
      type: "array",
      items: {
        type: "object",
        properties: {
          ...item,
          ratedHeatKw: { type: "number", exclusiveMinimum: 0 },
          ratedCoolKw: { type: "number", exclusiveMinimum: 0 },
          nominalFlowLpm: { type: "number", exclusiveMinimum: 0 },
          fanRatedRpm: { type: "number", exclusiveMinimum: 0 },
          carnotEfficiency: { type: "number", minimum: 0.2, maximum: 0.7 },
          minModulation: { type: "number", minimum: 0, maximum: 1 },
          priority: { type: "integer", minimum: 1, maximum: 99, description: "the start order with control.pumpOrder priority (1 first)" },
          devices: deviceIds(["flowTemp", "returnTemp", "outdoorTemp", "flowRate", "heatPower", "heatEnergy", "power", "energy", "fanSpeed", "relay"]),
        },
        required: ["nodeId", "name", "ratedHeatKw", "ratedCoolKw", "nominalFlowLpm", "fanRatedRpm"],
      },
    },
    tanks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          ...item,
          volumeL: { type: "number", exclusiveMinimum: 0 },
          tMinC: { type: "number" },
          tMaxC: { type: "number" },
          lossKwK: { type: "number", minimum: 0 },
          devices: deviceIds(["topTemp", "middleTemp", "bottomTemp"]),
        },
        required: ["nodeId", "name", "volumeL", "tMinC", "tMaxC"],
      },
    },
    consumers: {
      type: "array",
      items: {
        type: "object",
        properties: {
          ...item,
          ratedKw: { type: "number", exclusiveMinimum: 0 },
          fanRatedW: { type: "number", exclusiveMinimum: 0 },
          fanRatedRpm: { type: "number", exclusiveMinimum: 0 },
          room: {
            type: "object",
            properties: { uaKwK: { type: "number", exclusiveMinimum: 0 }, capacityKwhK: { type: "number", exclusiveMinimum: 0 }, gainsKw: { type: "number", minimum: 0 } },
            required: ["uaKwK", "capacityKwhK", "gainsKw"],
            additionalProperties: false,
          },
          setpointC: { type: "object", properties: { heating: { type: "number" }, cooling: { type: "number" } }, additionalProperties: false },
          devices: deviceIds(["temperature", "humidity", "valve", "power", "fanSpeed"]),
        },
        required: ["nodeId", "name", "ratedKw", "fanRatedW", "fanRatedRpm", "room"],
      },
    },
    control: {
      type: "object",
      properties: {
        mode: { enum: ["auto", "heating", "cooling", "off"] },
        heatBelowC: { type: "number" },
        coolAboveC: { type: "number" },
        setpointC: { type: "object", properties: { heating: { type: "number", minimum: 5, maximum: 35 }, cooling: { type: "number", minimum: 5, maximum: 35 } }, additionalProperties: false },
        tank: { type: "object", properties: { heating: band, cooling: band }, additionalProperties: false },
        tankRoomC: { type: "number" },
        closedSetbackK: { type: "number", minimum: 0, maximum: 15, description: "a closed room's setpoint set back by this much (a day note room-closed)" },
        pumpStaggerS: { type: "number", minimum: 0, maximum: 600, description: "the pause between two heat pumps' starts (and stops), s" },
        pumpOrder: { enum: ["auto", "priority"], description: "the next heat pump to start: auto - the least run hours, priority - each one's priority" },
      },
      additionalProperties: false,
    },
    ledgerProcessId: { type: "integer", description: "the energy-ledger whose heating signal (SG-Ready) the tanks follow" },
    plannerProcessId: { type: "integer", description: "the heating-planner whose plan the heat pumps and the rooms follow (else the tanks' band)" },
    disabled: { type: "array", items: { type: "integer" } },
    simulation: { type: "object", properties: { intervalSeconds: { type: "integer", minimum: 5, maximum: 3600 } }, additionalProperties: false },
  },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- a Library package is loaded at run time by the api and imports nothing from it
export default async function heatingControlApi(_app: any, ctx: any): Promise<void> {
  const { pool, registerConfigSchema, registerAiTool, processMetrics } = ctx;
  registerConfigSchema?.("heating-control", CONFIG_SCHEMA);

  registerAiTool?.({
    name: "heating.status",
    description:
      "The heating / cooling now (a heating-control process): the mode (heating / cooling, auto or set by hand), the outdoor temperature and its trend, the totals (heat pumps' heat + / cold -, electricity, COP / EER, the consumers' heat, the tanks' stored heat kWh and %), the water lines between the blocks (warm / cold C, kW), every heat pump / tank / fan coil (state, temperatures, power, the room's temperature, humidity and setpoint), today's account (heat, cold, delivered, electricity; the cost and the baselines - direct electric heating, heat pumps without tanks). Changes go through the process's commands (setMode, setSetpoint, setEnabled) - propose them with the control tool.",
    input: {
      type: "object",
      properties: {
        processId: { type: "integer", description: "the heating-control process; default - the instance's own, else the only one" },
        items: { type: "boolean", default: false, description: "include every heat pump / tank / fan coil" },
      },
      additionalProperties: false,
    },
    async run(input: Record<string, unknown>, toolCtx: { instance: { processId: number | null } }) {
      let processId = typeof input.processId === "number" ? input.processId : toolCtx.instance.processId;
      if (processId === null) {
        const { rows } = await pool.query("SELECT id FROM processes WHERE kind = 'heating-control' ORDER BY id");
        if (rows.length !== 1) throw new Error(`processId is required - a heating-control process (there are ${rows.length})`);
        processId = rows[0].id as number;
      }
      const { rows } = await pool.query("SELECT id, name FROM processes WHERE id = $1 AND kind = 'heating-control'", [processId]);
      if (!rows[0]) throw new Error("heating-control process not found");
      const m = ((await processMetrics?.(processId)) ?? {}) as Record<string, any>;
      if (!m.totals) return { name: rows[0].name, note: "no state yet - the process hasn't run" };
      const { values: _values, pumps, tanks, consumers, ...rest } = m;
      return input.items ? { name: rows[0].name, ...rest, pumps, tanks, consumers } : { name: rows[0].name, ...rest, tanks };
    },
  });
}
