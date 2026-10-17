import { config } from "../config.js";
import { pool } from "../db.js";
import { logger } from "../logger.js";
import { createAnthropicClient } from "./anthropicClient.js";
import { createOpenAiClient } from "./openaiClient.js";
import { decryptSecret, encryptSecret, secretsAvailable } from "./secrets.js";
import type { AiClient } from "./vision.js";

// The connections to AI models (migrations/1690000000067, Service -> Config
// -> AI; nexus-edge-aquarium AGENTS_TO_DO.md 2026-10-17, AI Assistant
// stage 1): their rows (the API key encrypted - ai/secrets.ts, never
// returned: `hasKey` only), a client per connection (cached, dropped when
// a connection changes), the default one (the photo analysis now; the
// assistant's instances pick theirs - stage 2). The first connection is
// imported once from the old .env settings (OPENAI_*), if there are none.

export const CONNECTION_TYPES = ["openai", "anthropic", "openai-compatible"] as const;
export type ConnectionType = (typeof CONNECTION_TYPES)[number];

interface ConnectionRow {
  id: number;
  name: string;
  type: ConnectionType;
  endpoint: string | null;
  model: string;
  api_key_enc: string | null;
  is_default: boolean;
  enabled: boolean;
  max_output_tokens: number | null;
  daily_token_limit: number | null;
  updated_by: number | null;
  updated_at: Date;
}

export interface Connection {
  id: number;
  name: string;
  type: ConnectionType;
  endpoint: string | null;
  model: string;
  hasKey: boolean;
  isDefault: boolean;
  enabled: boolean;
  maxOutputTokens: number | null;
  dailyTokenLimit: number | null;
  updatedBy: number | null;
  updatedAt: string;
}

const toConnection = (r: ConnectionRow): Connection => ({
  id: r.id,
  name: r.name,
  type: r.type,
  endpoint: r.endpoint,
  model: r.model,
  hasKey: r.api_key_enc !== null,
  isDefault: r.is_default,
  enabled: r.enabled,
  maxOutputTokens: r.max_output_tokens,
  dailyTokenLimit: r.daily_token_limit,
  updatedBy: r.updated_by,
  updatedAt: r.updated_at.toISOString(),
});

export interface ConnectionInput {
  name?: string;
  type?: ConnectionType;
  endpoint?: string | null;
  model?: string;
  // a new key; undefined - keep the stored one; null - remove it
  apiKey?: string | null;
  isDefault?: boolean;
  enabled?: boolean;
  maxOutputTokens?: number | null;
  dailyTokenLimit?: number | null;
}

