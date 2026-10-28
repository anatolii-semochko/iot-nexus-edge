import type { MigrationBuilder } from "node-pg-migrate";

// Roles without groups (iot AGENTS_TO_DO.md 2026-10-27): a role is what a person acts as - a table
// object x level (`roles.rights`: "*" - every other object, a DNP unit, "section:<key>" -> [view,
// control, config]; access/rights.ts), the Dashboard cards it shows (`roles.dashboard`: null - all, else
// the ids), its link name, its AI tokens; people are its members (`role_members`). The groups, the
// grants and a person's own grants are gone - turned into roles here:
// - every role keeps its key; its permission set (the old defaults for the system ones) -> rights on
//   "*"; `admin` and `system` hold everything by their key;
// - a group -> a role of its name (its grants -> rows: everywhere -> "*", on some instances -> those
//   objects with the "*" levels added), its members, its link name;
// - a person's own grants: one role everywhere -> a member of that role; else a role "<name> - own
//   access";
// - a Dashboard card limited to groups -> every role's list of cards (only when some card was limited);
// - the last group acted in -> the role; the access proposals still pending -> rejected (their form
//   is gone).
// The mapping below is this migration's own snapshot of the catalog then (access/catalog.ts,
// access/rights.ts) - a later change of them must not change what it did.

type Level = "view" | "control" | "config";
const LEVELS: Level[] = ["view", "control", "config"];

// the old catalog: an action -> its old level (the system roles' defaults by it)
const OLD_LEVEL: Record<string, string> = {
  "dashboard.view": "read", "dashboard.manage": "config", "ai.use": "read", "ai.decide": "control", "ai.share": "config", "ai.configure": "admin",
  "nodes.view": "read", "nodes.manage": "install", "devices.view": "read", "devices.write": "control", "simulation.view": "control",
  "devices.simulate": "control", "devices.manage": "install", "processes.view": "read", "processes.control": "control", "processes.config": "config",
  "processes.manage": "install", "logs.view": "read", "logs.configure": "config", "library.view": "read", "library.manage": "install",
  "settings.view": "read", "settings.config": "config", "service.database.backup": "admin", "service.database.restore": "admin",
  "service.database.clear-logs": "admin", "service.system": "admin", "service.dnp": "admin", "users.manage": "admin",
  "dnp.view": "read", "dnp.control": "control", "dnp.config": "config",
};
const byOld = (...levels: string[]) => Object.keys(OLD_LEVEL).filter((k) => levels.includes(OLD_LEVEL[k]));
const DEFAULTS: Record<string, string[]> = {
  operator: byOld("read", "control", "config"),
  viewer: byOld("read"),
  guest: byOld("read"),
  demo: byOld("read"),
};
const FULL = new Set(["admin", "system"]);

// the new mapping: an action -> its row ("obj" - the objects; "section:<key>") and level
const NEW: Record<string, [string, Level]> = {
  "nodes.view": ["obj", "view"], "devices.view": ["obj", "view"], "processes.view": ["obj", "view"], "dnp.view": ["obj", "view"],
  "devices.write": ["obj", "control"], "processes.control": ["obj", "control"], "dnp.control": ["obj", "control"],
  "processes.config": ["obj", "config"], "processes.manage": ["obj", "config"], "nodes.manage": ["obj", "config"], "devices.manage": ["obj", "config"],
  "devices.simulate": ["obj", "config"], "simulation.view": ["obj", "config"], "dnp.config": ["obj", "config"],
  "dashboard.view": ["section:dashboard", "view"], "dashboard.manage": ["section:dashboard", "config"],
  "ai.use": ["section:ai", "view"], "ai.decide": ["section:ai", "control"], "ai.share": ["section:ai", "control"], "ai.configure": ["section:ai", "config"],
  "logs.view": ["section:logs", "view"], "logs.configure": ["section:logs", "config"],
  "library.view": ["section:library", "view"], "library.manage": ["section:library", "config"],
  "settings.view": ["section:settings", "view"], "settings.config": ["section:settings", "config"],
  "service.database.backup": ["section:service", "control"], "service.database.restore": ["section:service", "config"],
  "service.database.clear-logs": ["section:service", "config"], "service.system": ["section:service", "config"], "service.dnp": ["section:service", "config"],
  "users.manage": ["section:users", "config"],
};

