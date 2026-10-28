import type { MigrationBuilder } from "node-pg-migrate";

// What a conversation is about (the AI Assistant, 2026-10-24 - the AI button on a node, a device, a
// process, a message, a Dashboard card): { type, id, processId, label }; null - the object as a whole.
export const up = (pgm: MigrationBuilder): void => {
  pgm.addColumns("ai_conversations", { subject: { type: "jsonb" } });
};

export const down = (pgm: MigrationBuilder): void => {
  pgm.dropColumns("ai_conversations", ["subject"]);
};
