import type { MigrationBuilder } from "node-pg-migrate";

// The Dashboard's three kinds of card and the form's parts (iot AGENTS_TO_DO.md 2026-10-29):
// - `type`: the former "component" card (a block - the component's avatar, opening it on the whole page)
//   is an "avatar"; a "component" now is the component itself, drawn at the level's full width under
//   its blocks. A target project's seed written before this migration that inserts 'component' means an
//   avatar - it converts its own rows after it (nexus-edge-tech demo 036);
// - `frame` (text -> jsonb): the frame's parts, each on or off - {top, middle, bottom, fill}: the picture's
//   block bordered, the line between it and the title, the title's block bordered, the card's background
//   (top and bottom both - one border round the card); null - the type's default, as before;
// - `picture.source`: "none" | "avatar" | "icon" | "file" (was `hidden` / `useImage`); unset - the type's
//   default (a folder - its icon, an avatar - the component's avatar);
// - `user_fit`: the viewer may switch the opened avatar's fit (width / height) - `view` is the default.
const PARTS: Record<string, string> = {
  none: '{"top": false, "middle": false, "bottom": false, "fill": false}',
  border: '{"top": true, "middle": true, "bottom": true, "fill": false}',
  filled: '{"top": true, "middle": true, "bottom": true, "fill": true}',
  caption: '{"top": false, "middle": false, "bottom": true, "fill": false}',
};

export const up = (pgm: MigrationBuilder): void => {
  pgm.dropConstraint("dashboard_cards", "dashboard_cards_type_check");
  pgm.sql("UPDATE dashboard_cards SET type = 'avatar' WHERE type = 'component'");
  pgm.addConstraint("dashboard_cards", "dashboard_cards_type_check", { check: "type IN ('folder', 'avatar', 'component')" });

  pgm.dropConstraint("dashboard_cards", "dashboard_cards_frame_check");
  const cases = Object.entries(PARTS).map(([k, v]) => `WHEN '${k}' THEN '${v}'::jsonb`).join(" ");
  pgm.sql(`ALTER TABLE dashboard_cards ALTER COLUMN frame TYPE jsonb USING (CASE frame ${cases} END)`);

  pgm.sql(`UPDATE dashboard_cards SET picture = (picture - 'hidden' - 'useImage') ||
    CASE WHEN (picture->>'hidden')::boolean THEN '{"source": "none"}'::jsonb
         WHEN (picture->>'useImage')::boolean AND picture ? 'icon' THEN '{"source": "file"}'::jsonb
         ELSE '{}'::jsonb END`);

  pgm.addColumns("dashboard_cards", { user_fit: { type: "boolean", notNull: true, default: false } });
};

export const down = (pgm: MigrationBuilder): void => {
  pgm.dropColumns("dashboard_cards", ["user_fit"]);
  pgm.sql(`UPDATE dashboard_cards SET picture = (picture - 'source') ||
    CASE picture->>'source' WHEN 'none' THEN '{"hidden": true}'::jsonb WHEN 'file' THEN '{"useImage": true}'::jsonb ELSE '{}'::jsonb END`);
  pgm.sql(`ALTER TABLE dashboard_cards ALTER COLUMN frame TYPE text USING (CASE
    WHEN frame IS NULL THEN NULL
    WHEN (frame->>'fill')::boolean THEN 'filled'
    WHEN (frame->>'top')::boolean THEN 'border'
    WHEN (frame->>'bottom')::boolean THEN 'caption'
    ELSE 'none' END)`);
  pgm.addConstraint("dashboard_cards", "dashboard_cards_frame_check", { check: "frame IS NULL OR frame IN ('none', 'border', 'filled', 'caption')" });
  pgm.dropConstraint("dashboard_cards", "dashboard_cards_type_check");
  pgm.sql("DELETE FROM dashboard_cards WHERE type = 'component'");
  pgm.sql("UPDATE dashboard_cards SET type = 'component' WHERE type = 'avatar'");
  pgm.addConstraint("dashboard_cards", "dashboard_cards_type_check", { check: "type IN ('folder', 'component')" });
};
