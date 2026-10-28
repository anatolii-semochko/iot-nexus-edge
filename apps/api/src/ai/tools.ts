import { dayNoteInput } from "../dayNotes.js";
import { Ajv, type ErrorObject, type ValidateFunction } from "ajv";

import { config } from "../config.js";
import { configProblems, configSchemaKinds, configSchemaOf } from "../configSchemas.js";
import { pool } from "../db.js";
import * as processRegistry from "../processRegistry.js";
import { checkProcessConfig, ProcessWriteError } from "../processWrites.js";
import { checkDevice, checkNode, nodeTypeOf, RegistryError } from "../registry.js";
import { isPermission } from "../access/catalog.js";
import { can, FULL_ROLES, principalOf, resolveContext } from "../access/principal.js";
import { computeRights, type Rights } from "../access/rights.js";
import { rolesProblem } from "../routes/access.js";
import { instanceUnits } from "../dnpInstances.js";
import { querySeries, seriesStats } from "../timeSeries.js";
import { docSources, readDoc, searchDocs } from "./docs.js";
import type { Instance } from "./instances.js";
import { aiManifests } from "./manifests.js";
import { type ProposalAccess, type ProposalOrigin, propose } from "./proposals.js";

// The assistant's resource gateway (Nexus Edge AI Assistant, stage 2 -
// nexus-edge-aquarium AGENTS_TO_DO.md 2026-10-17): the ONLY way an agent
// sees (and later changes) the system - a registry of tools, each with its
// contract (name, description, JSON Schema of its input, access level), so
// the descriptions go into a model's tool list as they are and a DNP can
// add its own tools without touching a prompt. Answers are compact
// summaries, not raw dumps, and cut at `config.ai.toolMaxChars`. The same
// registry can later be served as an MCP server.
//
// A tool runs for an instance (instances.ts): its access level must allow
// the tool; a DNP instance's own process is the default `processId`.
// Read tools, then the proposing ones (config / control / install - stage 6,
// ai/proposals.ts): a tool checks its change can apply now and proposes it -
// Auto applies at once, Confirm waits for a person; Off - not runnable.

export type ToolAccess = "read" | ProposalAccess;

export interface ToolContext extends ProposalOrigin {
  instance: Instance;
}

export interface Tool {
  name: string;
  description: string;
  input: Record<string, unknown>; // JSON Schema (an object)
  access: ToolAccess;
  run(input: Record<string, unknown>, ctx: ToolContext): Promise<unknown>;
}

const tools = new Map<string, { tool: Tool; validate: ValidateFunction }>();
const ajv = new Ajv({ allErrors: true, strict: false, useDefaults: true });

export function registerTool(tool: Tool): void {
  tools.set(tool.name, { tool, validate: ajv.compile(tool.input) });
}

/** The tools' contracts - what a model is told it can call. */
export const toolContracts = () =>
  [...tools.values()].map(({ tool }) => ({ name: tool.name, description: tool.description, input: tool.input, access: tool.access }));

export class ToolError extends Error {}

/** Whether an instance's access levels let it run tools of `access` (a proposing one - unless Off). */
export const toolAllowed = (access: ToolAccess, instance: Instance): boolean =>
  access === "read" ? instance.access.read : instance.access[access] !== "off";

// An input's problems as a model can act on them: the unknown field named
// with the allowed ones, a missing one named (ajv's own "must NOT have
// additional properties" left a model guessing which).
function inputProblems(errors: ErrorObject[], schema: Record<string, unknown>): string {
  const allowed = Object.keys((schema.properties ?? {}) as object).join(", ");
  return errors
    .map((e) => {
      const at = e.instancePath || "/";
      if (e.keyword === "additionalProperties") return `${at}: unknown field "${(e.params as { additionalProperty: string }).additionalProperty}" (allowed: ${allowed})`;
      if (e.keyword === "required") return `${at}: "${(e.params as { missingProperty: string }).missingProperty}" is required`;
      return `${at} ${e.message}`;
    })
    .join("; ");
}

/** Runs a tool for an instance: access, input checked; the answer as JSON text, cut at the limit. */
export async function runTool(name: string, input: unknown, ctx: ToolContext): Promise<{ text: string; truncated: boolean }> {
  const entry = tools.get(name);
  if (!entry) throw new ToolError(`no tool "${name}"`);
  if (!toolAllowed(entry.tool.access, ctx.instance)) throw new ToolError(`${ctx.instance.name}: access level ${entry.tool.access} is off`);
  const args = structuredClone((input ?? {}) as Record<string, unknown>);
  if (!entry.validate(args)) throw new ToolError(`invalid input: ${inputProblems(entry.validate.errors ?? [], entry.tool.input)}`);
  const result = await entry.tool.run(args, ctx);
  const text = JSON.stringify(result);
  const max = config.ai.toolMaxChars;
  return text.length > max ? { text: `${text.slice(0, max)} ...[cut - narrow the request]`, truncated: true } : { text, truncated: false };
}

// --- helpers ------------------------------------------------------------------

const DAY_MS = 86_400_000;
// a time: ISO text or ms; absent - the fallback
const timeOf = (v: unknown, fallback: number): number => {
  if (typeof v === "number") return v;
  if (typeof v === "string" && v) {
    const t = Date.parse(v);
    if (Number.isFinite(t)) return t;
  }
  return fallback;
};
const periodOf = (input: Record<string, unknown>, defaultDays: number) => {
  const to = timeOf(input.to, Date.now());
  return { from: timeOf(input.from, to - defaultDays * DAY_MS), to };
};
// the process a tool is about: given, else the instance's own (a DNP instance)
const processOf = (input: Record<string, unknown>, ctx: ToolContext): number | null =>
  typeof input.processId === "number" ? input.processId : ctx.instance.processId;
