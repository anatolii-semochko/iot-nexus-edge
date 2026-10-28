import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { config } from "../config.js";
import { pool } from "../db.js";
import { instanceUnits } from "../dnpInstances.js";
import { can, type Principal } from "./principal.js";

// A process's commands to the process it is linked to (iot AGENTS_TO_DO.md 2026-10-28): a DNP package
// declares, in its manifest (a Library package's library.json, a project plugin's plugin.json), which
// commands of a linked process are part of operating its own -
//   "access": { "linked": [{ "configKey": "ledgerProcessId", "commands": ["setOperating"], "dayNotes": true }] }
// - the Energy Field's reserve / selling switches are the Energy Ledger's operating parameters. A person
// with Control on the field may then send those commands (and write day notes) to the ledger its config
// names, without Control on the ledger itself; nothing else of the ledger opens.

export interface LinkRule {
  configKey: string;
  commands: string[];
  dayNotes: boolean;
}

type Manifest = { access?: { kinds?: string[]; linked?: Partial<LinkRule>[] }; ai?: { kinds?: string[] } };

let cache: Promise<Map<string, LinkRule[]>> | null = null;

const rulesOf = (m: Manifest): LinkRule[] =>
  (m.access?.linked ?? [])
    .filter((r) => typeof r.configKey === "string" && r.configKey)
    .map((r) => ({ configKey: r.configKey!, commands: Array.isArray(r.commands) ? r.commands.filter((c) => typeof c === "string") : [], dayNotes: r.dayNotes === true }));

async function load(): Promise<Map<string, LinkRule[]>> {
  const out = new Map<string, LinkRule[]>();
  const read = (file: string) => readFile(file, "utf8").then((t) => JSON.parse(t) as Manifest, () => null);
  // the Library's process packages - the kind is the package's directory unless it names its kinds
  const processesDir = path.join(config.apiPlugins.builtinDevicesDir, "processes");
  for (const entry of await readdir(processesDir, { withFileTypes: true }).catch(() => [])) {
    if (!entry.isDirectory()) continue;
    const m = await read(path.join(processesDir, entry.name, "library.json"));
    const rules = m ? rulesOf(m) : [];
    if (rules.length) for (const kind of m!.access?.kinds ?? [entry.name]) out.set(kind, rules);
  }
  // the projects' plugins (after the Library - a project's kind of the same name wins)
  for (const { dir: root } of config.apiPlugins.extraDirs)
    for (const entry of await readdir(root, { withFileTypes: true }).catch(() => [])) {
      if (!entry.isDirectory()) continue;
      const m = await read(path.join(root, entry.name, "plugin.json"));
      const rules = m ? rulesOf(m) : [];
      if (rules.length) for (const kind of m!.access?.kinds ?? m!.ai?.kinds ?? []) out.set(kind, rules);
    }
  return out;
}

/** The kinds' link rules (read once - they change with a deployment). */
export function linkRules(): Promise<Map<string, LinkRule[]>> {
  cache ??= load();
  cache.catch(() => (cache = null));
  return cache;
}

/**
 * Whether a linked process lets the person do this on `targetId`: `action` - a command's, or "dayNotes".
 * A process whose kind has a rule, whose config names the target, and which the person controls.
 */
export async function linkedAllows(p: Principal, targetId: number, action: string): Promise<boolean> {
  const rules = await linkRules();
  if (!rules.size) return false;
  const { rows } = await pool.query<{ id: number; kind: string; config: Record<string, unknown> | null }>(
    "SELECT id, kind, config FROM processes WHERE kind = ANY($1)",
    [[...rules.keys()]],
  );
  const units = await instanceUnits();
  return rows.some(
    (r) =>
      r.id !== targetId &&
      (rules.get(r.kind) ?? []).some(
        (rule) =>
          Number(r.config?.[rule.configKey]) === targetId && (action === "dayNotes" ? rule.dayNotes : rule.commands.includes(action)),
      ) &&
      can(p, "processes.control", units.processUnit.get(r.id) ?? null),
  );
}
