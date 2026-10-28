import type { MigrationBuilder } from "node-pg-migrate";

// The group a person last acted in (iot AGENTS_TO_DO.md 2026-10-26, G1): "group:<id>" or "personal" (their
// own grants) - offered again at the next sign-in; none / gone - the one with the most rights.
export const up = (pgm: MigrationBuilder): void => {
  pgm.addColumns("users", { last_context: { type: "text" } });
};

export const down = (pgm: MigrationBuilder): void => {
  pgm.dropColumns("users", ["last_context"]);
};