/**
 * The processes a tool covers: the given one alone (another than the
 * instance's own); else the instance's group - its process and every process on its node and the node's
 * children (an aquarium's base process - with its CO2, water quality,
 * dosing, light modules); the whole system - null (all).
 */
async function scopeOf(input: Record<string, unknown>, ctx: ToolContext): Promise<number[] | null> {
  // the instance's own process named - the instance, i.e. its group (models pass it anyway)
  if (typeof input.processId === "number" && input.processId !== ctx.instance.processId) return [input.processId];
  if (ctx.instance.processId === null) return null;
  const rows = (
    await pool.query<{ id: number }>(
      `SELECT p.id FROM processes p
       WHERE p.id = $1 OR p.node_id IN (
         SELECT n.id FROM nodes n, processes me WHERE me.id = $1 AND (n.id = me.node_id OR n.parent_id = me.node_id))`,
      [ctx.instance.processId],
    )
  ).rows;
  return rows.map((r) => r.id);
}
// a Library type as dnp.list prints it ("node:aquarium-control") or bare - the bare type_name
const bareType = (type: string, kind: "node" | "device" | "process") => type.replace(new RegExp(`^${kind}:`), "");

const iso = (d: Date | null) => (d ? d.toISOString() : null);
const TIME = { type: ["string", "number"], description: "ISO time or ms; default - see the tool" };
// metrics, compact: the scalar values as they are, a nested object / list - its keys / length only (read in detail with process.metrics)
const compactMetrics = (metrics: Record<string, unknown> | undefined) =>
  Object.fromEntries(
    Object.entries(metrics ?? {}).map(([k, v]) =>
      v === null || typeof v !== "object" ? [k, v] : Array.isArray(v) ? [k, `[${v.length} items]`] : [k, `{${Object.keys(v as object).slice(0, 12).join(", ")}}`],
    ),
  );

// --- the read tools -------------------------------------------------------------

registerTool({
  name: "system.overview",
  description:
    "The system at a glance: nodes (health, simulated) and processes (state, critical / warning, active WEM count). With processId - that instance in detail: its node(s) and devices (by role), its metrics (nested ones - keys only; read them with process.metrics), active WEM, config sections.",
  access: "read",
  input: { type: "object", properties: { processId: { type: "integer", description: "an instance; default - the whole system (or the DNP instance itself)" } }, additionalProperties: false },
  async run(input, ctx) {
    const processId = typeof input.processId === "number" ? input.processId : ctx.instance.processId;
    if (processId === null) {
      const [nodes, processes] = await Promise.all([
        pool.query("SELECT id, name, type, parent_id, health, simulated FROM nodes ORDER BY id"),
        pool.query<{ id: number; name: string; kind: string; node_id: number | null }>("SELECT id, name, kind, node_id FROM processes ORDER BY id"),
      ]);
      const states = await Promise.all(processes.rows.map((p) => processRegistry.getPublicState(p.id)));
      return {
        nodes: nodes.rows,
        processes: processes.rows.map((p, i) => ({
          id: p.id,
          name: p.name,
          kind: p.kind,
          nodeId: p.node_id,
          status: states[i].status,
          critical: states[i].critical,
          warning: states[i].warning,
          activeWem: states[i].messages.filter((m) => m.type !== "message").length,
        })),
      };
    }
    const p = (await pool.query("SELECT id, name, kind, node_id, config FROM processes WHERE id = $1", [processId])).rows[0];
    if (!p) throw new ToolError(`no process ${processId}`);
    const state = await processRegistry.getPublicState(processId);
    const nodes = p.node_id
      ? (await pool.query("SELECT id, name, type, health, simulated FROM nodes WHERE id = $1 OR parent_id = $1 ORDER BY id", [p.node_id])).rows
      : [];
    // devices, compact: "id role (name)" per node
    const devices = nodes.length
      ? (
          await pool.query<{ id: number; name: string; node_id: number; role: string | null; simulated: boolean }>(
            "SELECT id, name, node_id, capabilities->>'role' AS role, simulated FROM devices WHERE node_id = ANY($1::int[]) ORDER BY node_id, id",
            [nodes.map((n) => n.id)],
          )
        ).rows.map((d) => `${d.id} ${d.role ?? "-"} (${d.name}) node ${d.node_id}${d.simulated ? " sim" : ""}`)
      : [];
    return {
      process: { id: p.id, name: p.name, kind: p.kind, nodeId: p.node_id, status: state.status, critical: state.critical, warning: state.warning },
      nodes,
      devices,
      configSections: Object.keys(p.config ?? {}),
      // the processes on these nodes (the instance's group - e.g. an aquarium's modules)
      groupProcesses: (await pool.query("SELECT id, name, kind FROM processes WHERE node_id = ANY($1::int[]) AND id <> $2 ORDER BY id", [nodes.map((n) => n.id), p.id])).rows,
      activeWem: state.messages.map((m) => ({ type: m.type, level: m.level, code: m.code, subject: m.subject, text: m.text, since: m.created_at })),
      metrics: compactMetrics(state.metrics as Record<string, unknown> | undefined),
    };
  },
});

