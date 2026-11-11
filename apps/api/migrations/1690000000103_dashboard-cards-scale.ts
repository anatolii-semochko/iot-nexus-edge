import type { MigrationBuilder } from "node-pg-migrate";

// A folder's cards' scale (iot AGENTS_TO_DO.md 2026-11-01): the cards inside the folder drawn this many
// times larger - their width and their picture's block (1 - as before, 1.5 - half as large again). Only a
// folder's matters; 0.5 - 2.
export const up = (pgm: MigrationBuilder): void => {
  pgm.addColumn("dashboard_cards", {
    cards_scale: { type: "real", notNull: true, default: 1 },
  });
  pgm.addConstraint("dashboard_cards", "dashboard_cards_cards_scale_range", {
    check: "cards_scale BETWEEN 0.5 AND 2",
  });
};

export const down = (pgm: MigrationBuilder): void => {
  pgm.dropConstraint("dashboard_cards", "dashboard_cards_cards_scale_range");
  pgm.dropColumn("dashboard_cards", "cards_scale");
};
