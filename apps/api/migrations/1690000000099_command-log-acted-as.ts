import type { MigrationBuilder } from "node-pg-migrate";

// The roles a person acted in (iot AGENTS_TO_DO.md 2026-10-28 - "Act as"): the command log's "As" - their
// names at the time (a role renamed or removed later doesn't change the record); NULL - a service's, or
// written before.
export const up = (pgm: MigrationBuilder): void => {
  pgm.addColumns("log_command", { acted_as: { type: "text" } });
};

export const down = (pgm: MigrationBuilder): void => {
  pgm.dropColumns("log_command", ["acted_as"]);
};
