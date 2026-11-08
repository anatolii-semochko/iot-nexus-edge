import type { MigrationBuilder } from "node-pg-migrate";

// A message in the interface's language (iot AGENTS_TO_DO.md, the long task "WEM translation",
// 2026-11-07): `i18n` - { ns, template, params } - the producer's English template with its
// {{placeholders}} and their values, `ns` - the translations' package (the UI's i18next namespace:
// the package's folder name; "core" - the platform's). The UI translates the template and fills it;
// `text` stays the English as before - the logs, the search, the AI, a message with no template.
export const up = (pgm: MigrationBuilder): void => {
  pgm.addColumn("log_messages", { i18n: { type: "jsonb" } });
};

export const down = (pgm: MigrationBuilder): void => {
  pgm.dropColumn("log_messages", "i18n");
};