registerTool({
  name: "process.metrics",
  description: "An instance's live metrics in detail - given keys only (system.overview lists them).",
  access: "read",
  input: {
    type: "object",
    properties: { processId: { type: "integer" }, keys: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 20 } },
    required: ["keys"],
    additionalProperties: false,
  },
  async run(input, ctx) {
    const processId = processOf(input, ctx);
    if (processId === null) throw new ToolError("processId is required for the whole system");
    const metrics = ((await processRegistry.getPublicState(processId)).metrics ?? {}) as Record<string, unknown>;
    return Object.fromEntries((input.keys as string[]).map((k) => [k, metrics[k] ?? null]));
  },
});

registerTool({
  name: "wem.summary",
  description:
    "Warnings / Errors / Messages over a period (default the last 7 days), grouped by code: how often, first and last seen, active now, the last text and the service (subject). Not the raw log - use logs.around for the moments around one.",
  access: "read",
  input: {
    type: "object",
    properties: {
      processId: { type: "integer", description: "one process only; default - the whole system, or the DNP instance with its group (the processes on its nodes)" },
      from: TIME,
      to: TIME,
      limit: { type: "integer", minimum: 1, maximum: 100, default: 30 },
    },
    additionalProperties: false,
  },
  async run(input, ctx) {
    const { from, to } = periodOf(input, 7);
    const scope = await scopeOf(input, ctx);
    const rows = (
      await pool.query(
        `SELECT m.process_id, p.name AS process, m.type, m.code, m.subject, count(*) AS times,
                min(m.created_at) AS first, max(COALESCE(m.resolved_at, m.updated_at)) AS last,
                bool_or(m.resolved_at IS NULL AND NOT m.hidden) AS active,
                (array_agg(m.text ORDER BY m.updated_at DESC))[1] AS text
         FROM log_messages m JOIN processes p ON p.id = m.process_id
         WHERE ($1::int[] IS NULL OR m.process_id = ANY($1::int[])) AND m.created_at <= to_timestamp($3 / 1000.0)
           AND (m.resolved_at IS NULL OR m.resolved_at >= to_timestamp($2 / 1000.0))
         GROUP BY m.process_id, p.name, m.type, m.code, m.subject
         ORDER BY active DESC, last DESC LIMIT $4`,
        [scope, from, to, input.limit],
      )
    ).rows;
    return {
      period: { from: new Date(from).toISOString(), to: new Date(to).toISOString() },
      groups: rows.map((r) => ({ ...r, times: Number(r.times), first: iso(r.first), last: iso(r.last) })),
    };
  },
});

registerTool({
  name: "logs.around",
  description:
    "The logs around a moment: commands (who wrote what), WEM raised / resolved, and - for the given devices - their logged readings; for finding what happened before a problem.",
  access: "read",
  input: {
    type: "object",
    properties: {
      at: TIME,
      minutes: { type: "integer", minimum: 1, maximum: 1440, default: 30, description: "the window on each side" },
      processId: { type: "integer", description: "one process only; default - the whole system, or the DNP instance with its group" },
      deviceIds: { type: "array", items: { type: "integer" }, maxItems: 20 },
      limit: { type: "integer", minimum: 1, maximum: 200, default: 60 },
    },
    required: ["at"],
    additionalProperties: false,
  },
  async run(input, ctx) {
    const at = timeOf(input.at, Date.now());
    const span = (input.minutes as number) * 60_000;
    const [from, to] = [at - span, at + span];
    const scope = await scopeOf(input, ctx);
    const deviceIds = (input.deviceIds as number[] | undefined) ?? [];
    const [commands, messages, readings] = await Promise.all([
      pool.query(
        `SELECT c.created_at AS at, c.action, c.value, c.source, c.device_id, c.process_id, u.username AS actor
         FROM log_command c LEFT JOIN users u ON u.id = c.actor_user_id
         WHERE c.created_at BETWEEN to_timestamp($1 / 1000.0) AND to_timestamp($2 / 1000.0)
           AND ($3::int[] IS NULL OR c.process_id = ANY($3::int[]) OR c.device_id = ANY($4::int[]))
         ORDER BY c.created_at LIMIT $5`,
        [from, to, scope, deviceIds, input.limit],
      ),
      pool.query(
        `SELECT created_at AS at, resolved_at, process_id, type, code, subject, text FROM log_messages
         WHERE (created_at BETWEEN to_timestamp($1 / 1000.0) AND to_timestamp($2 / 1000.0)
                OR resolved_at BETWEEN to_timestamp($1 / 1000.0) AND to_timestamp($2 / 1000.0))
           AND ($3::int[] IS NULL OR process_id = ANY($3::int[]))
         ORDER BY created_at LIMIT $4`,
        [from, to, scope, input.limit],
      ),
      deviceIds.length
        ? pool.query(
            `SELECT created_at AS at, device_id, value FROM log_device
             WHERE device_id = ANY($3::int[]) AND created_at BETWEEN to_timestamp($1 / 1000.0) AND to_timestamp($2 / 1000.0)
             ORDER BY created_at LIMIT $4`,
            [from, to, deviceIds, input.limit],
          )
        : Promise.resolve({ rows: [] }),
    ]);
    return {
      window: { from: new Date(from).toISOString(), to: new Date(to).toISOString() },
      commands: commands.rows,
      wem: messages.rows,
      readings: readings.rows,
    };
  },
});

