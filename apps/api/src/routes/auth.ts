import type { FastifyInstance, FastifyRequest } from "fastify";

import { CATALOG } from "../access/catalog.js";
import { contextOfLink, contextsOf, describePrincipal, GUEST_USERNAME, principalOf, resolveContext } from "../access/principal.js";
import { streamScope } from "../access/scope.js";
import { endSession, sessionAlive, setSessionContext, startSession, type SessionPayload } from "../access/session.js";
import { guestSettings } from "../access/guestSettings.js";
import { verifyPassword } from "../auth.js";
import { pool } from "../db.js";

// Sign in / out and "who am I" (AGENTS.md section 13; B1): the session is a
// server-side one named by a cookie (access/session.ts). /auth/me answers
// the person with their access (the permissions held everywhere, and those
// held on some DNP instances) - the UI hides and disables by it. With the
// `guest` account active (Users -> Guest) a browser without a session gets a
// guest session of its own here - the application opens as the guest, a
// sign-in from its menu (2026-10-27). `?account=<a group's link name>` opens
// it in that group (G1 contexts).

interface UserRow {
  id: number;
  username: string;
  password_hash: string;
  display_name: string | null;
  roles: string[];
  avatar_path: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

function publicUser(user: UserRow) {
  const { password_hash: _passwordHash, ...rest } = user;
  return rest;
}

/** The request's live session, if any (a bad / revoked / idle one - none). */
async function liveSession(request: FastifyRequest): Promise<SessionPayload | null> {
  try {
    const session = await request.jwtVerify<SessionPayload>();
    return (await sessionAlive(session)) ? session : null;
  } catch {
    return null;
  }
}

const activeGuest = async () => (await pool.query<UserRow>("SELECT * FROM users WHERE username = $1 AND active", [GUEST_USERNAME])).rows[0] ?? null;

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: { username: string; password: string; account?: string } }>("/auth/login", async (request, reply) => {
    const username = request.body.username?.trim().toLowerCase();
    const { password } = request.body;
    if (!username || !password) {
      return reply.code(400).send({ error: "username and password are required" });
    }

    const result = await pool.query<UserRow>("SELECT * FROM users WHERE username = $1", [username]);
    const user = result.rows[0];
    // Same generic message whether the username doesn't exist, the user is
    // deactivated, or the password is wrong - not revealing which is true.
    // The guest never signs in with a password.
    if (!user || !user.active || user.username === GUEST_USERNAME || !(await verifyPassword(password, user.password_hash))) {
      return reply.code(401).send({ error: "invalid username or password" });
    }
    // a guest's session in this browser - over
    await endSession(reply, await liveSession(request));
    // the linked group, else the group they last acted in, else the one with the most rights (G1)
    const linked = request.body.account ? await contextOfLink(user.id, request.body.account) : null;
    await startSession(app, reply, user, { ctx: await resolveContext(user.id, linked) });
    return { user: publicUser(user) };
  });

  app.post("/auth/logout", async (request, reply) => {
    await endSession(reply, await liveSession(request));
    return { status: "ok" };
  });

  // `signin` - the sign-in page asks: no guest session started for it
  app.get<{ Querystring: { account?: string; signin?: string } }>("/auth/me", async (request, reply) => {
    let session = await liveSession(request);
    let user: UserRow | null = null;
    if (session) user = (await pool.query<UserRow>("SELECT * FROM users WHERE id = $1 AND active", [session.sub])).rows[0] ?? null;
    const guestAccount = await activeGuest();
    if (!user && guestAccount && !request.query.signin) {
      // a browser of its own - a guest session (its conversations its own)
      user = guestAccount;
      session = await startSession(app, reply, guestAccount, { guest: true });
    }
    if (!user || !session) return reply.code(401).send({ error: "unauthorized", guestEnabled: Boolean(guestAccount) });
    const guest = Boolean(session.guest);
    // the context (G1): a link's group, else the session's while it is still theirs, else their last / the most
    // allowing - the session set to it; a link's choice remembered as the person's last (not the guest's)
    const linked = request.query.account ? await contextOfLink(user.id, request.query.account) : null;
    // a new guest session - the guest's default role (Users -> Guest)
    const start = guest && !session.ctx ? (await guestSettings()).defaultRole : null;
    const context = await resolveContext(user.id, linked ?? session.ctx ?? (start ? `role:${start}` : null), !guest);
    if ((session.ctx ?? null) !== context) setSessionContext(app, reply, session, context);
    if (linked && !guest) await pool.query("UPDATE users SET last_context = $2 WHERE id = $1", [user.id, linked]);
    const contexts = await contextsOf(user.id);
    const principal = await principalOf(user.id, context);
    if (!principal) return reply.code(401).send({ error: "unauthorized" });
    return {
      user: publicUser(user),
      access: await describePrincipal(principal),
      // the groups the person may act in (two or more - the header's menu offers them) and the one now
      contexts: contexts.length > 1 ? contexts.map(({ key, name }) => ({ key, name })) : [],
      context,
      // the guest's session - the menu offers signing in; whether the guest is on (the sign-in page)
      guest,
      guestEnabled: Boolean(guestAccount),
    };
  });

  // act in another of one's groups (G1, 2026-10-26): the session narrowed to it, remembered for the next sign-in
  app.post<{ Body: { context?: string } }>("/auth/context", async (request, reply) => {
    const session = request.session!;
    const asked = request.body?.context;
    const list = await contextsOf(session.sub);
    if (!asked || !list.some((c) => c.key === asked)) return reply.code(400).send({ error: "context - one of the person's groups" });
    setSessionContext(app, reply, session, asked);
    if (!session.guest) await pool.query("UPDATE users SET last_context = $2 WHERE id = $1", [session.sub, asked]);
    return { context: asked };
  });

  // the permission catalog - the UI's role editor and its labels
  app.get("/access/catalog", async () => ({ catalog: CATALOG }));

  // what the live stream may show this person (the messaging gateway asks - access/scope.ts streamScope)
  app.get("/access/stream-scope", async (request) => streamScope(request));
}
