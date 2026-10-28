import type { MigrationBuilder } from "node-pg-migrate";

// A Dashboard card's frame "caption" (iot AGENTS_TO_DO.md 2026-10-25): the border round the title's block
// only, the picture above to the card's edges (a light border round a dark image showed a pixel's gap).
export const up = (pgm: MigrationBuilder): void => {
  pgm.dropConstraint("dashboard_cards", "dashboard_cards_frame_check");
  pgm.addConstraint("dashboard_cards", "dashboard_cards_frame_check", { check: "frame IS NULL OR frame IN ('none', 'border', 'filled', 'caption')" });
};

export const down = (pgm: MigrationBuilder): void => {
  pgm.sql("UPDATE dashboard_cards SET frame = 'border' WHERE frame = 'caption'");
  pgm.dropConstraint("dashboard_cards", "dashboard_cards_frame_check");
  pgm.addConstraint("dashboard_cards", "dashboard_cards_frame_check", { check: "frame IS NULL OR frame IN ('none', 'border', 'filled')" });
};
