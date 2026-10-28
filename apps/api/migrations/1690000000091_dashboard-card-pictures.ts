import type { MigrationBuilder } from "node-pg-migrate";

// A Dashboard card's own pictures (iot AGENTS_TO_DO.md 2026-10-25): an uploaded image instead of the
// icon set / the component's avatar (`picture.useImage`, its size `imageScalePct`) and a background
// under it (`backgroundOpacityPct`) - the images themselves in the database (small, backed up with it,
// no file volume to add): `dashboard_card_images` - one per card and slot (icon / background).
export const up = (pgm: MigrationBuilder): void => {
  pgm.addColumns("dashboard_cards", { picture: { type: "jsonb", notNull: true, default: "{}" } });
  pgm.createTable("dashboard_card_images", {
    card_id: { type: "integer", notNull: true, references: "dashboard_cards", onDelete: "CASCADE" },
    slot: { type: "text", notNull: true, check: "slot IN ('icon', 'background')" },
    mime: { type: "text", notNull: true },
    data: { type: "bytea", notNull: true },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.addConstraint("dashboard_card_images", "dashboard_card_images_pkey", { primaryKey: ["card_id", "slot"] });
};

export const down = (pgm: MigrationBuilder): void => {
  pgm.dropTable("dashboard_card_images");
  pgm.dropColumns("dashboard_cards", ["picture"]);
};
