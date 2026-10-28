import type { MigrationBuilder } from "node-pg-migrate";

// How a Dashboard card is framed (AGENTS_TO_DO.md 2026-10-22): "none" - no
// border, no background, its picture to the block's edges; "border" - a
// border and the divider, no background, the picture padded; "filled" - a
// border, the divider and the card's background. Null - the default by its
// type (a folder - filled, a component - none; the rule before 2026-10-22).
export const up = (pgm: MigrationBuilder): void => {
  pgm.addColumns("dashboard_cards", { frame: { type: "text" } });
  pgm.addConstraint("dashboard_cards", "dashboard_cards_frame_check", { check: "frame IS NULL OR frame IN ('none', 'border', 'filled')" });
};

export const down = (pgm: MigrationBuilder): void => {
  pgm.dropConstraint("dashboard_cards", "dashboard_cards_frame_check");
  pgm.dropColumns("dashboard_cards", ["frame"]);
};
