import type { MigrationBuilder } from "node-pg-migrate";

// Nexus Edge AI Assistant, stage 4 - the agent (ai/agent.ts; nexus-edge-
// aquarium AGENTS_TO_DO.md 2026-10-17):
// - `ai_conversations` - one conversation: the instance it is about, the work
//   type, the connection, who started it, its title; the system prompt it ran
//   with (when the instance logs - the full payload); totals of tokens.
// - `ai_messages` - its turns in order: the user's text, the assistant's
//   answers (with the tools it called), each tool's result (when the
//   instance logs; else "[not logged]"); the model, tokens, latency.
// - `ai_reports` - what the assistant reported to the developers (an
//   instance with Report on): Logs -> AI Reports.
export const up = (pgm: MigrationBuilder): void => {
  pgm.createTable("ai_conversations", {
    id: "id",
    instance_key: { type: "text", notNull: true },
    process_id: { type: "integer", references: "processes", onDelete: "SET NULL" },
    work_type: { type: "text", notNull: true },
    title: { type: "text", notNull: true },
    connection_id: { type: "integer", references: "ai_connections", onDelete: "SET NULL" },
    connection_name: { type: "text" },
    model: { type: "text" },
    logged: { type: "boolean", notNull: true },
    system_prompt: { type: "text" },
    tokens_in: { type: "integer", notNull: true, default: 0 },
    tokens_out: { type: "integer", notNull: true, default: 0 },
    created_by: { type: "integer", references: "users", onDelete: "SET NULL" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.createIndex("ai_conversations", ["instance_key", "updated_at"]);
  pgm.createTable("ai_messages", {
    id: "id",
    conversation_id: { type: "integer", notNull: true, references: "ai_conversations", onDelete: "CASCADE" },
    role: { type: "text", notNull: true, check: "role IN ('user', 'assistant', 'tool')" },
    content: { type: "text", notNull: true, default: "" },
    tool_calls: { type: "jsonb" },
    tool_call_id: { type: "text" },
    tool_name: { type: "text" },
    is_error: { type: "boolean", notNull: true, default: false },
    model: { type: "text" },
    tokens_in: { type: "integer" },
    tokens_out: { type: "integer" },
    latency_ms: { type: "integer" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.createIndex("ai_messages", ["conversation_id", "id"]);
  // the connection's tokens of a day (its daily limit)
  pgm.createIndex("ai_messages", "created_at");
  pgm.createTable("ai_reports", {
    id: "id",
    conversation_id: { type: "integer", references: "ai_conversations", onDelete: "SET NULL" },
    instance_key: { type: "text", notNull: true },
    title: { type: "text", notNull: true },
    body: { type: "text", notNull: true },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
};

export const down = (pgm: MigrationBuilder): void => {
  pgm.dropTable("ai_reports");
  pgm.dropTable("ai_messages");
  pgm.dropTable("ai_conversations");
};
