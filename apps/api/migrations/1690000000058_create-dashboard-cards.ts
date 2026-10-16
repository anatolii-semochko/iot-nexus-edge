import type { MigrationBuilder } from "node-pg-migrate";

// Dashboard cards (nexus-edge-aquarium AGENTS_TO_DO.md 2026-10-16) - the
// Dashboard page's own tree, one for the whole system: a folder (its
// children shown as blocks or a list) or a component (a UI component a
// module registered - dashboardRegistry - bound to a named process
// instance, or a system one), ordered by `position` among its siblings.
//
// `component_key` - the registered component's key; `process_id` - the
// process instance it shows (null - a system component; ON DELETE SET
// NULL - a removed process leaves its card, shown as missing); `view` -
// the component opened on the whole screen: `fit-height` (the visible
// height, adapted) or `fit-width` (the visible width, scrolling
// horizontally); `preview` - `auto` (the component's own preview if it
// has one, else a scaled copy) or `scaled`.
//
// `access_group_ids` - RESERVED: who may see the card, by user groups.
// The system has no user groups yet (users carry `roles` only) - the
// column waits for the access-rights package; until then every signed-in
// user sees every card (routes/dashboardCards.ts cardVisibleTo).
export const up = (pgm: MigrationBuilder): void => {
  pgm.createTable("dashboard_cards", {
    id: "id",
    parent_id: {
      type: "integer",
      references: "dashboard_cards",
      onDelete: "CASCADE",
    },
    position: { type: "integer", notNull: true, default: 0 },
    type: {
      type: "text",
      notNull: true,
      check: "type IN ('folder', 'component')",
    },
    title: { type: "text", notNull: true },
    icon: { type: "text" },
    layout: {
      type: "text",
      notNull: true,
      default: "blocks",
      check: "layout IN ('blocks', 'list')",
    },
    component_key: { type: "text" },
    process_id: {
      type: "integer",
      references: "processes",
      onDelete: "SET NULL",
    },
    view: {
      type: "text",
      notNull: true,
      default: "fit-height",
      check: "view IN ('fit-height', 'fit-width')",
    },
    preview: {
      type: "text",
      notNull: true,
      default: "auto",
      check: "preview IN ('auto', 'scaled')",
    },
    access_group_ids: {
      type: "integer[]",
      notNull: true,
      default: pgm.func("'{}'::integer[]"),
    },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()"),
    },
    updated_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()"),
    },
  });
  pgm.addConstraint("dashboard_cards", "dashboard_cards_parent_not_self", {
    check: "parent_id IS NULL OR parent_id <> id",
  });
  pgm.addConstraint("dashboard_cards", "dashboard_cards_component_has_key", {
    check: "type <> 'component' OR component_key IS NOT NULL",
  });
  pgm.createIndex("dashboard_cards", ["parent_id", "position"]);
};

export const down = (pgm: MigrationBuilder): void => {
  pgm.dropTable("dashboard_cards");
};
