import type { MigrationBuilder } from "node-pg-migrate";

// A person's email (iot AGENTS_TO_DO.md 2026-10-28 - the profile form): optional, one account per address
// (case-insensitive).
export const up = (pgm: MigrationBuilder): void => {
  pgm.addColumns("users", { email: { type: "text" } });
  pgm.sql("CREATE UNIQUE INDEX users_email_unique ON users (lower(email)) WHERE email IS NOT NULL");
};

export const down = (pgm: MigrationBuilder): void => {
  pgm.sql("DROP INDEX IF EXISTS users_email_unique");
  pgm.dropColumns("users", ["email"]);
};