registerTool({
  name: "series.list",
  description: "The logged value series of an instance (or a device): key, name, unit, kind (gauge / counter / state), recording policy.",
  access: "read",
  input: { type: "object", properties: { processId: { type: "integer" }, deviceId: { type: "integer" } }, additionalProperties: false },
  async run(input, ctx) {
    const deviceId = typeof input.deviceId === "number" ? input.deviceId : null;
    const processId = deviceId === null ? processOf(input, ctx) : null;
    return (
      await pool.query(
        `SELECT key, name, unit, kind, mode, period_s FROM series
         WHERE ($1::int IS NULL OR process_id = $1) AND ($2::int IS NULL OR device_id = $2) ORDER BY key LIMIT 200`,
        [processId, deviceId],
      )
    ).rows;
  },
});

registerTool({
  name: "series.stats",
  description:
    "Statistics of series over a period (default the last 7 days): min, max, average, last, count - from the aggregates for long periods (a year is cheap). `keys` - full series keys from series.list (e.g. process:16:temp.value).",
  access: "read",
  input: {
    type: "object",
    properties: { keys: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 40 }, from: TIME, to: TIME },
    required: ["keys"],
    additionalProperties: false,
  },
  async run(input) {
    const { from, to } = periodOf(input, 7);
    return { period: { from: new Date(from).toISOString(), to: new Date(to).toISOString() }, stats: await seriesStats(input.keys as string[], from, to) };
  },
});

registerTool({
  name: "series.points",
  description:
    "A series' curve over a period (default the last 24 h), at most `points` points - for trends and moments; use series.stats for numbers. The key - a full series key from series.list.",
  access: "read",
  input: {
    type: "object",
    properties: { key: { type: "string" }, from: TIME, to: TIME, points: { type: "integer", minimum: 10, maximum: 200, default: 60 } },
    required: ["key"],
    additionalProperties: false,
  },
  async run(input) {
    const { from, to } = periodOf(input, 1);
    const key = input.key as string;
    const points = (await querySeries([key], from, to, input.points as number))[key] ?? [];
    return { key, points: points.map((p) => [new Date(p.t).toISOString(), Math.round(p.v * 1000) / 1000]) };
  },
});

registerTool({
  name: "config.get",
  description: "An instance's config (optionally some sections only) and when / by whom each section was last changed.",
  access: "read",
  input: {
    type: "object",
    properties: { processId: { type: "integer" }, sections: { type: "array", items: { type: "string" }, maxItems: 30 } },
    additionalProperties: false,
  },
  async run(input, ctx) {
    const processId = processOf(input, ctx);
    if (processId === null) throw new ToolError("processId is required for the whole system");
    const p = (await pool.query("SELECT id, name, kind, config, config_stamps FROM processes WHERE id = $1", [processId])).rows[0];
    if (!p) throw new ToolError(`no process ${processId}`);
    const want = input.sections as string[] | undefined;
    const pick = (o: Record<string, unknown>) => (want ? Object.fromEntries(Object.entries(o ?? {}).filter(([k]) => want.includes(k))) : o);
    // a section asked for that the config hasn't - said, with the ones it has (its fields - config.schema)
    const missing = (want ?? []).filter((k) => !(k in (p.config ?? {})));
    return {
      process: { id: p.id, name: p.name, kind: p.kind },
      config: pick(p.config),
      stamps: pick(p.config_stamps),
      ...(missing.length ? { missing, sections: Object.keys(p.config ?? {}) } : {}),
    };
  },
});

registerTool({
  name: "config.schema",
  description: "A process kind's config schema: the fields, types, limits, defaults, descriptions (null - the kind has none).",
  access: "read",
  input: { type: "object", properties: { kind: { type: "string" } }, required: ["kind"], additionalProperties: false },
  async run(input) {
    return configSchemaOf(input.kind as string);
  },
});

registerTool({
  name: "dnp.list",
  description: "The DNPs of this system: the project's packages with the assistant (version, process kinds, work types) and the Library catalog (device / node / process types).",
  access: "read",
  input: { type: "object", properties: {}, additionalProperties: false },
  async run() {
    const [manifests, library] = await Promise.all([
      aiManifests(),
      pool.query<{ kind: string; type_name: string; name: string; version: string | null }>("SELECT kind, type_name, name, version FROM library_items ORDER BY kind, type_name"),
    ]);
    return {
      project: manifests.map((m) => ({ plugin: m.plugin, version: m.version, description: m.description, kinds: m.kinds, workTypes: m.workTypes.map((w) => w.key) })),
      library: library.rows.map((r) => `${r.kind}:${r.type_name} (${r.name}, v${r.version ?? "0"})`),
    };
  },
});

registerTool({
  name: "library.node_type",
  description:
    "A Library node type (from dnp.list) in detail: its bus, the node types it plugs into (parents - a module needs one), and the devices it declares by role (role -> device type) - what install.node.propose creates.",
  access: "read",
  input: { type: "object", properties: { type: { type: "string", minLength: 1 } }, required: ["type"], additionalProperties: false },
  async run(input) {
    const t = await checked(() => nodeTypeOf(bareType(input.type as string, "node")));
    return { type: input.type, name: t.name, bus: t.bus?.type ?? null, parents: t.parents ?? [], devices: (t.devices ?? []).map((d) => `${d.role}: ${d.type}`) };
  },
});

