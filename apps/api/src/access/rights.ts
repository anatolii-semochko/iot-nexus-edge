import { ALL_PERMISSIONS } from "./catalog.js";

// A role's rights (iot AGENTS_TO_DO.md 2026-10-27 - roles without groups): a table object x level. The
// administrator works with levels, never with single actions - this module is the one mapping of a
// (object, level) to the catalog's actions (access/catalog.ts); the guard, can() and the scopes keep
// working on those actions (access/principal.ts).
// - Objects: the DNP instances (units - dnpInstances.ts: an installation's node tree, a process with
//   no node; "system" - the devices with no node), with the row "*" - every other one (an object's own
//   row replaces it, up or down); and the system sections (Dashboard, AI Assistant, Logs, ...).
// - Levels: view / control (operate - ON / OFF, setpoints, commands) / config (an engineer's - the
//   settings, the registry, the simulation). A higher level brings the lower ones.
// - The AI Assistant's and Logs' use is gated: their section's level opens them, the objects' levels
//   say on which objects (talking to the whole system's assistant - with every object viewed).

export const LEVELS = ["view", "control", "config"] as const;
export type Level = (typeof LEVELS)[number];

export type Rights = Record<string, Level[]>;

/** What an object's level gives (on that object). */
const OBJECT_ACTIONS: Record<Level, string[]> = {
  view: ["nodes.view", "devices.view", "processes.view", "dnp.view"],
  control: ["devices.write", "processes.control", "dnp.control"],
  config: ["processes.config", "processes.manage", "nodes.manage", "devices.manage", "devices.simulate", "dnp.config"],
};

/**
 * An object's configuration actions - a change of them with no object named (a new process, the process /
 * tab / device groups, the kinds) is the whole system's: held everywhere ("*" - Configure), never by one
 * object's row (2026-10-28 - a process's engineer is not the system's).
 */
export const SYSTEM_WIDE_CONFIG = new Set(OBJECT_ACTIONS.config);

export interface SystemSection {
  key: string;
  label: string;
  // a level -> the actions it gives everywhere
  levels: Partial<Record<Level, string[]>>;
  // a level -> the actions it gives on the objects holding `on` (gated)
  gated?: Partial<Record<Level, { actions: string[]; on: Level }>>;
}

export const SYSTEM_SECTIONS: SystemSection[] = [
  { key: "dashboard", label: "Dashboard", levels: { view: ["dashboard.view"], config: ["dashboard.manage"] } },
  {
    key: "ai",
    label: "AI Assistant",
    levels: { control: ["ai.share"], config: ["ai.configure"] },
    gated: { view: { actions: ["ai.use"], on: "view" }, control: { actions: ["ai.decide"], on: "control" } },
  },
  { key: "logs", label: "Logs", levels: { config: ["logs.configure"] }, gated: { view: { actions: ["logs.view"], on: "view" } } },
  { key: "library", label: "Library", levels: { view: ["library.view"], config: ["library.manage"] } },
  { key: "settings", label: "Settings (messages, monitoring)", levels: { view: ["settings.view"], config: ["settings.config"] } },
  {
    key: "service",
    label: "Service",
    // View - its pages, nothing changed (2026-10-28); Control - the backups; Configure - the rest
    levels: {
      view: ["service.view"],
      control: ["service.database.backup"],
      config: ["service.database.restore", "service.database.clear-logs", "service.system", "service.dnp"],
    },
  },
  // which units are simulated (the rows' tint, the badge) - an engineer's sight, apart from changing things;
  // on the objects viewed (2026-10-27)
  { key: "simulation", label: "Simulation (which units are simulated)", levels: {}, gated: { view: { actions: ["simulation.view"], on: "view" } } },
  { key: "users", label: "Users and access", levels: { view: ["users.view"], config: ["users.manage"] } },
];

export const sectionKey = (key: string) => `section:${key}`;
export const ALL_OBJECTS = "*";

/** The levels a section offers (a level with nothing behind it is not offered). */
export const sectionLevels = (s: SystemSection): Level[] => LEVELS.filter((l) => s.levels[l]?.length || s.gated?.[l]);

/** A level brings the lower ones. */
export function withLower(levels: Iterable<string>): Set<Level> {
  const set = new Set([...levels].filter((l): l is Level => (LEVELS as readonly string[]).includes(l)));
  const top = Math.max(-1, ...[...set].map((l) => LEVELS.indexOf(l)));
  return new Set(LEVELS.slice(0, top + 1));
}

/** Every catalog action, once - checked by the tests (rights.test.ts). */
export function mappedActions(): string[] {
  const out: string[] = [];
  for (const l of LEVELS) out.push(...OBJECT_ACTIONS[l]);
  for (const s of SYSTEM_SECTIONS) {
    for (const l of LEVELS) out.push(...(s.levels[l] ?? []), ...(s.gated?.[l]?.actions ?? []));
  }
  return out;
}

