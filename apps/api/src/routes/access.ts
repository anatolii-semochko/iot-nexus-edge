import type { FastifyInstance, FastifyReply } from "fastify";

import { SERVICE_ROLES } from "../access/catalog.js";
import { guestSettings, guestSettingsProblem, saveGuestSettings } from "../access/guestSettings.js";
import { FULL_ROLES, invalidatePrincipals, setUserRoles } from "../access/principal.js";
import { actionSources, computeRights, rightsCatalog, rightsProblem, type Rights } from "../access/rights.js";
import { pool } from "../db.js";
import { instanceUnits } from "../dnpInstances.js";

// Managing access (users.manage, the guard's "/access" prefix; roles without groups since 2026-10-27 -
// iot AGENTS_TO_DO.md): a role - its rights (a table object x level - access/rights.ts), the Dashboard
// cards it shows (null - all), its link name (`?account=`), its AI tokens a day, its members; the
// objects a row can name (the DNP instances + the system sections); a person's roles; the guest.
// Every change drops the cached principals.

interface RoleRow {
  key: string;
  name: string;
  system: boolean;
  rights: Rights;
  dashboard: number[] | null;
  pages: string[] | null;
  link_key: string | null;
  ai_daily_tokens: number | null;
}

const SERVICE_USERNAMES = ["orchestrator", "simulator", "ai-agent"];

const toRole = (r: RoleRow, members: number[]) => ({
  key: r.key,
  name: r.name,
  system: r.system,
  // admin / system - everything, by the key (no table)
  full: FULL_ROLES.has(r.key),
  // a service role (the internal services' accounts) - never a person's
  service: SERVICE_ROLES.has(r.key),
  rights: r.rights ?? {},
  dashboard: r.dashboard,
  pages: r.pages,
  linkKey: r.link_key,
  aiDailyTokens: r.ai_daily_tokens,
  memberIds: members,
});

const bad = (reply: FastifyReply, error: string, code = 400) => reply.code(code).send({ error });
const KEY = /^[a-z][a-z0-9-]{1,39}$/;
// a role's link name (`?account=<it>` - 2026-10-27)
const LINK = /^[a-z0-9][a-z0-9-]{0,39}$/i;
// a page's key - its path's first part ("dashboard", "ai-assistant"), "messages" - the header's
const PAGE = /^[a-z0-9][a-z0-9-]{0,39}$/;

/** A daily token limit from a form: null / "" - unlimited, a whole number >= 0, else undefined (bad). */
export const tokenLimit = (v: unknown): number | null | undefined =>
  v === null || v === "" ? null : Number.isInteger(v) && (v as number) >= 0 ? (v as number) : undefined;

const linkOf = (v: unknown): string | null | undefined =>
  v === null || v === undefined || String(v).trim() === "" ? null : LINK.test(String(v).trim()) ? String(v).trim().toLowerCase() : undefined;

/** Every object a row can name: the DNP instances and the devices with no node. */
const objectKeys = async () => new Set([...(await instanceUnits()).units.keys(), "system"]);

interface RoleInput {
  key?: string;
  name?: string;
  rights?: unknown;
  dashboard?: unknown;
  pages?: unknown;
  linkKey?: string | null;
  aiDailyTokens?: number | null;
  memberIds?: unknown;
}

type Fields = Partial<RoleRow> & { members?: number[] };

