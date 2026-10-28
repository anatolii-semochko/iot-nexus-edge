import { randomUUID } from "node:crypto";
import { unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import type { MultipartFile } from "@fastify/multipart";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { hashPassword, requireAdmin, verifyPassword } from "../auth.js";
import { invalidatePrincipals } from "../access/principal.js";
import { revokeSessionsOf } from "../access/session.js";
import { tokenLimit } from "./access.js";
import { config } from "../config.js";
import { pool } from "../db.js";

// Admin-managed user accounts (AGENTS.md section 13) - every route here
// requires the `admin` role, not just a logged-in session. `admin`,
// `system` and `simulator` are protected: `admin` can never be deleted or
// deactivated, `system` and `simulator` (the simulation's own account,
// added 2026-10-11) can never be deleted (but may be deactivated). This
// is the one place that distinction is encoded - the UI mirrors it only
// for display
// (disabling buttons), never re-implements the rule itself.
// `ai-agent` - the AI agent's own account (migrations/1690000000067);
// `orchestrator` - the former `system` (1690000000094); `guest` - the built-in
// guest (1690000000094: never deleted, switched on / off by `active`).
// A deactivation or a new password ends the person's sessions.
const PROTECTED_USERNAMES = new Set(["admin", "orchestrator", "simulator", "ai-agent", "guest"]);
const NON_DEACTIVATABLE_USERNAMES = new Set(["admin"]);
const SERVICE_USERNAMES = new Set(["orchestrator", "simulator", "ai-agent"]);

// Doubles as the allow-list (its keys) and the file extension to save each
// mimetype under.
const AVATAR_EXTENSIONS_BY_MIME_TYPE = new Map([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/webp", "webp"],
]);

interface UserRow {
  id: number;
  username: string;
  password_hash: string;
  display_name: string | null;
  email: string | null;
  roles: string[];
  avatar_path: string | null;
  active: boolean;
  ai_daily_tokens: number | null;
  created_at: string;
  updated_at: string;
}

function publicUser(user: UserRow) {
  const { password_hash: _passwordHash, ...rest } = user;
  return {
    ...rest,
    deletable: !PROTECTED_USERNAMES.has(user.username),
    deactivatable: !NON_DEACTIVATABLE_USERNAMES.has(user.username),
    // an internal service's account (the role `system`) or the guest - no password, no sign-in
    service: SERVICE_USERNAMES.has(user.username),
    guest: user.username === "guest",
  };
}

async function findUser(id: string): Promise<UserRow | undefined> {
  const result = await pool.query<UserRow>("SELECT * FROM users WHERE id = $1", [id]);
  return result.rows[0];
}

// an email: empty - none; else something@domain (the RFC's 254 characters at most)
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_MAX = 254;
/** A form's email -> null (none), the address, or undefined (not valid). */
function emailOf(input: unknown): string | null | undefined {
  if (input === null || input === undefined) return null;
  if (typeof input !== "string") return undefined;
  const t = input.trim();
  if (!t) return null;
  return t.length <= EMAIL_MAX && EMAIL.test(t) ? t : undefined;
}
const isUniqueViolation = (err: unknown, index?: string) =>
  err instanceof Error && "code" in err && (err as { code: string }).code === "23505" &&
  (!index || (err as { constraint?: string }).constraint === index);

/** Saves an uploaded avatar for the user (the admin's form and the person's own profile). */
async function saveAvatar(user: UserRow, request: FastifyRequest, reply: FastifyReply) {
  const file: MultipartFile | undefined = await request.file({
    limits: { fileSize: config.uploads.avatarMaxSizeBytes },
  });
  if (!file) return reply.code(400).send({ error: "avatar file is required" });
  const extension = AVATAR_EXTENSIONS_BY_MIME_TYPE.get(file.mimetype);
  if (!extension) {
    return reply.code(400).send({ error: "avatar must be a PNG, JPEG, or WebP image" });
  }

  const buffer = await file.toBuffer();
  // @fastify/multipart truncates rather than throwing when a file exceeds
  // the configured limit - `.truncated` is how that's surfaced.
  if (file.file.truncated) {
    return reply.code(413).send({ error: "avatar exceeds the maximum allowed size" });
  }

  const filename = `${user.id}-${randomUUID()}.${extension}`;
  await writeFile(path.join(config.uploads.avatarsDir, filename), buffer);

  const previousAvatarPath = user.avatar_path;
  await pool.query("UPDATE users SET avatar_path = $1, updated_at = now() WHERE id = $2", [filename, user.id]);
  if (previousAvatarPath) {
    await unlink(path.join(config.uploads.avatarsDir, previousAvatarPath)).catch(() => {});
  }
  return { avatarUrl: `/uploads/avatars/${filename}`, avatar_path: filename };
}

/** Removes the user's avatar (the file too). */
async function removeAvatar(user: UserRow): Promise<void> {
  if (!user.avatar_path) return;
  await pool.query("UPDATE users SET avatar_path = NULL, updated_at = now() WHERE id = $1", [user.id]);
  await unlink(path.join(config.uploads.avatarsDir, user.avatar_path)).catch(() => {});
}

// Minimal, non-admin-gated user listing (AGENTS_TO_DO.md, 2026-08-01) -
// just enough to populate an "actor" filter/display (id, display name,
// avatar, roles - an avatar's tooltip names the role, 2026-10-11),
// unlike GET /users below (admin-only, full account management including
// roles/active/password). A separate exported function, not
// registered inside userRoutes' plugin instance, so it sits outside that
// instance's `requireAdmin` preHandler hook - any logged-in user needs
// this today (the Logs > Commands actor filter), not just admins. Same
// unauthenticated-read precedent as routes/processes.ts's `hidden_by_user`
// join (log_messages), which already exposes these same fields.
export async function userDirectoryRoutes(app: FastifyInstance): Promise<void> {
  app.get("/users/directory", async () => {
    const result = await pool.query<Pick<UserRow, "id" | "username" | "display_name" | "avatar_path" | "roles">>(
      "SELECT id, username, display_name, avatar_path, roles FROM users WHERE active = true ORDER BY username",
    );
    return result.rows;
  });
}

export async function userRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", requireAdmin);

  app.get("/users", async () => {
    const result = await pool.query<UserRow>("SELECT * FROM users ORDER BY username");
    // each person's roles (the Users list's Access column - 2026-10-27)
    const members = (await pool.query<{ user_id: number; role_key: string }>("SELECT user_id, role_key FROM role_members ORDER BY role_key")).rows;
    return result.rows.map((u) => ({ ...publicUser(u), roleKeys: members.filter((m) => m.user_id === u.id).map((m) => m.role_key) }));
  });

  app.get<{ Params: { id: string } }>("/users/:id", async (request, reply) => {
    const user = await findUser(request.params.id);
    if (!user) return reply.code(404).send({ error: "user not found" });
    return publicUser(user);
  });

  app.post<{
    Body: { username: string; password: string; display_name?: string; email?: string | null; active?: boolean; ai_daily_tokens?: number | null };
  }>("/users", async (request, reply) => {
    const username = request.body.username?.trim().toLowerCase();
    const { password } = request.body;
    if (!username || !password) {
      return reply.code(400).send({ error: "username and password are required" });
    }

    const aiTokens = tokenLimit(request.body.ai_daily_tokens ?? null);
    if (aiTokens === undefined) return reply.code(400).send({ error: "ai_daily_tokens: empty (unlimited), 0 (off) or a whole number" });

    const email = emailOf(request.body.email);
    if (email === undefined) return reply.code(400).send({ error: "email: an address like name@example.com" });

    const passwordHash = await hashPassword(password);
    try {
      const result = await pool.query<UserRow>(
        `INSERT INTO users (username, password_hash, display_name, email, roles, active, ai_daily_tokens)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [username, passwordHash, request.body.display_name ?? null, email, [], request.body.active ?? true, aiTokens],
      );
      // the roles - PUT /access/users/:id/roles (none yet - signs in, sees nothing)
      return reply.code(201).send(publicUser(result.rows[0]));
    } catch (err) {
      if (isUniqueViolation(err, "users_email_unique")) return reply.code(409).send({ error: "this email belongs to another account" });
      if (isUniqueViolation(err)) return reply.code(409).send({ error: "username already exists" });
      throw err;
    }
  });

  app.patch<{
    Params: { id: string };
    Body: { password?: string; display_name?: string; email?: string | null; active?: boolean; ai_daily_tokens?: number | null };
  }>("/users/:id", async (request, reply) => {
    const user = await findUser(request.params.id);
    if (!user) return reply.code(404).send({ error: "user not found" });

    if (request.body.active === false && NON_DEACTIVATABLE_USERNAMES.has(user.username)) {
      return reply.code(400).send({ error: `user '${user.username}' cannot be deactivated` });
    }

    const passwordHash = request.body.password ? await hashPassword(request.body.password) : user.password_hash;
    const displayName = request.body.display_name ?? user.display_name;
    const active = request.body.active ?? user.active;
    const aiTokens = request.body.ai_daily_tokens === undefined ? user.ai_daily_tokens : tokenLimit(request.body.ai_daily_tokens);
    if (aiTokens === undefined) return reply.code(400).send({ error: "ai_daily_tokens: empty (unlimited), 0 (off) or a whole number" });

    const email = request.body.email === undefined ? user.email : emailOf(request.body.email);
    if (email === undefined) return reply.code(400).send({ error: "email: an address like name@example.com" });

    let result;
    try {
      result = await pool.query<UserRow>(
        `UPDATE users SET password_hash = $1, display_name = $2, active = $3, ai_daily_tokens = $4, email = $5, updated_at = now()
         WHERE id = $6 RETURNING *`,
        [passwordHash, displayName, active, aiTokens, email, user.id],
      );
    } catch (err) {
      if (isUniqueViolation(err, "users_email_unique")) return reply.code(409).send({ error: "this email belongs to another account" });
      throw err;
    }
    invalidatePrincipals();
    // deactivated, or a new password - their sessions are over (not the one changing their own password)
    if (!active || request.body.password) await revokeSessionsOf(user.id, active ? (request.session?.sid ?? null) : null);
    return publicUser(result.rows[0]);
  });

  app.delete<{ Params: { id: string } }>("/users/:id", async (request, reply) => {
    const user = await findUser(request.params.id);
    if (!user) return reply.code(404).send({ error: "user not found" });
    if (PROTECTED_USERNAMES.has(user.username)) {
      return reply.code(400).send({ error: `user '${user.username}' cannot be deleted` });
    }

    await pool.query("DELETE FROM users WHERE id = $1", [user.id]);
    invalidatePrincipals();
    if (user.avatar_path) {
      await unlink(path.join(config.uploads.avatarsDir, user.avatar_path)).catch(() => {
        // Best-effort - a missing file on disk shouldn't block the delete.
      });
    }
    return reply.code(204).send();
  });

  app.post<{ Params: { id: string } }>("/users/:id/avatar", async (request, reply) => {
    const user = await findUser(request.params.id);
    if (!user) return reply.code(404).send({ error: "user not found" });
    return saveAvatar(user, request, reply);
  });

  app.delete<{ Params: { id: string } }>("/users/:id/avatar", async (request, reply) => {
    const user = await findUser(request.params.id);
    if (!user) return reply.code(404).send({ error: "user not found" });
    await removeAvatar(user);
    return reply.code(204).send();
  });
}

/**
 * The person's own profile (2026-10-28 - the user menu's "Profile"): the name, the email, the avatar and a
 * new password (with the current one - a tab left open must not let another change it; their other
 * sessions end). Any signed-in person, not the guest and not the services' accounts.
 */
export async function profileRoutes(app: FastifyInstance): Promise<void> {
  const own = async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.principal?.guest || request.session?.guest) {
      reply.code(403).send({ error: "sign in to change a profile" });
      return null;
    }
    const user = await findUser(String(request.user.sub));
    if (!user) {
      reply.code(404).send({ error: "user not found" });
      return null;
    }
    if (SERVICE_USERNAMES.has(user.username)) {
      reply.code(403).send({ error: "a service account has no profile" });
      return null;
    }
    return user;
  };
  const profileOf = (u: UserRow) => ({
    id: u.id,
    username: u.username,
    display_name: u.display_name,
    email: u.email,
    avatar_path: u.avatar_path,
  });

  app.get("/profile", async (request, reply) => {
    const user = await own(request, reply);
    return user ? profileOf(user) : reply;
  });

  app.patch<{ Body: { display_name?: string | null; email?: string | null; password?: string; current_password?: string } }>(
    "/profile",
    async (request, reply) => {
      const user = await own(request, reply);
      if (!user) return reply;
      const body = request.body ?? {};
      const displayName = body.display_name === undefined ? user.display_name : String(body.display_name ?? "").trim() || null;
      const email = body.email === undefined ? user.email : emailOf(body.email);
      if (email === undefined) return reply.code(400).send({ error: "email: an address like name@example.com" });
      let passwordHash = user.password_hash;
      if (body.password) {
        if (!body.current_password || !(await verifyPassword(body.current_password, user.password_hash)))
          return reply.code(400).send({ error: "the current password is not right" });
        passwordHash = await hashPassword(body.password);
      }
      try {
        const result = await pool.query<UserRow>(
          "UPDATE users SET display_name = $1, email = $2, password_hash = $3, updated_at = now() WHERE id = $4 RETURNING *",
          [displayName, email, passwordHash, user.id],
        );
        invalidatePrincipals();
        // a new password - the person's other sessions are over (this one stays)
        if (body.password) await revokeSessionsOf(user.id, request.session?.sid ?? null);
        return profileOf(result.rows[0]);
      } catch (err) {
        if (isUniqueViolation(err, "users_email_unique")) return reply.code(409).send({ error: "this email belongs to another account" });
        throw err;
      }
    },
  );

  app.post("/profile/avatar", async (request, reply) => {
    const user = await own(request, reply);
    return user ? saveAvatar(user, request, reply) : reply;
  });

  app.delete("/profile/avatar", async (request, reply) => {
    const user = await own(request, reply);
    if (!user) return reply;
    await removeAvatar(user);
    return reply.code(204).send();
  });
}
