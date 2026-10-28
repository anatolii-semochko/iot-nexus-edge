import { pool } from "./db.js";

// The DNP instances of this system as units - ONE grouping for every place
// that splits the system by installation: Clear Logs (logCleanup.ts) and
// access scopes (access/, B1). A unit is a root node's tree ("node:<root
// id>" - an installation with its modules: the processes on those nodes
// and their devices) or a process with no node ("process:<id>"); a device
// with no node belongs to "system". Read fresh, cached briefly (the
// topology changes rarely; a stale second is harmless).

export interface UnitMap {
  units: Map<string, { name: string; detail: string[] }>;
  processUnit: Map<number, string>;
  deviceUnit: Map<number, string>;
  nodeUnit: Map<number, string>;
}

const CACHE_MS = 5000;
let cached: { at: number; map: Promise<UnitMap> } | null = null;

async function load(): Promise<UnitMap> {
  const [nodes, processes, devices] = await Promise.all([
    pool.query<{ id: number; root: number; root_name: string }>(
      `WITH RECURSIVE tree AS (
         SELECT id, id AS root, name AS root_name FROM nodes WHERE parent_id IS NULL
         UNION ALL
         SELECT n.id, t.root, t.root_name FROM nodes n JOIN tree t ON n.parent_id = t.id)
       SELECT id, root, root_name FROM tree`,
    ),
    pool.query<{ id: number; name: string; kind: string; node_id: number | null }>("SELECT id, name, kind, node_id FROM processes ORDER BY id"),
    pool.query<{ id: number; node_id: number | null }>("SELECT id, node_id FROM devices"),
  ]);
  const rootOf = new Map(nodes.rows.map((n) => [n.id, n]));
  const units = new Map<string, { name: string; detail: string[] }>();
  const processUnit = new Map<number, string>();
  const deviceUnit = new Map<number, string>();
  const nodeUnit = new Map<number, string>();
  const unitOfNode = (nodeId: number | null) => {
    const n = nodeId === null ? undefined : rootOf.get(nodeId);
    if (!n) return null;
    const key = `node:${n.root}`;
    if (!units.has(key)) units.set(key, { name: n.root_name, detail: [] });
    return key;
  };
  for (const n of nodes.rows) nodeUnit.set(n.id, unitOfNode(n.id)!);
  for (const p of processes.rows) {
    let key = unitOfNode(p.node_id);
    if (key) units.get(key)!.detail.push(p.name);
    else {
      key = `process:${p.id}`;
      units.set(key, { name: p.name, detail: [p.kind] });
    }
    processUnit.set(p.id, key);
  }
  for (const d of devices.rows) deviceUnit.set(d.id, unitOfNode(d.node_id) ?? "system");
  return { units, processUnit, deviceUnit, nodeUnit };
}

/** Every process, device and node -> its unit (cached for a few seconds). */
export function instanceUnits(): Promise<UnitMap> {
  if (!cached || Date.now() - cached.at > CACHE_MS) {
    const map = load();
    cached = { at: Date.now(), map };
    map.catch(() => (cached = null));
  }
  return cached.map;
}

/** Drop the cache (a registry change the caller just made must be seen at once). */
export const dropInstanceUnits = () => (cached = null);
