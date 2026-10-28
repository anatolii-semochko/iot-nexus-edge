import type { FastifyInstance, FastifyReply } from "fastify";

import { config } from "../config.js";
import { pool } from "../db.js";

// The session (B1; server-side since 2026-10-27 - iot AGENTS_TO_DO.md): a cookie with a JWT naming the
// person and their session (`sid` - a user_sessions row). The token and its cookie live JWT_TOKEN_TTL
// (the cookie outlives the browser) - from the sign-in, whatever the activity (also checked on the
// server: the row's created_at); the server keeps the session's last activity - unused for
// JWT_TIME_INVALIDATION it is over (sign in again). Signing out revokes it, a deactivation - all the
// person's. Per session, not per person: signing out on one device leaves the others.
// A guest's session (routes/auth.ts) is one too - its `sid` keeps the guest's own conversations.

export interface SessionPayload {
  sub: number;
  username: string;
  sid: string;
  // the guest (the built-in `guest` account; every browser - a session of its own)
  guest?: boolean;
  // the role the person acts in ("role:<key>"; none - all their roles)
  ctx?: string;
  iat?: number;
  exp?: number;
}

const cookieOptions = () => ({ httpOnly: true, sameSite: "strict" as const, secure: config.auth.secureCookies, path: "/" });

function sign(app: FastifyInstance, reply: FastifyReply, payload: SessionPayload): void {
  const { iat: _iat, exp, ...claims } = payload;
  // the absolute limit counts from the sign-in: a re-signed token (another context) keeps the time left
  const left = exp ? Math.max(1, exp - Math.floor(Date.now() / 1000)) : config.auth.tokenTtlSeconds;
  const token = app.jwt.sign(claims, { expiresIn: left });
  reply.setCookie(config.auth.cookieName, token, { ...cookieOptions(), maxAge: left });
}

// the sessions checked lately: sid -> when the row was last read / written (ms); a revoked one is dropped
const seen = new Map<string, number>();

/** Starts a session for a person (a sign-in, or a guest's first visit). */
export async function startSession(
  app: FastifyInstance,
  reply: FastifyReply,
  user: { id: number; username: string },
  options: { guest?: boolean; ctx?: string | null } = {},
): Promise<SessionPayload> {
  const sid = (await pool.query<{ id: string }>("INSERT INTO user_sessions (user_id) VALUES ($1) RETURNING id", [user.id])).rows[0].id;
  seen.set(sid, Date.now());
  const payload: SessionPayload = { sub: user.id, username: user.username, sid, ...(options.guest ? { guest: true } : {}), ...(options.ctx ? { ctx: options.ctx } : {}) };
  sign(app, reply, payload);
  return payload;
}

/** The same session in another context (G1). */
export function setSessionContext(app: FastifyInstance, reply: FastifyReply, session: SessionPayload, ctx: string | null): void {
  const { ctx: _old, ...rest } = session;
  sign(app, reply, { ...rest, ...(ctx ? { ctx } : {}) });
}

/** Whether a verified token's session is still on (not revoked, used lately) - its activity noted. */
export async function sessionAlive(session: SessionPayload): Promise<boolean> {
  if (!session.sid) return false;
  const now = Date.now();
  const last = seen.get(session.sid);
  if (last !== undefined && now - last < config.auth.activityWriteSeconds * 1000) return true;
  const row = (
    await pool.query<{ user_id: number; idle: number; age: number; revoked: boolean }>(
      `SELECT user_id, extract(epoch FROM now() - last_activity_at)::float8 AS idle, extract(epoch FROM now() - created_at)::float8 AS age,
              revoked_at IS NOT NULL AS revoked FROM user_sessions WHERE id = $1`,
      [session.sid],
    )
  ).rows[0];
  if (!row || row.revoked || row.user_id !== session.sub || row.idle > config.auth.idleSeconds || row.age > config.auth.tokenTtlSeconds) {
    seen.delete(session.sid);
    if (row && !row.revoked) await pool.query("UPDATE user_sessions SET revoked_at = now() WHERE id = $1", [session.sid]);
    return false;
  }
  await pool.query("UPDATE user_sessions SET last_activity_at = now() WHERE id = $1", [session.sid]);
  seen.set(session.sid, now);
  return true;
}

/** Signs out: the session revoked, the cookie cleared. */
export async function endSession(reply: FastifyReply, session: SessionPayload | null): Promise<void> {
  if (session?.sid) {
    seen.delete(session.sid);
    await pool.query("UPDATE user_sessions SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL", [session.sid]);
  }
  reply.clearCookie(config.auth.cookieName, cookieOptions());
}

/** Every session of a person over (a deactivation, a new password). */
export async function revokeSessionsOf(userId: number, except: string | null = null): Promise<void> {
  const { rows } = await pool.query<{ id: string }>(
    "UPDATE user_sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL AND id IS DISTINCT FROM $2::uuid RETURNING id",
    [userId, except],
  );
  rows.forEach((r) => seen.delete(r.id));
}

/** The sessions over (revoked, or idle past the limit) - removed (maintenance.ts). */
export async function removeEndedSessions(): Promise<number> {
  const r = await pool.query(
    "DELETE FROM user_sessions WHERE revoked_at IS NOT NULL OR last_activity_at < now() - make_interval(secs => $1) OR created_at < now() - make_interval(secs => $2)",
    [config.auth.idleSeconds, config.auth.tokenTtlSeconds],
  );
  return r.rowCount ?? 0;
}