/** A form's fields checked - the columns to write, or a problem's text. */
async function roleFields(body: RoleInput, current: RoleRow | null): Promise<Fields | string> {
  const out: Fields = {};
  if (body.name !== undefined) {
    if (!body.name.trim()) return "name is required";
    out.name = body.name.trim();
  }
  if (body.rights !== undefined && !(current && FULL_ROLES.has(current.key))) {
    const rights = rightsProblem(body.rights, await objectKeys());
    if (typeof rights === "string") return rights;
    out.rights = rights;
  }
  if (body.dashboard !== undefined) {
    if (body.dashboard !== null && !(Array.isArray(body.dashboard) && body.dashboard.every(Number.isInteger))) return "dashboard: null (all cards) or a list of card ids";
    out.dashboard = body.dashboard as number[] | null;
  }
  if (body.pages !== undefined) {
    if (body.pages !== null && !(Array.isArray(body.pages) && body.pages.every((p) => typeof p === "string" && PAGE.test(p))))
      return "pages: null (every page its rights open) or a list of page keys";
    out.pages = body.pages === null ? null : [...new Set(body.pages as string[])];
  }
  if (body.linkKey !== undefined) {
    const link = linkOf(body.linkKey);
    if (link === undefined) return "link name: letters, digits, dashes (1-40)";
    out.link_key = link;
  }
  if (body.aiDailyTokens !== undefined) {
    const limit = tokenLimit(body.aiDailyTokens);
    if (limit === undefined) return "aiDailyTokens: empty (unlimited), 0 (off) or a whole number";
    out.ai_daily_tokens = limit;
  }
  if (body.memberIds !== undefined) {
    if (!Array.isArray(body.memberIds) || !body.memberIds.every(Number.isInteger)) return "memberIds: a list of user ids";
    out.members = [...new Set(body.memberIds as number[])];
  }
  return out;
}

/** A role's members replaced - a problem's text, or null. */
async function saveMembers(key: string, userIds: number[]): Promise<string | null> {
  if (SERVICE_ROLES.has(key)) return "a service role's members are fixed";
  const services = (await pool.query<{ id: number }>("SELECT id FROM users WHERE username = ANY($1)", [SERVICE_USERNAMES])).rows.map((r) => r.id);
  if (userIds.some((id) => services.includes(id))) return "an internal service's account has its own role only";
  if (key === "admin") {
    const admin = (await pool.query<{ id: number }>("SELECT id FROM users WHERE username = 'admin'")).rows[0];
    if (admin && !userIds.includes(admin.id)) return "the admin account keeps its administrator role";
  }
  await pool.query("DELETE FROM role_members WHERE role_key = $1", [key]);
  if (userIds.length) await pool.query("INSERT INTO role_members (role_key, user_id) SELECT $1, unnest($2::int[]) ON CONFLICT DO NOTHING", [key, userIds]);
  // `users.roles` 'admin' kept in step (old readers)
  await pool.query(
    "UPDATE users u SET roles = CASE WHEN EXISTS (SELECT 1 FROM role_members m WHERE m.user_id = u.id AND m.role_key = 'admin') THEN '{admin}'::text[] ELSE '{}'::text[] END",
  );
  return null;
}

const conflict = (reply: FastifyReply, err: unknown) => {
  if ((err as { code?: string }).code === "23505") return bad(reply, "a role with this key or link name exists", 409);
  throw err;
};

