import bcrypt from "bcryptjs";
import type { MigrationBuilder } from "node-pg-migrate";

// The `simulator` account (AGENTS.md sections 13/89, 2026-10-11) - the
// simulation's own user, protected like `system` (never deletable, may be
// deactivated; routes/users.ts PROTECTED_USERNAMES). No role. Its password
// comes from env (SIMULATOR_DEFAULT_PASSWORD, see .env.example) and is
// hashed here, same as the two accounts of ..._seed-default-users.ts. An
// existing `simulator` (created by hand before this migration) is kept
// as it is.
const BCRYPT_COST = 10;

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const up = async (pgm: MigrationBuilder): Promise<void> => {
  const hash = await bcrypt.hash(requiredEnv("SIMULATOR_DEFAULT_PASSWORD"), BCRYPT_COST);
  pgm.sql(
    `INSERT INTO users (username, password_hash, display_name, roles, active)
     VALUES ('simulator', '${hash}', 'Simulator', '{}', true)
     ON CONFLICT (username) DO NOTHING`,
  );
};

// Down leaves the account alone - it may hold records (authors) by now.
export const down = (): void => {};