registerTool({
  name: "docs.search",
  description:
    "Search the documentation: the platform's (core), the Library DNPs' (library), the project's (project) and its plugins' - DNP and node docs, wiring, procedures, prompts (plugins). Returns section ids with snippets; read one with docs.read.",
  access: "read",
  input: {
    type: "object",
    properties: {
      query: { type: "string", minLength: 3 },
      source: { type: "string", description: "core / library / project / plugins; default - all" },
      limit: { type: "integer", minimum: 1, maximum: 15, default: 8 },
    },
    required: ["query"],
    additionalProperties: false,
  },
  async run(input) {
    return { sources: await docSources(), results: await searchDocs(input.query as string, { source: input.source as string | undefined, limit: input.limit as number }) };
  },
});

registerTool({
  name: "docs.read",
  description: "One documentation section by its id (from docs.search).",
  access: "read",
  input: { type: "object", properties: { id: { type: "string" }, maxChars: { type: "integer", minimum: 500, maximum: 12000, default: 6000 } }, required: ["id"], additionalProperties: false },
  async run(input) {
    const s = await readDoc(input.id as string);
    if (!s) throw new ToolError(`no section ${input.id}`);
    const max = input.maxChars as number;
    return { id: s.id, title: s.title, text: s.text.length > max ? `${s.text.slice(0, max)} ...[cut]` : s.text };
  },
});

// --- the proposing tools (stage 6) ----------------------------------------------

const REASON = { type: "string", minLength: 3, maxLength: 1000, description: "Why - the evidence, in the user's language; the person deciding reads it." };
// what a proposal returns to the model - and to the person reading the conversation
const proposalAnswer = (p: Awaited<ReturnType<typeof propose>>) => ({
  proposalId: p.id,
  status: p.status,
  ...(p.status === "pending"
    ? {
        note: p.viaMcp
          ? "Not applied yet - waiting for a person's Accept / Reject in Nexus Edge (Logs -> AI Proposals)."
          : "Shown to the user as a card with Accept / Reject - not applied yet; don't repeat the proposal.",
      }
    : {}),
  ...(p.error ? { error: p.error } : {}),
  ...(p.result ? { result: p.result } : {}),
});
// a process an instance may change: a DNP instance - its own group only
async function writableProcess(input: Record<string, unknown>, ctx: ToolContext) {
  const processId = processOf(input, ctx);
  if (processId === null) throw new ToolError("processId is required for the whole system");
  const scope = await scopeOf({ ...input, processId: undefined }, ctx);
  if (scope && !scope.includes(processId)) throw new ToolError(`process ${processId} is outside ${ctx.instance.name}'s group`);
  const p = (
    await pool.query<{ id: number; name: string; kind: string; actions: string[]; config: Record<string, unknown>; config_stamps: Record<string, { at: string }> }>(
      "SELECT id, name, kind, actions, config, config_stamps FROM processes WHERE id = $1",
      [processId],
    )
  ).rows[0];
  if (!p) throw new ToolError(`no process ${processId}`);
  return p;
}
// a write's own check, said to the model (a ProcessWriteError - its message)
async function checked<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (err) {
    if (err instanceof ProcessWriteError || err instanceof RegistryError) throw new ToolError(err.message);
    throw err;
  }
}

registerTool({
  name: "config.propose",
  description:
    "Propose a change of a process's config: whole top-level sections (read them with config.get, their fields with config.schema; send each changed section complete). " +
    "Checked against the kind's schema now; applied at once or shown to the user to accept, per this instance's Config level. Propose only what the user asked for or agreed to.",
  access: "config",
  input: {
    type: "object",
    properties: {
      processId: { type: "integer" },
      sections: { type: "object", minProperties: 1, maxProperties: 10, description: "section name -> its complete new value" },
      reason: REASON,
    },
    required: ["sections", "reason"],
    additionalProperties: false,
  },
  async run(input, ctx) {
    const p = await writableProcess(input, ctx);
    const sections = input.sections as Record<string, unknown>;
    const changed = Object.fromEntries(Object.entries(sections).filter(([k, v]) => JSON.stringify(p.config[k]) !== JSON.stringify(v)));
    if (Object.keys(changed).length === 0) throw new ToolError("nothing changes - the sections already have these values");
    await checked(() => checkProcessConfig(p.id, changed));
    const names = Object.keys(changed);
    const proposal = await propose(
      {
        access: "config",
        operation: "config",
        processId: p.id,
        summary: `${p.name}: change ${names.join(", ")}`,
        reason: input.reason as string,
        payload: { sections: changed },
        before: {
          sections: Object.fromEntries(names.map((k) => [k, p.config[k] ?? null])),
          stamps: Object.fromEntries(names.map((k) => [k, p.config_stamps?.[k]?.at ?? null])),
        },
      },
      ctx,
    );
    return proposalAnswer(proposal);
  },
});

