import { pool } from "../db.js";
import { instanceUnits } from "../dnpInstances.js";

// Which installations a process uses (iot AGENTS_TO_DO.md 2026-10-28 - an object is a process with its
// nodes): the processes on an installation's nodes, and those naming one of its nodes in their settings
// (a "nodeId" anywhere in processes.config - a heating plant's pumps, rooms; the field's PV blocks).
// - the role editor's "used by" (routes/access.ts);
// - a role's row of a process with no node covers the installations it names (access/rights.ts
//   computeRights `covers`) - one row "House heating" instead of a row per room and pump; an
//   installation's own row still wins.
// Read fresh, cached briefly (as dnpInstances.ts).

export interface Usage {
  // installation unit -> the process ids using it (on it, or naming it)
  usedBy: Map<string, Set<number>>;
  // installation unit -> the units of the processes with no node naming it (those whose rows cover it)
  coveredBy: Map<string, string[]>;
}

const CACHE_MS = 5000;
let cached: { at: number; usage: Promise<Usage> } | null = null;

async function load(): Promise<Usage> {
  const map = await instanceUnits();
  const refs = (
    await pool.query<{ process_id: number; node_id: number }>(
      `WITH RECURSIVE j(pid, v) AS (
         SELECT id, config FROM processes
         UNION ALL
         SELECT j.pid, e.value FROM j, LATERAL (
           SELECT value FROM jsonb_each(CASE WHEN jsonb_typeof(j.v) = 'object' THEN j.v ELSE '{}'::jsonb END)
           UNION ALL
           SELECT value FROM jsonb_array_elements(CASE WHEN jsonb_typeof(j.v) = 'array' THEN j.v ELSE '[]'::jsonb END)) e)
       SELECT DISTINCT pid AS process_id, (v->>'nodeId')::int AS node_id FROM j
        WHERE jsonb_typeof(v) = 'object' AND jsonb_typeof(v->'nodeId') = 'number'`,
    )
  ).rows;
  const usedBy = new Map<string, Set<number>>();
  const covered = new Map<string, Set<string>>();
  const add = <T>(m: Map<string, Set<T>>, k: string, v: T) => m.set(k, new Set([...(m.get(k) ?? []), v]));
  for (const [id, unit] of map.processUnit) if (unit.startsWith("node:")) add(usedBy, unit, id);
  for (const r of refs) {
    const unit = map.nodeUnit.get(r.node_id);
    const own = map.processUnit.get(r.process_id);
    if (!unit || !own || own === unit) continue;
    add(usedBy, unit, r.process_id);
    if (own.startsWith("process:")) add(covered, unit, own);
  }
  return { usedBy, coveredBy: new Map([...covered].map(([k, v]) => [k, [...v]])) };
}

/** Which processes use which installations (cached for a few seconds). */
export function processUsage(): Promise<Usage> {
  if (!cached || Date.now() - cached.at > CACHE_MS) {
    const usage = load();
    cached = { at: Date.now(), usage };
    usage.catch(() => (cached = null));
  }
  return cached.usage;
}