export async function accessRoutes(app: FastifyInstance): Promise<void> {
  // what a role's row can name: the levels, the system sections, the DNP instances (+ the devices with no node)
  app.get("/access/objects", async () => {
    const map = await instanceUnits();
    // each object's processes (the role editor's Dashboard - which cards the role sees) and their names
    const processes = (await pool.query<{ id: number; name: string }>("SELECT id, name FROM processes")).rows;
    const processIds = (key: string) => [...map.processUnit].filter(([, u]) => u === key).map(([id]) => id);
    // which processes use an object (where it sits - many objects share a kind of name): those running on
    // it, and those naming one of its nodes in their settings (a "nodeId" anywhere in processes.config)
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
    const name = new Map(processes.map((p) => [p.id, p.name]));
    const usedBy = new Map<string, Set<string>>();
    const use = (unit: string | undefined, processId: number) => {
      if (unit && name.has(processId)) usedBy.set(unit, new Set([...(usedBy.get(unit) ?? []), name.get(processId)!]));
    };
    for (const [id, unit] of map.processUnit) if (unit.startsWith("node:")) use(unit, id);
    for (const r of refs) use(map.nodeUnit.get(r.node_id), r.process_id);
    const units = [...map.units]
      .map(([key, u]) => ({
        key,
        name: u.name,
        // a process with no node - its kind; an installation - the processes using it
        detail: key.startsWith("process:") ? u.detail.join(", ") : usedBy.has(key) ? `used by ${[...usedBy.get(key)!].sort().join(", ")}` : "",
        processIds: processIds(key),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return {
      ...rightsCatalog(),
      objects: [...units, { key: "system", name: "Devices with no node", detail: "standalone devices", processIds: [] }],
      processNames: Object.fromEntries(processes.map((p) => [p.id, p.name])),
    };
  });

  // what a role's table gives (the role editor's "Menu and pages" - before saving): the actions everywhere,
  // on some objects (their count), and the row giving each action
  app.post<{ Body: { rights?: unknown; full?: boolean } }>("/access/rights/preview", async (request, reply) => {
    const keys = await objectKeys();
    const sources = actionSources();
    if (request.body?.full) return { global: ["*"], scoped: {}, sources };
    const rights = rightsProblem(request.body?.rights ?? {}, keys);
    if (typeof rights === "string") return bad(reply, rights);
    const c = computeRights(rights, [...keys]);
    return { global: [...c.global], scoped: Object.fromEntries([...c.scoped].map(([a, u]) => [a, u.size])), sources };
  });

  // --- roles
  const listRoles = async () => {
    const rows = (await pool.query<RoleRow>("SELECT key, name, system, rights, dashboard, pages, link_key, ai_daily_tokens FROM roles ORDER BY system DESC, name")).rows;
    const members = (await pool.query<{ role_key: string; user_id: number }>("SELECT role_key, user_id FROM role_members")).rows;
    return rows.map((r) => toRole(r, members.filter((m) => m.role_key === r.key).map((m) => m.user_id)));
  };
  app.get("/access/roles", async () => ({ roles: await listRoles() }));

  // a new role; `copyOf` - another role's rights, cards and AI tokens (not its members or link name)
  app.post<{ Body: RoleInput & { copyOf?: string } }>("/access/roles", async (request, reply) => {
    const body = request.body ?? {};
    if (!body.key || !KEY.test(body.key)) return bad(reply, "key: lowercase letters, digits, dashes (2-40)");
    if (!body.name?.trim()) return bad(reply, "name is required");
    const source = body.copyOf ? (await pool.query<RoleRow>("SELECT * FROM roles WHERE key = $1", [body.copyOf])).rows[0] : null;
    if (body.copyOf && !source) return bad(reply, "no role to copy", 404);
    if (source && FULL_ROLES.has(source.key)) return bad(reply, "this role holds everything by its key - make a role with every level instead");
    const fields = await roleFields(
      { rights: source?.rights ?? {}, dashboard: source?.dashboard ?? null, pages: source?.pages ?? null, aiDailyTokens: source?.ai_daily_tokens ?? null, ...body },
      null,
    );
    if (typeof fields === "string") return bad(reply, fields);
    try {
      await pool.query("INSERT INTO roles (key, name, system, rights, dashboard, pages, link_key, ai_daily_tokens) VALUES ($1, $2, false, $3, $4, $5, $6, $7)", [
        body.key,
        fields.name,
        JSON.stringify(fields.rights ?? {}),
        fields.dashboard ? JSON.stringify(fields.dashboard) : null,
        fields.pages ? JSON.stringify(fields.pages) : null,
        fields.link_key ?? null,
        fields.ai_daily_tokens ?? null,
      ]);
    } catch (err) {
      return conflict(reply, err);
    }
    if (fields.members) {
      const problem = await saveMembers(body.key, fields.members);
      if (problem) return bad(reply, problem);
    }
    invalidatePrincipals();
    return (await listRoles()).find((r) => r.key === body.key);
  });

  app.patch<{ Params: { key: string }; Body: RoleInput }>("/access/roles/:key", async (request, reply) => {
    const role = (await pool.query<RoleRow>("SELECT * FROM roles WHERE key = $1", [request.params.key])).rows[0];
    if (!role) return bad(reply, "no such role", 404);
    const fields = await roleFields(request.body ?? {}, role);
    if (typeof fields === "string") return bad(reply, fields);
    if (fields.members) {
      const problem = await saveMembers(role.key, fields.members);
      if (problem) return bad(reply, problem);
    }
    try {
      await pool.query(
        `UPDATE roles SET name = COALESCE($2, name), rights = COALESCE($3::jsonb, rights),
                dashboard = CASE WHEN $4 THEN $5::jsonb ELSE dashboard END, link_key = CASE WHEN $6 THEN $7 ELSE link_key END,
                ai_daily_tokens = CASE WHEN $8 THEN $9::int ELSE ai_daily_tokens END,
                pages = CASE WHEN $10 THEN $11::jsonb ELSE pages END, updated_at = now()
          WHERE key = $1`,
        [
          role.key,
          fields.name ?? null,
          fields.rights ? JSON.stringify(fields.rights) : null,
          fields.dashboard !== undefined,
          fields.dashboard ? JSON.stringify(fields.dashboard) : null,
          fields.link_key !== undefined,
          fields.link_key ?? null,
          fields.ai_daily_tokens !== undefined,
          fields.ai_daily_tokens ?? null,
          fields.pages !== undefined,
          fields.pages ? JSON.stringify(fields.pages) : null,
        ],
      );
    } catch (err) {
      return conflict(reply, err);
    }
    invalidatePrincipals();
    return (await listRoles()).find((r) => r.key === role.key);
  });

  app.delete<{ Params: { key: string } }>("/access/roles/:key", async (request, reply) => {
    const role = (await pool.query<RoleRow>("SELECT * FROM roles WHERE key = $1", [request.params.key])).rows[0];
    if (!role) return bad(reply, "no such role", 404);
    if (role.system) return bad(reply, "a built-in role can't be deleted");
    await pool.query("DELETE FROM roles WHERE key = $1", [role.key]);
    await pool.query("UPDATE users SET last_context = NULL WHERE last_context = $1", [`role:${role.key}`]);
    invalidatePrincipals();
    return { status: "ok" };
  });

  // --- a person's roles, replaced as a whole (Users -> a person)
  app.put<{ Params: { id: string }; Body: { roles?: unknown } }>("/access/users/:id/roles", async (request, reply) => {
    const id = Number(request.params.id);
    const user = (await pool.query<{ username: string }>("SELECT username FROM users WHERE id = $1", [id])).rows[0];
    if (!user) return bad(reply, "no such user", 404);
    const keys = request.body?.roles;
    if (!Array.isArray(keys) || !keys.every((k) => typeof k === "string")) return bad(reply, "roles: a list of role keys");
    const problem = await rolesProblem(user.username, keys as string[]);
    if (problem) return bad(reply, problem);
    await setUserRoles(id, [...new Set(keys as string[])]);
    return { roles: keys };
  });

  // --- the guest (2026-10-27): its account (on / off - Users) and its conversations' settings
  app.get("/access/guest", async () => {
    const account = (await pool.query(`SELECT id, active, ai_daily_tokens AS "aiDailyTokens" FROM users WHERE username = 'guest'`)).rows[0] ?? null;
    return { account, settings: await guestSettings() };
  });

  app.put<{ Body: unknown }>("/access/guest", async (request, reply) => {
    const next = guestSettingsProblem(await guestSettings(), request.body);
    if (typeof next === "string") return bad(reply, next);
    await saveGuestSettings(next);
    return { settings: next };
  });
}

/** Whether a person may get these roles - a problem's text, or null (also the AI's access proposal). */
export async function rolesProblem(username: string, keys: string[]): Promise<string | null> {
  const known = new Set((await pool.query<{ key: string }>("SELECT key FROM roles")).rows.map((r) => r.key));
  const unknown = keys.filter((k) => !known.has(k));
  if (unknown.length) return `unknown role ${unknown.join(", ")}`;
  if (SERVICE_USERNAMES.includes(username)) return "an internal service's account has its own role only";
  if (keys.some((k) => SERVICE_ROLES.has(k))) return "a service role is the internal services' own - not a person's";
  if (username === "admin" && !keys.includes("admin")) return "the admin account keeps its administrator role";
  return null;
}
