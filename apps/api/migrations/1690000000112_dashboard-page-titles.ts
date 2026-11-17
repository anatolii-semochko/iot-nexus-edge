import type { MigrationBuilder } from "node-pg-migrate";

// A Dashboard page's title (iot AGENTS_TO_DO.md 2026-11-17, "гібрид"): every opened card shows its title
// over its page unless `show_title` is off; `titles` - the title in other languages ({ "uk": "...",
// "de": "..." }), the card's own `title` where a language has none. The top level's - in the
// Dashboard's settings (system_settings 'dashboard': showTitle, titles).
export const up = (pgm: MigrationBuilder): void => {
  pgm.addColumns("dashboard_cards", {
    show_title: { type: "boolean", notNull: true, default: true },
    titles: { type: "jsonb", notNull: true, default: "{}" },
  });
};

export const down = (pgm: MigrationBuilder): void => {
  pgm.dropColumns("dashboard_cards", ["show_title", "titles"]);
};
