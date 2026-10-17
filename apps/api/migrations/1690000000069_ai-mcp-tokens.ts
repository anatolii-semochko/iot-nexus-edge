import type { MigrationBuilder } from "node-pg-migrate";

// The MCP server's access tokens (Nexus Edge AI Assistant, stage 3 -
// nexus-edge-aquarium AGENTS_TO_DO.md 2026-10-17; ai/mcp.ts): an external AI
// client (Claude Code, Claude Desktop, any MCP client) reaches the resource
// gateway at /mcp with `Authorization: Bearer <token>`. A token acts as one
// assistant instance (`instance_key` - its access levels apply). Only its
// sha-256 is stored (the token itself is shown once, when created), plus a
// short prefix to recognise it. No token - the MCP server is closed.
export const up = (pgm: MigrationBuilder): void => {
  pgm.createTable("ai_mcp_tokens", {
    id: "id",
    name: { type: "text", notNull: true },
    token_hash: { type: "text", notNull: true, unique: true },
    token_prefix: { type: "text", notNull: true },
    instance_key: { type: "text", notNull: true, default: "nexus-edge" },
    enabled: { type: "boolean", notNull: true, default: true },
    last_used_at: { type: "timestamptz" },
    created_by: { type: "integer", references: "users", onDelete: "SET NULL" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
};

export const down = (pgm: MigrationBuilder): void => {
  pgm.dropTable("ai_mcp_tokens");
};
