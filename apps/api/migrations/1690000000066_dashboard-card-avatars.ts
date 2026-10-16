import type { MigrationBuilder } from "node-pg-migrate";

// A dashboard card's picture (nexus-edge-aquarium AGENTS_TO_DO.md
// 2026-10-16 - the components' avatars, ui dashboardRegistry.js): `preview`
// is "auto" (the component's first avatar, else a scaled copy), "scaled",
// or an avatar's key (the component's own name for it).
export const up = (pgm: MigrationBuilder): void => {
  pgm.sql("ALTER TABLE dashboard_cards DROP CONSTRAINT IF EXISTS dashboard_cards_preview_check");
  pgm.sql("ALTER TABLE dashboard_cards ADD CONSTRAINT dashboard_cards_preview_check CHECK (preview ~ '^[A-Za-z0-9_.-]{1,64}$')");
};

export const down = (pgm: MigrationBuilder): void => {
  pgm.sql("UPDATE dashboard_cards SET preview = 'auto' WHERE preview NOT IN ('auto', 'scaled')");
  pgm.sql("ALTER TABLE dashboard_cards DROP CONSTRAINT IF EXISTS dashboard_cards_preview_check");
  pgm.sql("ALTER TABLE dashboard_cards ADD CONSTRAINT dashboard_cards_preview_check CHECK (preview IN ('auto', 'scaled'))");
};
