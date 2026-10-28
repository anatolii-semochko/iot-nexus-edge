import { config } from "../config.js";
import { instanceUnits } from "../dnpInstances.js";
import { pool } from "../db.js";
import { computeRights, type Rights } from "./rights.js";

// Who is asking and what they may do (B1; roles without groups since 2026-10-27): a person is a
// member of roles; each role is a table object x level (access/rights.ts) - turned into the actions
// held everywhere and on some DNP instances (units - dnpInstances.ts). A person with several roles acts
// in one at a time (the context "role:<key>" - the header's menu; none - the union of all, for one
// role). `admin` and `system` hold everything. The AI's daily tokens - the account's and its role's
// limits (0 - no ai.use); the Dashboard cards - the role's list (null - all).
// Cached per person and context for AUTH_PRINCIPAL_CACHE_MS; any change of roles or members drops
// the whole cache (invalidatePrincipals).

export interface Principal {
  kind: "user" | "service";
  userId: number;
  username: string;
  // permissions held everywhere
  global: Set<string>;
  // permissions held only on some units: permission -> units
  scoped: Map<string, Set<string>>;
  // the guest (the built-in `guest` account - routes/auth.ts): a refusal asks to sign in
  guest: boolean;
  // the AI's tokens a day (null - unlimited; 0 - the AI off: no ai.use): the strictest of the account's
  // own and its roles' (of several roles - the most generous)
  aiDailyTokens: number | null;
  // the Dashboard cards shown (null - all): the role's list (several roles - their union)
  dashboardCards: Set<number> | null;
  // the pages / menu entries shown ("dashboard", "nodes", ... and "messages" - the header's; null - every
  // one the rights open): the role's list (several roles - their union). Shown only - the rights decide.
  pages: Set<string> | null;
}

export const SERVICE_PRINCIPAL = (userId: number): Principal => ({
  kind: "service",
  userId,
  username: "orchestrator",
  global: new Set(["*"]),
  scoped: new Map(),
  guest: false,
  aiDailyTokens: null,
  dashboardCards: null,
  pages: null,
});

/** The roles holding everything (by their key - no rights table). */
export const FULL_ROLES = new Set(["admin", "system"]);

export const GUEST_USERNAME = "guest";

/** Whether a principal may do `permission` (on `unit` - a DNP instance; absent - anywhere it holds it). */
export function can(p: Principal, permission: string, unit?: string | null): boolean {
  if (p.global.has("*") || p.global.has(permission)) return true;
  const units = p.scoped.get(permission);
  if (!units) return false;
  return unit === undefined ? units.size > 0 : unit !== null && units.has(unit);
}

/** The units a principal sees with `permission`: null - all; else the set (maybe empty). */
export function visibleUnits(p: Principal, permission: string): Set<string> | null {
  if (p.global.has("*") || p.global.has(permission)) return null;
  return p.scoped.get(permission) ?? new Set();
}

/** The strictest of two daily token limits (null - unlimited). */
const stricter = (a: number | null, b: number | null) => (a === null ? b : b === null ? a : Math.min(a, b));

const cache = new Map<string, { at: number; principal: Promise<Principal | null> }>();
export const invalidatePrincipals = () => cache.clear();

interface RoleRow {
  key: string;
  name: string;
  rights: Rights;
  dashboard: number[] | null;
  pages: string[] | null;
  ai_daily_tokens: number | null;
}

/** A person's roles - all, or the one of the context ("role:<key>"). */
async function rolesOf(userId: number, context: string | null): Promise<RoleRow[]> {
  const only = context?.startsWith("role:") ? context.slice(5) : null;
  return (
    await pool.query<RoleRow>(
      `SELECT r.key, r.name, r.rights, r.dashboard, r.pages, r.ai_daily_tokens FROM roles r JOIN role_members m ON m.role_key = r.key
        WHERE m.user_id = $1 AND ($2::text IS NULL OR r.key = $2) ORDER BY r.key`,
      [userId, only],
    )
  ).rows;
}

async function load(userId: number, context: string | null = null): Promise<Principal | null> {
  const user = (
    await pool.query<{ id: number; username: string; active: boolean; ai_daily_tokens: number | null }>(
      "SELECT id, username, active, ai_daily_tokens FROM users WHERE id = $1",
      [userId],
    )
  ).rows[0];
  if (!user || !user.active) return null;
  const roles = await rolesOf(userId, context);
  const global = new Set<string>();
  const scoped = new Map<string, Set<string>>();
  const unitKeys = [...(await instanceUnits()).units.keys(), "system"];
  for (const r of roles) {
    if (FULL_ROLES.has(r.key)) {
      global.add("*");
      continue;
    }
    const c = computeRights(r.rights ?? {}, unitKeys);
    c.global.forEach((a) => global.add(a));
    for (const [a, units] of c.scoped) scoped.set(a, new Set([...(scoped.get(a) ?? []), ...units]));
  }
  for (const perm of global) scoped.delete(perm);
  // the roles' limit - the most generous of them (one unlimited - unlimited)
  const roleLimit = roles.length === 0 || roles.some((r) => r.ai_daily_tokens === null) ? null : Math.max(...roles.map((r) => r.ai_daily_tokens as number));
  const aiDailyTokens = stricter(user.ai_daily_tokens, roleLimit);
  if (aiDailyTokens === 0) {
    global.delete("ai.use");
    scoped.delete("ai.use");
  }
  // the cards: all when a role shows all (or holds everything), else the union of the lists
  const dashboardCards =
    roles.length === 0 ? new Set<number>() : roles.some((r) => FULL_ROLES.has(r.key) || r.dashboard === null) ? null : new Set(roles.flatMap((r) => r.dashboard ?? []));
  const pages =
    roles.length === 0 ? new Set<string>() : roles.some((r) => FULL_ROLES.has(r.key) || r.pages === null) ? null : new Set(roles.flatMap((r) => r.pages ?? []));
  return { kind: "user", userId: user.id, username: user.username, global, scoped, guest: user.username === GUEST_USERNAME, aiDailyTokens, dashboardCards, pages };
}

