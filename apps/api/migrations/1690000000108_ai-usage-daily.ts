import type { MigrationBuilder } from "node-pg-migrate";

// The AI's tokens by day (the user, 2026-11-10 - a monitor of the requests and tokens): a row per day,
// connection and kind (guest / scheduled / person), counted as the answers are stored (ai/agent.ts). Kept
// apart from ai_messages - the guests' conversations are deleted after their retention, the usage stays.
// Filled from the messages there are now.
export const up = (pgm: MigrationBuilder): void => {
  pgm.sql(`
    CREATE TABLE ai_usage_daily (
      day date NOT NULL,
      connection_id integer REFERENCES ai_connections(id) ON DELETE SET NULL,
      connection_name text NOT NULL DEFAULT '',
      kind text NOT NULL CHECK (kind IN ('guest', 'scheduled', 'person')),
      requests integer NOT NULL DEFAULT 0,
      tokens_in bigint NOT NULL DEFAULT 0,
      tokens_out bigint NOT NULL DEFAULT 0
    );
    CREATE UNIQUE INDEX ai_usage_daily_key ON ai_usage_daily (day, COALESCE(connection_id, 0), kind);
    INSERT INTO ai_usage_daily (day, connection_id, connection_name, kind, requests, tokens_in, tokens_out)
    SELECT m.created_at::date, c.connection_id, COALESCE(max(c.connection_name), ''),
           CASE WHEN c.guest_session IS NOT NULL THEN 'guest' WHEN c.scheduled THEN 'scheduled' ELSE 'person' END,
           count(*), COALESCE(sum(m.tokens_in), 0), COALESCE(sum(m.tokens_out), 0)
      FROM ai_messages m JOIN ai_conversations c ON c.id = m.conversation_id
     WHERE m.tokens_in IS NOT NULL OR m.tokens_out IS NOT NULL
     GROUP BY 1, 2, 4;
  `);
};

export const down = (pgm: MigrationBuilder): void => {
  pgm.sql("DROP TABLE ai_usage_daily");
};