/** What is wrong with a connection's fields (null - fine). */
export function connectionProblem(input: ConnectionInput, creating: boolean): string | null {
  if (creating && !input.name?.trim()) return "name is required";
  if (input.name !== undefined && !input.name.trim()) return "name is required";
  if ((creating || input.type !== undefined) && !CONNECTION_TYPES.includes(input.type as ConnectionType))
    return `type must be one of ${CONNECTION_TYPES.join(", ")}`;
  if (creating && !input.model?.trim()) return "model is required";
  if (input.model !== undefined && !input.model.trim()) return "model is required";
  if (input.endpoint && !/^https?:\/\//.test(input.endpoint)) return "endpoint must be an http(s) URL";
  for (const f of ["maxOutputTokens", "dailyTokenLimit"] as const) {
    const v = input[f];
    if (v !== undefined && v !== null && !(Number.isInteger(v) && v > 0)) return `${f} must be a positive integer or empty`;
  }
  if (input.apiKey && !secretsAvailable()) return "AI_SECRETS_KEY is not set in .env - the API key can't be stored";
  return null;
}

const clients = new Map<number, AiClient>();
/** Drops the cached clients (a connection changed). */
export const resetClients = (): void => clients.clear();

function clientOf(row: ConnectionRow): AiClient {
  const cached = clients.get(row.id);
  if (cached) return cached;
  const options = {
    apiKey: row.api_key_enc ? decryptSecret(row.api_key_enc) : null,
    endpoint: row.endpoint,
    timeoutMs: config.ai.requestTimeoutMs,
    maxOutputTokens: row.max_output_tokens ?? config.ai.defaultMaxOutputTokens,
  };
  const info = { id: row.id, name: row.name, type: row.type, model: row.model };
  const client = row.type === "anthropic" ? createAnthropicClient(info, options) : createOpenAiClient(info, options);
  clients.set(row.id, client);
  return client;
}

export async function listConnections(): Promise<Connection[]> {
  return (await pool.query<ConnectionRow>("SELECT * FROM ai_connections ORDER BY is_default DESC, name")).rows.map(toConnection);
}

async function rowOf(id: number): Promise<ConnectionRow | undefined> {
  return (await pool.query<ConnectionRow>("SELECT * FROM ai_connections WHERE id = $1", [id])).rows[0];
}

/** A connection's client (null - no such enabled connection). */
export async function clientFor(id: number): Promise<AiClient | null> {
  const row = await rowOf(id);
  return row && row.enabled ? clientOf(row) : null;
}

/** The default connection's client (null - none set up / disabled). */
export async function defaultClient(): Promise<AiClient | null> {
  const row = (await pool.query<ConnectionRow>("SELECT * FROM ai_connections WHERE is_default AND enabled")).rows[0];
  return row ? clientOf(row) : null;
}

export async function saveConnection(id: number | null, input: ConnectionInput, userId: number): Promise<Connection> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // one default: setting it clears the others first
    if (input.isDefault) await client.query("UPDATE ai_connections SET is_default = false WHERE is_default AND id IS DISTINCT FROM $1", [id]);
    const key = input.apiKey === undefined ? undefined : input.apiKey === null || input.apiKey === "" ? null : encryptSecret(input.apiKey);
    let row: ConnectionRow;
    if (id === null) {
      row = (
        await client.query<ConnectionRow>(
          `INSERT INTO ai_connections (name, type, endpoint, model, api_key_enc, is_default, enabled, max_output_tokens, daily_token_limit, updated_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
          [
            input.name!.trim(),
            input.type,
            input.endpoint || null,
            input.model!.trim(),
            key ?? null,
            input.isDefault ?? false,
            input.enabled ?? true,
            input.maxOutputTokens ?? null,
            input.dailyTokenLimit ?? null,
            userId,
          ],
        )
      ).rows[0];
    } else {
      const current = (await client.query<ConnectionRow>("SELECT * FROM ai_connections WHERE id = $1 FOR UPDATE", [id])).rows[0];
      if (!current) throw Object.assign(new Error("connection not found"), { statusCode: 404 });
      row = (
        await client.query<ConnectionRow>(
          `UPDATE ai_connections SET name = $2, type = $3, endpoint = $4, model = $5, api_key_enc = $6, is_default = $7, enabled = $8,
             max_output_tokens = $9, daily_token_limit = $10, updated_by = $11, updated_at = now() WHERE id = $1 RETURNING *`,
          [
            id,
            input.name?.trim() ?? current.name,
            input.type ?? current.type,
            input.endpoint !== undefined ? input.endpoint || null : current.endpoint,
            input.model?.trim() ?? current.model,
            key === undefined ? current.api_key_enc : key,
            input.isDefault ?? current.is_default,
            input.enabled ?? current.enabled,
            input.maxOutputTokens !== undefined ? input.maxOutputTokens : current.max_output_tokens,
            input.dailyTokenLimit !== undefined ? input.dailyTokenLimit : current.daily_token_limit,
            userId,
          ],
        )
      ).rows[0];
    }
    await client.query("COMMIT");
    resetClients();
    return toConnection(row);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function deleteConnection(id: number): Promise<boolean> {
  const result = await pool.query("DELETE FROM ai_connections WHERE id = $1", [id]);
  resetClients();
  return (result.rowCount ?? 0) > 0;
}

/**
 * The first connection from the old .env settings (OPENAI_API_KEY /
 * OPENAI_MODEL), once: only while there is no connection at all and the
 * master key is set. Logged; OPENAI_* may be removed from .env afterwards.
 */
export async function importEnvConnection(): Promise<void> {
  if (!config.ai.openaiApiKey || config.ai.provider !== "openai") return;
  if (!secretsAvailable()) {
    logger.warn("OPENAI_API_KEY is set but AI_SECRETS_KEY isn't - the AI connection can't be imported (Service -> Config -> AI)");
    return;
  }
  const { rows } = await pool.query<{ n: string }>("SELECT count(*) AS n FROM ai_connections");
  if (Number(rows[0].n) > 0) return;
  await pool.query(
    `INSERT INTO ai_connections (name, type, model, api_key_enc, is_default) VALUES ('OpenAI', 'openai', $1, $2, true)
     ON CONFLICT (name) DO NOTHING`,
    [config.ai.openaiModel, encryptSecret(config.ai.openaiApiKey)],
  );
  logger.info({ model: config.ai.openaiModel }, "AI connection imported from .env (OPENAI_*) - may be removed from .env now");
}