registerTool({
  name: "daynote.propose",
  description:
    "Propose adding, changing or removing an operational day's note of a process - what is known about a day the plans weigh (the notes of today and tomorrow are in your context; read more with ledger.notes): " +
    "the energy field's technical ones - outage (no grid in its window), maintenance (nodeIds out in its window); the Energy Ledger's logic - holiday, day-off, workday (a working weekend); a heating's - maintenance, room-closed; other anywhere. " +
    "A window: startsAt / endsAt (ISO times), else the whole day. E.g. a person tells you tomorrow is a day off, or the grid operator announced works. Applied at once or shown to the user to accept, per this instance's Control level. Ask when unsure.",
  access: "control",
  input: {
    type: "object",
    properties: {
      processId: { type: "integer", description: "the process the note belongs to (the energy field / the ledger / a heating)" },
      op: { enum: ["add", "update", "delete"] },
      noteId: { type: "integer", description: "update / delete - the note's id" },
      day: { type: "string", description: "YYYY-MM-DD" },
      kind: { enum: ["outage", "holiday", "day-off", "workday", "maintenance", "room-closed", "other"] },
      text: { type: "string", maxLength: 500 },
      startsAt: { type: ["string", "null"] },
      endsAt: { type: ["string", "null"] },
      nodeIds: { type: "array", maxItems: 100, items: { type: "integer" } },
      reason: REASON,
    },
    required: ["processId", "op", "reason"],
    additionalProperties: false,
  },
  async run(input, ctx) {
    const p = await writableProcess(input, ctx);
    const op = input.op as "add" | "update" | "delete";
    const { processId: _p, op: _o, noteId, reason: _r, ...rest } = input;
    const checkedNote = op === "delete" ? { fields: {} } : dayNoteInput(rest, op === "update");
    if ("error" in checkedNote) throw new ToolError(checkedNote.error);
    if (op !== "add" && !Number.isInteger(noteId)) throw new ToolError("noteId is required to update / delete a note");
    const proposal = await propose(
      {
        access: "control",
        operation: "day-note",
        processId: p.id,
        summary: `${p.name}: ${op} a day note${checkedNote.fields.day ? ` for ${checkedNote.fields.day}` : ""}${checkedNote.fields.kind ? ` (${checkedNote.fields.kind})` : ""}`,
        reason: input.reason as string,
        payload: { op, noteId: (noteId as number | undefined) ?? null, fields: checkedNote.fields },
        before: null,
      },
      ctx,
    );
    return proposalAnswer(proposal);
  },
});

registerTool({
  name: "control.propose",
  description:
    "Propose controlling a process: action ON / OFF switches it (only if the process lists the action); any other action is a one-shot command its kind understands (see its documentation), with params. " +
    "Applied at once or shown to the user to accept, per this instance's Control level.",
  access: "control",
  input: {
    type: "object",
    properties: {
      processId: { type: "integer" },
      action: { type: "string", minLength: 1, maxLength: 100 },
      params: { type: "object", maxProperties: 30 },
      reason: REASON,
    },
    required: ["action", "reason"],
    additionalProperties: false,
  },
  async run(input, ctx) {
    const p = await writableProcess(input, ctx);
    const action = input.action as string;
    const isSwitch = action === "ON" || action === "OFF";
    if (isSwitch && !p.actions.includes(action)) throw new ToolError(`${p.name} can't be switched ${action} (its actions: ${p.actions.join(", ") || "none"})`);
    const proposal = await propose(
      isSwitch
        ? {
            access: "control",
            operation: "switch",
            processId: p.id,
            summary: `${p.name}: switch ${action}`,
            reason: input.reason as string,
            payload: { action },
            before: { status: (await processRegistry.getStatus(p.id)) ?? null },
          }
        : {
            access: "control",
            operation: "command",
            processId: p.id,
            summary: `${p.name}: command ${action}`,
            reason: input.reason as string,
            payload: { action, params: (input.params as Record<string, unknown>) ?? {} },
            before: null,
          },
      ctx,
    );
    return proposalAnswer(proposal);
  },
});

registerTool({
  name: "install.process.propose",
  description:
    "Propose installing a DNP instance - a new process of a kind the Library has (dnp.list): its name, process group, optionally its node (it then belongs to that node's group) and config (checked against the kind's schema). " +
    "Applied at once or shown to the user to accept, per the Install level. Its node is registered first (install.node.propose).",
  access: "install",
  input: {
    type: "object",
    properties: {
      kind: { type: "string", minLength: 1 },
      name: { type: "string", minLength: 1, maxLength: 120 },
      groupId: { type: "integer", description: "a process group (absent - the error lists them)" },
      nodeId: { type: "integer" },
      type: { enum: ["controllable", "permanent"], default: "permanent" },
      config: { type: "object" },
      reason: REASON,
    },
    required: ["kind", "name", "reason"],
    additionalProperties: false,
  },
  async run(input, ctx) {
    const kind = bareType(input.kind as string, "process");
    const kinds = new Set([
      ...(await pool.query<{ type_name: string }>("SELECT type_name FROM library_items WHERE kind = 'process'")).rows.map((r) => r.type_name),
      ...configSchemaKinds(),
    ]);
    if (!kinds.has(kind)) throw new ToolError(`unknown process kind "${kind}" - one of: ${[...kinds].sort().join(", ")}`);
    const groups = (await pool.query<{ id: number; name: string }>("SELECT id, name FROM process_groups ORDER BY name")).rows;
    const group = groups.find((g) => g.id === input.groupId);
    if (!group) throw new ToolError(`groupId is required - one of: ${groups.map((g) => `${g.id} (${g.name})`).join(", ")}`);
    let node: string | null = null;
    if (input.nodeId !== undefined) {
      node = (await pool.query<{ name: string }>("SELECT name FROM nodes WHERE id = $1", [input.nodeId])).rows[0]?.name ?? null;
      if (!node) throw new ToolError(`no node ${input.nodeId as number}`);
    }
    const config = (input.config as Record<string, unknown>) ?? {};
    const problems = configProblems(kind, config);
    if (problems.length) throw new ToolError(`invalid config: ${problems.join("; ")}`);
    const name = input.name as string;
    const proposal = await propose(
      {
        access: "install",
        operation: "create-process",
        processId: null,
        summary: `Install ${kind} "${name}" in ${group.name}${node ? ` on ${node}` : ""}`,
        reason: input.reason as string,
        payload: { name, kind, groupId: group.id, type: input.type as "controllable" | "permanent", nodeId: (input.nodeId as number) ?? null, config },
        before: null,
      },
      ctx,
    );
    return proposalAnswer(proposal);
  },
});