export interface Computed {
  global: Set<string>;
  scoped: Map<string, Set<string>>;
}

/**
 * A role's rights -> the actions held everywhere and on some objects (`units` - every object now).
 * `covers` - an installation -> the processes (with no node) using it (access/usage.ts): with no row of
 * its own, the rows of those processes decide it (the most of them), before the "*" row - an object is a
 * process with its nodes (2026-10-28).
 */
export function computeRights(rights: Rights, units: string[], covers: Map<string, string[]> = new Map()): Computed {
  const global = new Set<string>();
  const scoped = new Map<string, Set<string>>();
  const fallback = withLower(rights[ALL_OBJECTS] ?? []);
  const levelsOf = (u: string) => {
    if (rights[u]) return withLower(rights[u]);
    const by = (covers.get(u) ?? []).filter((p) => rights[p]);
    return by.length ? withLower(by.flatMap((p) => rights[p])) : fallback;
  };
  // the objects holding a level: everywhere (null) - the "*" row has it and no object's row lowers it
  const holding = (l: Level): Set<string> | null => {
    const on = new Set(units.filter((u) => levelsOf(u).has(l)));
    return fallback.has(l) && on.size === units.length ? null : on;
  };
  const give = (actions: string[], where: Set<string> | null) => {
    for (const a of actions) {
      if (where === null) global.add(a);
      else if (where.size) scoped.set(a, new Set([...(scoped.get(a) ?? []), ...where]));
    }
  };
  for (const l of LEVELS) give(OBJECT_ACTIONS[l], holding(l));
  for (const s of SYSTEM_SECTIONS) {
    const own = withLower(rights[sectionKey(s.key)] ?? []);
    for (const l of own) {
      give(s.levels[l] ?? [], null);
      const g = s.gated?.[l];
      if (g) give(g.actions, holding(g.on));
    }
  }
  for (const a of global) scoped.delete(a);
  return { global, scoped };
}

/** Rights from a form - cleaned (known objects and levels), or a problem's text. */
export function rightsProblem(input: unknown, units: Set<string>): Rights | string {
  if (!input || typeof input !== "object" || Array.isArray(input)) return "rights: an object -> levels";
  const sections = new Map(SYSTEM_SECTIONS.map((s) => [sectionKey(s.key), new Set<string>(sectionLevels(s))]));
  const out: Rights = {};
  for (const [object, levels] of Object.entries(input as Record<string, unknown>)) {
    if (!Array.isArray(levels)) return `rights of ${object}: a list of levels`;
    const offered = sections.get(object) ?? (object === ALL_OBJECTS || units.has(object) ? new Set<string>(LEVELS) : null);
    if (!offered) return `unknown object ${object}`;
    const bad = levels.filter((l) => !(LEVELS as readonly string[]).includes(String(l)));
    if (bad.length) return `${object}: no level ${bad.join(", ")}`;
    // a higher level brings the lower ones - those the object offers
    out[object] = [...withLower(levels as string[])].filter((l) => offered.has(l));
  }
  return out;
}

/** What the role editor shows: the levels and the system sections with the levels they offer. */
export const rightsCatalog = () => ({
  levels: LEVELS,
  sections: SYSTEM_SECTIONS.map((s) => ({ key: sectionKey(s.key), label: s.label, levels: sectionLevels(s) })),
});

const LEVEL_NAMES: Record<Level, string> = { view: "View", control: "Control", config: "Configure" };

/** Which row and level give an action - the role editor's "Menu and pages" says why a page opens. */
export function actionSources(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const l of LEVELS) for (const a of OBJECT_ACTIONS[l]) out[a] = `Objects - ${LEVEL_NAMES[l]}`;
  for (const s of SYSTEM_SECTIONS)
    for (const l of LEVELS) {
      for (const a of s.levels[l] ?? []) out[a] = `${s.label} - ${LEVEL_NAMES[l]}`;
      const g = s.gated?.[l];
      if (g) for (const a of g.actions) out[a] = `${s.label} - ${LEVEL_NAMES[l]}, on objects with ${LEVEL_NAMES[g.on]}`;
    }
  return out;
}

/** The catalog's actions not in the mapping, or mapped twice (tests). */
export function mappingProblems(): string[] {
  const mapped = mappedActions();
  const missing = ALL_PERMISSIONS.filter((p) => !mapped.includes(p)).map((p) => `unmapped ${p}`);
  const twice = mapped.filter((p, i) => mapped.indexOf(p) !== i).map((p) => `twice ${p}`);
  const unknown = mapped.filter((p) => !ALL_PERMISSIONS.includes(p)).map((p) => `not in the catalog ${p}`);
  return [...missing, ...twice, ...unknown];
}
