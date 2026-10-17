import { randomBytes } from "node:crypto";

import bcrypt from "bcryptjs";
import type { MigrationBuilder } from "node-pg-migrate";

// Nexus Edge AI Assistant, stage 1 (nexus-edge-aquarium AGENTS_TO_DO.md
// 2026-10-16/17):
// - `ai-agent` - the AI agent's own account, protected like `system` /
//   `simulator` (routes/users.ts PROTECTED_USERNAMES): the author of what
//   an agent does on its own (an Auto access level); what a person
//   confirms is that person's. Nobody signs in as it - its password is
//   random and never stored anywhere.
// - `ai_connections` - the connections to AI models (Service -> Config ->
//   AI): type (openai / anthropic / openai-compatible - a local model
//   server such as Ollama), endpoint (null - the type's own), model, the
//   API key encrypted with AI_SECRETS_KEY (ai/secrets.ts; never sent to the
//   UI), limits; one is the default (the photo analysis uses it now).
// - the `dnp.migrations.apply` setting is gone: the api applies a
//   project's migrations at every start (they come with a deployment);
//   what an agent proposes goes through its Install access level.
const BCRYPT_COST = 10;

export const up = async (pgm: MigrationBuilder): Promise<void> => {
  const hash = await bcrypt.hash(randomBytes(32).toString("base64"), BCRYPT_COST);
  pgm.sql(
    `INSERT INTO users (username, password_hash, display_name, roles, active)
     VALUES ('ai-agent', '${hash}', 'AI Agent', '{}', true)
     ON CONFLICT (username) DO NOTHING`,
  );

  pgm.createTable("ai_connections", {
    id: "id",
    name: { type: "text", notNull: true, unique: true },
    type: { type: "text", notNull: true, check: "type IN ('openai', 'anthropic', 'openai-compatible')" },
    endpoint: { type: "text" },
    model: { type: "text", notNull: true },
    api_key_enc: { type: "text" },
    is_default: { type: "boolean", notNull: true, default: false },
    enabled: { type: "boolean", notNull: true, default: true },
    // limits (null - none): an answer's tokens; tokens a day (enforced by the agent, stage 3)
    max_output_tokens: { type: "integer", check: "max_output_tokens IS NULL OR max_output_tokens > 0" },
    daily_token_limit: { type: "integer", check: "daily_token_limit IS NULL OR daily_token_limit > 0" },
    updated_by: { type: "integer", references: "users", onDelete: "SET NULL" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  // at most one default
  pgm.sql("CREATE UNIQUE INDEX ai_connections_one_default ON ai_connections (is_default) WHERE is_default");

  pgm.sql("DELETE FROM system_settings WHERE key = 'dnp.migrations.apply'");
};

// Down leaves the account alone - it may be an author by now.
export const down = (pgm: MigrationBuilder): void => {
  pgm.dropTable("ai_connections");
};
