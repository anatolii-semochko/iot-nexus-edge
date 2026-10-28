import type { MigrationBuilder } from "node-pg-migrate";

// A conversation's topic changed on the way (the AI Assistant, 2026-10-24 - the user picks another
// object or work type mid-conversation): a "topic" row marks where, its content the new topic's
// words; the model gets it as a note before the next question.
export const up = (pgm: MigrationBuilder): void => {
  pgm.dropConstraint("ai_messages", "ai_messages_role_check");
  pgm.addConstraint("ai_messages", "ai_messages_role_check", { check: "role IN ('user', 'assistant', 'tool', 'topic')" });
};

export const down = (pgm: MigrationBuilder): void => {
  pgm.sql("DELETE FROM ai_messages WHERE role = 'topic'");
  pgm.dropConstraint("ai_messages", "ai_messages_role_check");
  pgm.addConstraint("ai_messages", "ai_messages_role_check", { check: "role IN ('user', 'assistant', 'tool')" });
};
