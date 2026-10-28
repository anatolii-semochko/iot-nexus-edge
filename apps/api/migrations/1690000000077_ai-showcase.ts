import type { MigrationBuilder } from "node-pg-migrate";

// The public demo's showcase conversations (B2): a conversation an
// administrator marked "Show in demo" - every demo visitor sees it (read
// only - they continue their own); the nightly log retention keeps it.
export const up = (pgm: MigrationBuilder): void => {
  pgm.addColumn("ai_conversations", { showcase: { type: "boolean", notNull: true, default: false } });
};

export const down = (pgm: MigrationBuilder): void => {
  pgm.dropColumn("ai_conversations", "showcase");
};