type Rights = Record<string, Set<Level>>;
const add = (rights: Rights, object: string, level: Level) => (rights[object] ??= new Set()).add(level);

/** A permission set on a scope (null - everywhere) -> rows added to `rights`. */
function addGrant(rights: Rights, permissions: string[], scope: string[] | null) {
  for (const p of permissions) {
    const m = NEW[p];
    if (!m) continue;
    const [row, level] = m;
    if (row !== "obj") add(rights, row, level);
    else if (scope === null) add(rights, "*", level);
    else scope.forEach((u) => add(rights, u, level));
  }
}

// the levels a section offers (a level with nothing behind it - not stored)
const SECTION_LEVELS: Record<string, Level[]> = {
  "section:dashboard": ["view", "config"],
  "section:ai": ["view", "control", "config"],
  "section:logs": ["view", "config"],
  "section:library": ["view", "config"],
  "section:settings": ["view", "config"],
  "section:service": ["control", "config"],
  "section:users": ["config"],
};

/**
 * The rows as stored: an object's row with the "*" levels too (it replaces "*"), every row with its lower
 * levels - a section's only those it offers.
 */
function finish(rights: Rights): Record<string, Level[]> {
  const all = rights["*"] ?? new Set<Level>();
  const out: Record<string, Level[]> = {};
  for (const [object, levels] of Object.entries(rights)) {
    const set = object === "*" || object.startsWith("section:") ? levels : new Set([...levels, ...all]);
    const top = Math.max(...[...set].map((l) => LEVELS.indexOf(l)));
    const offered = SECTION_LEVELS[object] ?? LEVELS;
    out[object] = LEVELS.slice(0, top + 1).filter((l) => offered.includes(l));
  }
  return out;
}

const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 36) || "role";