const BACKEND = {
  enum: ["virtual", "physical"],
  default: "virtual",
  description: "virtual - played by a simulation (no hardware); physical - real hardware on `transport`",
};
const TRANSPORT = { type: "object", description: "physical only: the bus binding, e.g. {type: 'can'} or {type: 'mqtt', node, device}" };

registerTool({
  name: "install.node.propose",
  description:
    "Propose registering a node of a Library node type (dnp.list) with the devices its node.yaml declares by role - all, or `roles` (a node without some equipment). " +
    "A module type (e.g. a CO2 module) needs `parentId` - a node of the type it plugs into. Virtual by default. Applied at once or shown to the user to accept, per the Install level. " +
    "Its process (install.process.propose) comes after, with the new node's id.",
  access: "install",
  input: {
    type: "object",
    properties: {
      type: { type: "string", minLength: 1, description: "the node type (Library type_name)" },
      name: { type: "string", minLength: 1, maxLength: 120, description: "unique among the nodes" },
      parentId: { type: "integer" },
      groupId: { type: "integer", description: "a node group (optional)" },
      location: { type: "string", maxLength: 200 },
      roles: { type: "array", items: { type: "string" }, maxItems: 60, description: "the device roles to create (absent - all the type declares)" },
      backend: BACKEND,
      busConfig: { type: "object", description: "physical: the node's bus binding, e.g. {bus: 'can2'}" },
      transport: TRANSPORT,
      reason: REASON,
    },
    required: ["type", "name", "reason"],
    additionalProperties: false,
  },
  async run(input, ctx) {
    const { reason, ...node } = input as Record<string, unknown> & { reason: string; type: string; name: string; parentId?: number };
    node.type = bareType(node.type, "node");
    const { devices } = await checked(() => checkNode(node as never));
    const parent = node.parentId != null ? (await pool.query<{ name: string }>("SELECT name FROM nodes WHERE id = $1", [node.parentId])).rows[0]?.name : null;
    const proposal = await propose(
      {
        access: "install",
        operation: "create-node",
        processId: null,
        summary: `Register ${node.type} node "${node.name}"${parent ? ` under ${parent}` : ""} with ${devices.length} device(s)`,
        reason,
        payload: node as never,
        before: null,
      },
      ctx,
    );
    return { ...proposalAnswer(proposal), devices: devices.map((d) => `${d.role} (${d.type})`) };
  },
});

registerTool({
  name: "install.device.propose",
  description:
    "Propose registering one device of a Library device type - on a node (it must support the type; `role` - how its process finds it, unique on the node) or standalone. " +
    "Virtual by default. Applied at once or shown to the user to accept, per the Install level. A whole node with its declared devices - install.node.propose.",
  access: "install",
  input: {
    type: "object",
    properties: {
      type: { type: "string", minLength: 1, description: "the device type (Library type_name)" },
      name: { type: "string", minLength: 1, maxLength: 120 },
      nodeId: { type: "integer" },
      role: { type: "string", maxLength: 60 },
      location: { type: "string", maxLength: 200 },
      backend: BACKEND,
      transport: TRANSPORT,
      capabilities: { type: "object", description: "extra: min / max / step / unit ..." },
      reason: REASON,
    },
    required: ["type", "name", "reason"],
    additionalProperties: false,
  },
  async run(input, ctx) {
    const { reason, ...device } = input as Record<string, unknown> & { reason: string; type: string; name: string; nodeId?: number; role?: string };
    device.type = bareType(device.type, "device");
    await checked(() => checkDevice(device as never));
    // a role the node's type declares for this device type - said, so the person sees it fits
    let node: string | null = null;
    if (device.nodeId != null) {
      const n = (await pool.query<{ name: string; type: string }>("SELECT name, type FROM nodes WHERE id = $1", [device.nodeId])).rows[0];
      node = n?.name ?? null;
      const declared = (await nodeTypeOf(n.type)).devices?.find((d) => d.role === device.role);
      if (device.role && declared && declared.type !== device.type) throw new ToolError(`the role "${device.role}" of a ${n.type} node is a ${declared.type}, not a ${device.type}`);
    }
    const proposal = await propose(
      {
        access: "install",
        operation: "create-device",
        processId: null,
        summary: `Register ${device.type} device "${device.name}"${node ? ` on ${node}` : " (standalone)"}${device.role ? ` as ${device.role}` : ""}`,
        reason,
        payload: device as never,
        before: null,
      },
      ctx,
    );
    return proposalAnswer(proposal);
  },
});

// --- access (B1.4): why a person sees / can do something, and a proposed change of their access -----

