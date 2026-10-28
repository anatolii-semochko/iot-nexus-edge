import type { MigrationBuilder } from "node-pg-migrate";

// A Dashboard component card's own parameters (AGENTS_TO_DO.md 2026-10-21,
// C6): one component shows a part of its process - a heating's room, an
// energy field's sub-meter (`{ nodeId }`); the component declares them
// (dashboardRegistry `params`), the card keeps their values.
export const up = (pgm: MigrationBuilder): void => {
  pgm.addColumns("dashboard_cards", { params: { type: "jsonb", notNull: true, default: "{}" } });
};

export const down = (pgm: MigrationBuilder): void => {
  pgm.dropColumns("dashboard_cards", ["params"]);
};