export const up = async (pgm: MigrationBuilder): Promise<void> => {
  const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => pgm.db.query(sql, params).then((r: { rows: T[] }) => r.rows);

  await q(`ALTER TABLE roles ADD COLUMN rights jsonb NOT NULL DEFAULT '{}'::jsonb, ADD COLUMN dashboard jsonb, ADD COLUMN link_key text UNIQUE`);
  await q(`CREATE TABLE role_members (
    role_key text NOT NULL REFERENCES roles ON DELETE CASCADE ON UPDATE CASCADE,
    user_id integer NOT NULL REFERENCES users ON DELETE CASCADE,
    PRIMARY KEY (role_key, user_id))`);
  await q(`CREATE INDEX role_members_user_id_index ON role_members (user_id)`);

  const roles = await q<{ key: string; name: string; permissions: string[] | null }>("SELECT key, name, permissions FROM roles");
  const permsOf = new Map(roles.map((r) => [r.key, r.permissions ?? DEFAULTS[r.key] ?? []]));
  const taken = new Set(roles.map((r) => r.key));
  const names = new Set(roles.map((r) => r.name.toLowerCase()));
  const newKey = (name: string) => {
    let key = slug(name);
    for (let i = 2; taken.has(key); i++) key = `${slug(name)}-${i}`;
    taken.add(key);
    return key;
  };
  const newName = (name: string) => {
    let n = name;
    for (let i = 2; names.has(n.toLowerCase()); i++) n = `${name} (${i})`;
    names.add(n.toLowerCase());
    return n;
  };
  const setRights = (key: string, rights: Rights) => q("UPDATE roles SET rights = $2::jsonb WHERE key = $1", [key, JSON.stringify(finish(rights))]);

  // every role - its permission set everywhere
  for (const r of roles) {
    if (FULL.has(r.key)) continue;
    const rights: Rights = {};
    addGrant(rights, permsOf.get(r.key)!, null);
    await setRights(r.key, rights);
  }

  const grants = await q<{ user_id: number | null; group_id: number | null; role_key: string; scope: string[] | null }>(
    "SELECT user_id, group_id, role_key, scope FROM role_grants ORDER BY id",
  );
  const groupRole = new Map<number, string>();
  const groups = await q<{ id: number; name: string; description: string | null; link_key: string | null }>("SELECT id, name, description, link_key FROM user_groups ORDER BY id");
  for (const g of groups) {
    const key = newKey(g.name);
    groupRole.set(g.id, key);
    await q("INSERT INTO roles (key, name, system, link_key) VALUES ($1, $2, false, $3)", [key, newName(g.name), g.link_key]);
    const rights: Rights = {};
    for (const gr of grants.filter((x) => x.group_id === g.id)) {
      if (FULL.has(gr.role_key)) addGrant(rights, Object.keys(NEW), gr.scope);
      else addGrant(rights, permsOf.get(gr.role_key) ?? [], gr.scope);
    }
    await setRights(key, rights);
    await q("INSERT INTO role_members (role_key, user_id) SELECT $1, user_id FROM user_group_members WHERE group_id = $2", [key, g.id]);
  }

  // a person's own grants
  const ownRole = new Map<number, string>();
  const users = await q<{ id: number; username: string; display_name: string | null }>("SELECT id, username, display_name FROM users");
  for (const u of users) {
    const own = grants.filter((g) => g.user_id === u.id);
    if (!own.length) continue;
    let key: string;
    if (own.length === 1 && own[0].scope === null) key = own[0].role_key;
    else {
      key = newKey(`own-${u.username}`);
      await q("INSERT INTO roles (key, name, system) VALUES ($1, $2, false)", [key, newName(`${u.display_name ?? u.username} - own access`)]);
      const rights: Rights = {};
      for (const g of own) addGrant(rights, FULL.has(g.role_key) ? Object.keys(NEW) : (permsOf.get(g.role_key) ?? []), g.scope);
      await setRights(key, rights);
    }
    ownRole.set(u.id, key);
    await q("INSERT INTO role_members (role_key, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [key, u.id]);
  }

  // the Dashboard cards limited to groups -> each role's own list (only when some card was limited)
  const limited = await q<{ n: number }>("SELECT count(*)::int AS n FROM dashboard_cards WHERE cardinality(access_group_ids) > 0");
  if (limited[0].n > 0) {
    const cards = await q<{ id: number; access_group_ids: number[] }>("SELECT id, access_group_ids FROM dashboard_cards");
    const all = await q<{ key: string }>("SELECT key FROM roles");
    for (const r of all) {
      if (FULL.has(r.key)) continue;
      const groupId = [...groupRole].find(([, k]) => k === r.key)?.[0];
      const ids = cards.filter((c) => !c.access_group_ids?.length || (groupId !== undefined && c.access_group_ids.includes(groupId))).map((c) => c.id);
      await q("UPDATE roles SET dashboard = $2::jsonb WHERE key = $1", [r.key, JSON.stringify(ids)]);
    }
  }

  // the last context: a group -> its role; the own grants -> the own role
  for (const [groupId, key] of groupRole) await q("UPDATE users SET last_context = $2 WHERE last_context = $1", [`group:${groupId}`, `role:${key}`]);
  for (const [userId, key] of ownRole) await q("UPDATE users SET last_context = $2 WHERE id = $1 AND last_context = 'personal'", [userId, `role:${key}`]);
  await q("UPDATE users SET last_context = NULL WHERE last_context NOT LIKE 'role:%'");

  await q("UPDATE ai_proposals SET status = 'rejected' WHERE status = 'pending' AND operation = 'grants'");

  await q("ALTER TABLE dashboard_cards DROP COLUMN access_group_ids");
  await q("DROP TABLE role_grants");
  await q("DROP TABLE user_group_members");
  await q("DROP TABLE user_groups");
  await q("ALTER TABLE roles DROP COLUMN permissions");
};

export const down = (): void => {
  throw new Error("1690000000095 (roles as rights tables) can't be undone - restore a saved state from before it");
};