// a person by username or display name (case-insensitive)
async function personOf(name: string) {
  const row = (
    await pool.query<{ id: number; username: string; display_name: string | null; active: boolean }>(
      "SELECT id, username, display_name, active FROM users WHERE lower(username) = lower($1) OR lower(display_name) = lower($1) ORDER BY id LIMIT 1",
      [name],
    )
  ).rows[0];
  if (!row) throw new ToolError(`no user "${name}"`);
  return row;
}
const wholeSystemOnly = (ctx: ToolContext) => {
  if (ctx.instance.processId !== null) throw new ToolError("access is the whole system's - ask the Nexus Edge assistant");
};

registerTool({
  name: "access.explain",
  description:
    "A person's access: their roles (each - its levels view / control / config on objects: every other object \"*\", a DNP instance, a system section), " +
    "the role they act in now, what they may do as a result; with `permission` (a catalog key like processes.config) - whether and where they hold it and which roles give it. " +
    "To answer \"why can't X see / do Y\".",
  access: "read",
  input: {
    type: "object",
    properties: { user: { type: "string", minLength: 1, description: "username or display name" }, permission: { type: "string" } },
    required: ["user"],
    additionalProperties: false,
  },
  async run(input, ctx) {
    wholeSystemOnly(ctx);
    const person = await personOf(input.user as string);
    const map = await instanceUnits();
    const unitKeys = [...map.units.keys(), "system"];
    const objectName = (k: string) => (k === "*" ? "every other object" : k.startsWith("section:") ? `section ${k.slice(8)}` : (map.units.get(k)?.name ?? k));
    const roles = (
      await pool.query<{ key: string; name: string; rights: Rights }>(
        "SELECT r.key, r.name, r.rights FROM roles r JOIN role_members m ON m.role_key = r.key WHERE m.user_id = $1 ORDER BY r.name",
        [person.id],
      )
    ).rows;
    const describe = (r: { key: string; rights: Rights }) =>
      FULL_ROLES.has(r.key) ? "everything" : Object.entries(r.rights ?? {}).map(([o, l]) => `${objectName(o)}: ${l.join(", ") || "nothing"}`);
    // the role they act in now (their last chosen; none chosen - the most allowing)
    const context = await resolveContext(person.id, null);
    const principal = await principalOf(person.id, context);
    const perm = input.permission as string | undefined;
    const gives = (r: { key: string; rights: Rights }, p: string) => {
      if (FULL_ROLES.has(r.key)) return "everywhere";
      const c = computeRights(r.rights ?? {}, unitKeys);
      return c.global.has(p) ? "everywhere" : c.scoped.has(p) ? [...c.scoped.get(p)!].map(objectName) : null;
    };
    return {
      user: { username: person.username, name: person.display_name, active: person.active },
      roles: roles.map((r) => ({ name: r.name, rights: describe(r) })),
      actingAs: context ? (roles.find((r) => `role:${r.key}` === context)?.name ?? null) : roles.length === 1 ? roles[0].name : null,
      everywhere: principal ? [...principal.global] : [],
      onSomeInstances: principal ? Object.fromEntries([...principal.scoped].map(([k, u]) => [k, [...u].map(objectName)])) : {},
      ...(perm
        ? {
            permission: perm,
            known: isPermission(perm),
            heldNow: principal ? (can(principal, perm) ? (principal.global.has(perm) || principal.global.has("*") ? "everywhere" : [...(principal.scoped.get(perm) ?? [])].map(objectName)) : "no") : "no",
            rolesGiving: roles.map((r) => ({ role: r.name, where: gives(r, perm) })).filter((x) => x.where !== null),
          }
        : {}),
    };
  },
});

registerTool({
  name: "access.propose",
  description:
    "Propose a person's roles (replacing them as a whole) - roles by key or name; what a role allows is set on the role itself (Users -> Roles). " +
    "Always waits for a person who manages users to accept it - never applied on its own.",
  access: "install",
  input: {
    type: "object",
    properties: {
      user: { type: "string", minLength: 1 },
      roles: { type: "array", maxItems: 20, items: { type: "string" }, description: "role keys or names" },
      reason: REASON,
    },
    required: ["user", "roles", "reason"],
    additionalProperties: false,
  },
  async run(input, ctx) {
    wholeSystemOnly(ctx);
    const person = await personOf(input.user as string);
    // a role by its key or its name, any case
    const roleRows = (await pool.query<{ key: string; name: string }>("SELECT key, name FROM roles")).rows;
    const roleOf = (x: string) => roleRows.find((r) => r.key === x || r.name.toLowerCase() === x.toLowerCase())?.key ?? x;
    const wanted = [...new Set((input.roles as string[]).map(roleOf))];
    const problem = await rolesProblem(person.username, wanted);
    if (problem) throw new ToolError(`${problem} - the roles: ${roleRows.map((r) => r.name).join(", ")}`);
    const before = (await pool.query<{ role_key: string }>("SELECT role_key FROM role_members WHERE user_id = $1", [person.id])).rows.map((r) => r.role_key);
    const nameOf = (k: string) => roleRows.find((r) => r.key === k)?.name ?? k;
    const proposal = await propose(
      {
        access: "install",
        operation: "roles",
        processId: null,
        summary: `Roles of ${person.display_name ?? person.username}: ${wanted.map(nameOf).join(", ") || "none"}`,
        reason: input.reason as string,
        payload: { userId: person.id, roles: wanted },
        before: { roles: before },
      },
      ctx,
    );
    return proposalAnswer(proposal);
  },
});