/** A person's principal (null - no such active user); `context` - the role they act in (null - all their roles). */
export function principalOf(userId: number, context: string | null = null): Promise<Principal | null> {
  const key = `${userId}|${context ?? ""}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < config.auth.principalCacheMs) return hit.principal;
  const principal = load(userId, context);
  cache.set(key, { at: Date.now(), principal });
  principal.catch(() => cache.delete(key));
  return principal;
}

export interface AccessContext {
  key: string; // "role:<key>"
  name: string;
  rank: number; // how much it allows - the first sign-in's choice
}

/** The roles a person may act in (two or more - a choice), the most allowing first. */
export async function contextsOf(userId: number): Promise<AccessContext[]> {
  const roles = await rolesOf(userId, null);
  const ranked = await Promise.all(
    roles.map(async (r) => {
      const key = `role:${r.key}`;
      const p = await principalOf(userId, key);
      // the strongest first (how many kinds of action - admin > engineer > operator > viewer), then how widely
      const kinds = !p ? 0 : new Set([...p.global, ...p.scoped.keys()]).size;
      const breadth = !p ? 0 : p.global.size * 1000 + [...p.scoped.values()].reduce((a, u) => a + u.size, 0);
      const rank = !p ? 0 : p.global.has("*") ? Number.MAX_SAFE_INTEGER : kinds * 1_000_000 + breadth;
      return { key, name: r.name, rank };
    }),
  );
  return ranked.sort((a, b) => b.rank - a.rank || a.name.localeCompare(b.name));
}

/**
 * The context a session acts in: the asked one if it is still the person's, else their last (never the
 * guest's - one account, many browsers), else the most allowing.
 */
export async function resolveContext(userId: number, asked: string | null | undefined, remembered = true): Promise<string | null> {
  const list = await contextsOf(userId);
  if (list.length < 2) return null;
  if (asked && list.some((c) => c.key === asked)) return asked;
  if (remembered) {
    const last = (await pool.query<{ last_context: string | null }>("SELECT last_context FROM users WHERE id = $1", [userId])).rows[0]?.last_context;
    if (last && list.some((c) => c.key === last)) return last;
  }
  return list[0].key;
}

/** The context a link names (`?account=<a role's link name>` - 2026-10-27): one of the person's roles, else null. */
export async function contextOfLink(userId: number, link: string): Promise<string | null> {
  const role = (await pool.query<{ key: string }>("SELECT key FROM roles WHERE lower(link_key) = lower($1)", [link.trim()])).rows[0];
  if (!role) return null;
  const key = `role:${role.key}`;
  return (await contextsOf(userId)).some((c) => c.key === key) ? key : null;
}

/**
 * What /auth/me tells the UI: the permissions held everywhere, and those
 * held on some units - with the units' process / node / device ids, so the
 * UI checks an action on an entity without knowing the units.
 */
export async function describePrincipal(p: Principal) {
  const map = await instanceUnits();
  const ids = (units: Set<string>, m: Map<number, string>) => [...m].filter(([, u]) => units.has(u)).map(([id]) => id);
  return {
    global: [...p.global],
    scoped: Object.fromEntries(
      [...p.scoped].map(([perm, units]) => [
        perm,
        { units: [...units], processes: ids(units, map.processUnit), nodes: ids(units, map.nodeUnit), devices: ids(units, map.deviceUnit) },
      ]),
    ),
    guest: p.guest,
    aiDailyTokens: p.aiDailyTokens,
    // the pages shown (null - every one the rights open)
    pages: p.pages === null ? null : [...p.pages],
  };
}

/** A person's roles replaced (Users -> a person; the AI's access proposal); `users.roles` 'admin' kept in step (old readers). */
export async function setUserRoles(userId: number, roleKeys: string[]): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM role_members WHERE user_id = $1", [userId]);
    if (roleKeys.length) await client.query("INSERT INTO role_members (role_key, user_id) SELECT unnest($2::text[]), $1 ON CONFLICT DO NOTHING", [userId, roleKeys]);
    await client.query("UPDATE users SET roles = CASE WHEN 'admin' = ANY($2::text[]) THEN '{admin}'::text[] ELSE '{}'::text[] END WHERE id = $1", [userId, roleKeys]);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
  invalidatePrincipals();
}
