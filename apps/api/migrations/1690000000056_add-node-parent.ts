import type { MigrationBuilder } from "node-pg-migrate";

// Node -> parent Node (AGENTS_TO_DO.md, 2026-10-09). A fleet is built
// from modules: one base node (e.g. an aquarium's "Aquarium Control")
// plus optional nodes attached to it (CO2, dosing, sensors, a light),
// several such groups on one bus under one orchestrator. Which base node
// an optional node belongs to is a relation by id - never inferred from
// names, node types or "the first node of kind X", which break as soon
// as a second base node exists.
//
// `nodes.parent_id` - nullable (autonomous nodes have no parent),
// ON DELETE SET NULL (deleting a base node detaches, never cascades),
// no self-reference; deeper cycles are rejected by PATCH
// /nodes/:id/parent. `library_items.parent_types` - node.yaml's own
// `parents:` list (which node types this type may attach to), read by
// the same Library sync that already reads `supports:`.
export const up = (pgm: MigrationBuilder): void => {
  pgm.addColumn("nodes", {
    parent_id: { type: "integer", references: "nodes", onDelete: "SET NULL" },
  });
  pgm.addConstraint("nodes", "nodes_parent_not_self", { check: "parent_id IS NULL OR parent_id <> id" });
  pgm.createIndex("nodes", "parent_id");
  pgm.addColumn("library_items", {
    parent_types: { type: "jsonb" },
  });
};

export const down = (pgm: MigrationBuilder): void => {
  pgm.dropColumn("library_items", "parent_types");
  pgm.dropConstraint("nodes", "nodes_parent_not_self");
  pgm.dropColumn("nodes", "parent_id");
};
