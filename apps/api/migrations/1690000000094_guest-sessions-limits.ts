import { randomBytes } from "node:crypto";

import bcrypt from "bcryptjs";
import type { MigrationBuilder } from "node-pg-migrate";

// The guest in the core instead of the demo's own access (iot AGENTS_TO_DO.md 2026-10-27, G2-G3):
// - the `guest` account - one, built in, never deleted (only deactivated); while active, a browser with
//   no session opens the application as the guest (routes/auth.ts). Made from the former demo
//   account (its conversations kept) - INACTIVE, its AI tokens 0 (off): a project switches them on
//   (Users -> Guest, or its own migration). Its role `guest` (the former `demo`) - read only by default.
// - the role `system` - the internal services' (everything; never a person's): the orchestrator (the
//   former `system` account, now `orchestrator`), the simulator, the AI agent.
// - `user_sessions` - the server side of a session (JWT_TOKEN_TTL / JWT_TIME_INVALIDATION -
//   access/session.ts): its last activity; revoked on sign-out / deactivation.
// - the AI's daily tokens of an account and of a role (NULL - unlimited, 0 - the AI off).
// - a group's link name (`?account=<link name>` opens the application in that group).
// - a conversation's guest session (the former demo visitor) and `shared` (the former demo showcase -
//   read only for everyone who may talk to its instance's assistant).
// - the guest's settings (system_settings 'guest'): its conversations private / public, kept N days
//   (null - kept), only the relevant questions kept.
const BCRYPT_COST = 10;

export const up = async (pgm: MigrationBuilder): Promise<void> => {
  pgm.sql(`UPDATE roles SET key = 'guest', name = 'Guest' WHERE key = 'demo' AND NOT EXISTS (SELECT 1 FROM roles WHERE key = 'guest')`);
  pgm.sql(`INSERT INTO roles (key, name, system) VALUES ('guest', 'Guest', true) ON CONFLICT (key) DO NOTHING`);
  pgm.sql(`INSERT INTO roles (key, name, system) VALUES ('system', 'System service', true) ON CONFLICT (key) DO NOTHING`);
  pgm.addColumns("roles", { ai_daily_tokens: { type: "integer" } });
  pgm.addColumns("users", { ai_daily_tokens: { type: "integer" } });

  pgm.sql(
    `UPDATE users SET username = 'orchestrator', display_name = 'Orchestrator'
      WHERE username = 'system' AND NOT EXISTS (SELECT 1 FROM users WHERE username = 'orchestrator')`,
  );
  pgm.sql(
    `INSERT INTO role_grants (user_id, role_key) SELECT u.id, 'system' FROM users u
      WHERE u.username IN ('orchestrator', 'simulator', 'ai-agent')
        AND NOT EXISTS (SELECT 1 FROM role_grants g WHERE g.user_id = u.id AND g.role_key = 'system')`,
  );

  pgm.sql(
    `UPDATE users SET username = 'guest', display_name = 'Guest', active = false, ai_daily_tokens = 0
      WHERE username = 'demo' AND NOT EXISTS (SELECT 1 FROM users WHERE username = 'guest')`,
  );
  // never signed in with a password - a random one, not stored anywhere
  const hash = await bcrypt.hash(randomBytes(32).toString("base64"), BCRYPT_COST);
  pgm.sql(`INSERT INTO users (username, password_hash, display_name, roles, active, ai_daily_tokens) VALUES ('guest', '${hash}', 'Guest', '{}', false, 0) ON CONFLICT (username) DO NOTHING`);
  pgm.sql(
    `INSERT INTO role_grants (user_id, role_key) SELECT id, 'guest' FROM users u
      WHERE username = 'guest' AND NOT EXISTS (SELECT 1 FROM role_grants g WHERE g.user_id = u.id)`,
  );

  pgm.addColumns("user_groups", { link_key: { type: "text", unique: true } });

  pgm.renameColumn("ai_conversations", "visitor", "guest_session");
  pgm.renameColumn("ai_conversations", "showcase", "shared");

  pgm.createTable("user_sessions", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    user_id: { type: "integer", notNull: true, references: "users", onDelete: "CASCADE" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    last_activity_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    revoked_at: { type: "timestamptz" },
  });
  pgm.createIndex("user_sessions", "user_id");

  pgm.sql(
    `INSERT INTO system_settings (key, value) VALUES ('guest', '{"conversations": "private", "retentionDays": null, "relevantOnly": true}'::jsonb)
     ON CONFLICT (key) DO NOTHING`,
  );
};

export const down = (pgm: MigrationBuilder): void => {
  pgm.sql("DELETE FROM system_settings WHERE key = 'guest'");
  pgm.dropTable("user_sessions");
  pgm.renameColumn("ai_conversations", "shared", "showcase");
  pgm.renameColumn("ai_conversations", "guest_session", "visitor");
  pgm.dropColumns("user_groups", ["link_key"]);
  pgm.sql("DELETE FROM role_grants WHERE role_key = 'system'");
  pgm.sql("UPDATE users SET username = 'demo', display_name = 'Demo visitor' WHERE username = 'guest'");
  pgm.sql("UPDATE users SET username = 'system', display_name = 'System' WHERE username = 'orchestrator'");
  pgm.dropColumns("users", ["ai_daily_tokens"]);
  pgm.dropColumns("roles", ["ai_daily_tokens"]);
  pgm.sql("DELETE FROM roles WHERE key = 'system'");
  pgm.sql("UPDATE roles SET key = 'demo', name = 'Demo visitor' WHERE key = 'guest'");
};
