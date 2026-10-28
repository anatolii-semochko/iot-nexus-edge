import { randomBytes } from "node:crypto";

import bcrypt from "bcryptjs";
import type { MigrationBuilder } from "node-pg-migrate";

// Access control (B1 - iot AGENTS_TO_DO.md 2026-10-17; apps/api/src/access/):
// - `roles` - a set of permission keys from the catalog (access/catalog.ts).
//   The system roles (admin / operator / viewer / demo) keep `permissions`
//   NULL = their default set from the code - so a new permission the code
//   adds reaches them; editing one stores the list, "Defaults" sets NULL
//   again. Own roles - `system` false, a list always.
// - `user_groups` + `user_group_members` - groups of users (grants, the
//   Dashboard cards' `access_group_ids`).
// - `role_grants` - a user or a group gets a role on everything (`scope`
//   NULL) or on some DNP instances (`scope` - their unit keys: "node:<root
//   node id>" - an installation's node tree, "process:<id>" - a process
//   with no node; dnpInstances.ts).
// - the `demo` account - the demo mode's visitor (DEMO_MODE; nobody signs in
//   with a password - a random one, never stored).
// - the grants from `users.roles`: 'admin' -> admin; any other person ->
//   operator (what a signed-in non-admin could do so far); the service
//   accounts (system, simulator, ai-agent) - none (they act inside).
const BCRYPT_COST = 10;
const SERVICE_ACCOUNTS = ["system", "simulator", "ai-agent", "demo"];

export const up = async (pgm: MigrationBuilder): Promise<void> => {
  pgm.createTable("roles", {
    key: { type: "text", primaryKey: true },
    name: { type: "text", notNull: true },
    system: { type: "boolean", notNull: true, default: false },
    permissions: { type: "text[]" },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.sql(`INSERT INTO roles (key, name, system) VALUES
    ('admin', 'Administrator', true), ('operator', 'Operator', true), ('viewer', 'Viewer', true), ('demo', 'Demo visitor', true)`);

  pgm.createTable("user_groups", {
    id: "id",
    name: { type: "text", notNull: true, unique: true },
    description: { type: "text" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.createTable(
    "user_group_members",
    {
      group_id: { type: "integer", notNull: true, references: "user_groups", onDelete: "CASCADE" },
      user_id: { type: "integer", notNull: true, references: "users", onDelete: "CASCADE" },
    },
    { constraints: { primaryKey: ["group_id", "user_id"] } },
  );

  pgm.createTable("role_grants", {
    id: "id",
    user_id: { type: "integer", references: "users", onDelete: "CASCADE" },
    group_id: { type: "integer", references: "user_groups", onDelete: "CASCADE" },
    role_key: { type: "text", notNull: true, references: "roles", onDelete: "CASCADE", onUpdate: "CASCADE" },
    scope: { type: "text[]" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.addConstraint("role_grants", "role_grants_one_subject", "CHECK ((user_id IS NULL) <> (group_id IS NULL))");
  pgm.createIndex("role_grants", "user_id");
  pgm.createIndex("role_grants", "group_id");

  const hash = await bcrypt.hash(randomBytes(32).toString("base64"), BCRYPT_COST);
  pgm.sql(
    `INSERT INTO users (username, password_hash, display_name, roles, active)
     VALUES ('demo', '${hash}', 'Demo visitor', '{}', true)
     ON CONFLICT (username) DO NOTHING`,
  );
  const services = SERVICE_ACCOUNTS.map((u) => `'${u}'`).join(", ");
  pgm.sql(`INSERT INTO role_grants (user_id, role_key) SELECT id, 'admin' FROM users WHERE 'admin' = ANY(roles)`);
  pgm.sql(
    `INSERT INTO role_grants (user_id, role_key) SELECT id, 'operator' FROM users WHERE NOT ('admin' = ANY(roles)) AND username NOT IN (${services})`,
  );
  pgm.sql(`INSERT INTO role_grants (user_id, role_key) SELECT id, 'demo' FROM users WHERE username = 'demo'`);
};

export const down = (pgm: MigrationBuilder): void => {
  pgm.sql("DELETE FROM users WHERE username = 'demo'");
  pgm.dropTable("role_grants");
  pgm.dropTable("user_group_members");
  pgm.dropTable("user_groups");
  pgm.dropTable("roles");
};
