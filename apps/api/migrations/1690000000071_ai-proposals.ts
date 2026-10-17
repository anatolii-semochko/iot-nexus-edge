import type { MigrationBuilder } from "node-pg-migrate";

// The AI Assistant's proposals (Nexus Edge AI Assistant, stage 6 - nexus-
// edge-aquarium AGENTS_TO_DO.md 2026-10-17; ai/proposals.ts): every change
// an agent asks for - a process's config, a command / ON / OFF, a new DNP
// instance - is a row here, whatever its access level:
// - Auto - applied at once as the `ai-agent` user (status applied / failed);
// - Confirm - `pending` until a person accepts (applied as that person) or
//   rejects it - the messenger's card, Logs -> AI Proposals.
// `access` - the level that governs it (config / control / install);
// `operation` - what it does (config / command / switch / create-process);
// `payload` - what is applied as it is; `before` - what it replaces (shown
// as the diff; for a config - also the sections' stamps the agent saw, so a
// section someone changed since is refused, not overwritten unseen).
// `via` - who proposed it: the built-in assistant (`conversation_id`) or an
// MCP client (`mcp_token_id` - while the token exists).
export const up = (pgm: MigrationBuilder): void => {
  pgm.createTable("ai_proposals", {
    id: "id",
    conversation_id: { type: "integer", references: "ai_conversations", onDelete: "SET NULL" },
    via: { type: "text", notNull: true, check: "via IN ('assistant', 'mcp')" },
    mcp_token_id: { type: "integer", references: "ai_mcp_tokens", onDelete: "SET NULL" },
    instance_key: { type: "text", notNull: true },
    access: { type: "text", notNull: true, check: "access IN ('config', 'control', 'install')" },
    operation: { type: "text", notNull: true },
    process_id: { type: "integer", references: "processes", onDelete: "SET NULL" },
    summary: { type: "text", notNull: true },
    reason: { type: "text", notNull: true, default: "" },
    payload: { type: "jsonb", notNull: true },
    before: { type: "jsonb" },
    status: { type: "text", notNull: true, default: "pending", check: "status IN ('pending', 'applied', 'rejected', 'failed')" },
    result: { type: "jsonb" },
    error: { type: "text" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    decided_by: { type: "integer", references: "users", onDelete: "SET NULL" },
    decided_at: { type: "timestamptz" },
  });
  pgm.createIndex("ai_proposals", ["conversation_id", "id"]);
  pgm.createIndex("ai_proposals", ["status", "created_at"]);
};

export const down = (pgm: MigrationBuilder): void => {
  pgm.dropTable("ai_proposals");
};
