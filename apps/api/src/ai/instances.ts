import { pool } from "../db.js";
import { aiManifests, NE_WORK_TYPES, type AiManifest, type WorkType } from "./manifests.js";

// The assistant's instances (migrations/1690000000068; Service -> Config ->
// AI): "nexus-edge" - the whole system, built in, always first; then each
// process whose kind a DNP's AI manifest covers ("process:<id>"). Each -
// its connection (null - the assistant is off for it), its access levels,
// whether its conversations are logged. A missing row - DEFAULT_ACCESS,
// no connection, logs on.

export type Level = "off" | "confirm" | "auto";
export interface Access {
  read: boolean;
  config: Level;
  control: Level;
  install: Level; // the whole system only
  report: boolean;
}

export const DEFAULT_ACCESS: Access = { read: true, config: "confirm", control: "confirm", install: "confirm", report: false };
const LEVELS: Level[] = ["off", "confirm", "auto"];

export const NEXUS_EDGE_KEY = "nexus-edge";

export interface Instance {
  key: string;
  name: string;
  kind: string; // "nexus-edge" or the process kind
  processId: number | null;
  plugin: string | null; // the DNP (its plugin directory)
  workTypes: WorkType[];
  scheduledTypes: string[];
  connectionId: number | null;
  access: Access;
  logs: boolean;
  updatedAt: string | null;
}

interface SettingsRow {
  instance_key: string;
  connection_id: number | null;
  access: Partial<Access>;
  logs: boolean;
  updated_at: Date;
}

const merged = (row: SettingsRow | undefined, nexusEdge: boolean) => {
  const access = { ...DEFAULT_ACCESS, ...(row?.access ?? {}) };
  // installing DNPs / nodes / devices is the whole system's
  if (!nexusEdge) access.install = "off";
  return { connectionId: row?.connection_id ?? null, access, logs: row?.logs ?? true, updatedAt: row?.updated_at.toISOString() ?? null };
};

/** Every instance: the whole system first, then the DNP instances by name. */
export async function listInstances(): Promise<Instance[]> {
  const manifests = await aiManifests();
  const kinds = manifests.flatMap((m) => m.kinds);
  const [settings, processes] = await Promise.all([
    pool.query<SettingsRow>("SELECT instance_key, connection_id, access, logs, updated_at FROM ai_instances"),
    pool.query<{ id: number; name: string; kind: string }>("SELECT id, name, kind FROM processes WHERE kind = ANY($1::text[]) ORDER BY name", [kinds]),
  ]);
  const byKey = new Map(settings.rows.map((r) => [r.instance_key, r]));
  const manifestOf = (kind: string): AiManifest => manifests.find((m) => m.kinds.includes(kind))!;
  return [
    {
      key: NEXUS_EDGE_KEY,
      name: "Nexus Edge AI Assistant",
      kind: NEXUS_EDGE_KEY,
      processId: null,
      plugin: null,
      workTypes: NE_WORK_TYPES,
      scheduledTypes: ["status-analysis", "wem-analysis", "analysis-proposals"],
      ...merged(byKey.get(NEXUS_EDGE_KEY), true),
    },
    ...processes.rows.map((p) => {
      const m = manifestOf(p.kind);
      const key = `process:${p.id}`;
      return {
        key,
        name: p.name,
        kind: p.kind,
        processId: p.id,
        plugin: m.plugin,
        workTypes: m.workTypes,
        scheduledTypes: m.scheduledTypes,
        ...merged(byKey.get(key), false),
      };
    }),
  ];
}

export async function getInstance(key: string): Promise<Instance | null> {
  return (await listInstances()).find((i) => i.key === key) ?? null;
}

export interface InstanceInput {
  connectionId?: number | null;
  access?: Partial<Access>;
  logs?: boolean;
}

/** What is wrong with an instance's settings (null - fine). */
export function instanceProblem(input: InstanceInput): string | null {
  if (input.connectionId !== undefined && input.connectionId !== null && !Number.isInteger(input.connectionId)) return "connectionId must be a connection's id or null";
  for (const [k, v] of Object.entries(input.access ?? {})) {
    if (k === "read" || k === "report") {
      if (typeof v !== "boolean") return `access.${k} must be true or false`;
    } else if (k === "config" || k === "control" || k === "install") {
      if (!LEVELS.includes(v as Level)) return `access.${k} must be off, confirm or auto`;
    } else return `unknown access level "${k}"`;
  }
  if (input.logs !== undefined && typeof input.logs !== "boolean") return "logs must be true or false";
  return null;
}

export async function saveInstance(instance: Instance, input: InstanceInput, userId: number): Promise<Instance> {
  const access = { ...instance.access, ...(input.access ?? {}) };
  if (instance.processId !== null) access.install = "off";
  await pool.query(
    `INSERT INTO ai_instances (instance_key, process_id, connection_id, access, logs, updated_by, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, now())
     ON CONFLICT (instance_key) DO UPDATE SET connection_id = $3, access = $4, logs = $5, updated_by = $6, updated_at = now()`,
    [
      instance.key,
      instance.processId,
      input.connectionId !== undefined ? input.connectionId : instance.connectionId,
      JSON.stringify(access),
      input.logs ?? instance.logs,
      userId,
    ],
  );
  return (await getInstance(instance.key))!;
}
