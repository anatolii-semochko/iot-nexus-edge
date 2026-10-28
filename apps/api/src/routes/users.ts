import { randomUUID } from "node:crypto";
import { unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import type { MultipartFile } from "@fastify/multipart";
import type { FastifyInstance } from "fastify";

import { hashPassword, requireAdmin } from "../auth.js";
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
    Body: { username: string; password: string; display_name?: string; active?: boolean; ai_daily_tokens?: number | null };
  }>("/users", async (request, reply) => {
    const username = request.body.username?.trim().toLowerCase();
    const { password } = request.body;
    if (!username || !password) {
      return reply.code(400).send({ error: "username and password are required" });
    }

    const aiTokens = tokenLimit(request.body.ai_daily_tokens ?? null);
    if (aiTokens === undefined) return reply.code(400).send({ error: "ai_daily_tokens: empty (unlimited), 0 (off) or a whole number" });

    const passwordHash = await hashPassword(password);
    try {
      const result = await pool.query<UserRow>(
        `INSERT INTO users (username, password_hash, display_name, roles, active, ai_daily_tokens)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [username, passwordHash, request.body.display_name ?? null, [], request.body.active ?? true, aiTokens],
      );
      // the roles - PUT /access/users/:id/roles (none yet - signs in, sees nothing)
      return reply.code(201).send(publicUser(result.rows[0]));
    } catch (err) {
      if (err instanceof Error && "code" in err && (err as { code: string }).code === "23505") {
        return reply.code(409).send({ error: "username already exists" });
      }
      throw err;
    }
  });

  app.patch<{
    Params: { id: string };
    Body: { password?: string; display_name?: string; active?: boolean; ai_daily_tokens?: number | null };
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

    const result = await pool.query<UserRow>(
      `UPDATE users SET password_hash = $1, display_name = $2, active = $3, ai_daily_tokens = $4, updated_at = now()
       WHERE id = $5 RETURNING *`,
      [passwordHash, displayName, active, aiTokens, user.id],
    );
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

    return { avatarUrl: `/uploads/avatars/${filename}` };
  });

  app.delete<{ Params: { id: string } }>("/users/:id/avatar", async (request, reply) => {
    const user = await findUser(request.params.id);
    if (!user) return reply.code(404).send({ error: "user not found" });
    if (!user.avatar_path) return reply.code(204).send();

    await pool.query("UPDATE users SET avatar_path = NULL, updated_at = now() WHERE id = $1", [user.id]);
    await unlink(path.join(config.uploads.avatarsDir, user.avatar_path)).catch(() => {});
    return reply.code(204).send();
  });
}
