import type { MigrationBuilder } from "node-pg-migrate";

// The interface's language of a person (iot AGENTS_TO_DO.md 2026-10-31, multilingual Nexus Edge): one of
// UI_LANGUAGES, null - the browser's (the guest's choice stays in the browser - its account is shared).
export const up = (pgm: MigrationBuilder): void => {
  pgm.addColumn("users", { language: { type: "varchar(8)" } });
};

export const down = (pgm: MigrationBuilder): void => {
  pgm.dropColumn("users", "language");
};
