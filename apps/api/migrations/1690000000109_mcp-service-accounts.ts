import type { MigrationBuilder } from "node-pg-migrate";

// MCP service accounts (iot AGENTS_TO_DO.md 2026-11-04, done 2026-11-10): an MCP token belongs to an
// account of its own - one per client ("Claude Code - laptop", an agent on a Pi) - instead of acting as
// the built-in assistant's instance.
// - users.kind: 'person' (signs in) or 'service' (no password, no sign-in - only its tokens); the
//   account's roles say what it may read and change, on which objects (as a person's).
// - ai_mcp_tokens.user_id, .levels: whether a change the roles allow applies at once or waits for a
//   person (config / control: off / confirm / auto; install: off / confirm).
// - ai_mcp_calls: every MCP tool call - the tool, its input, the account, the time, how long, an error.
// The tokens there are now: each gets its account (the engineer role, its instance's levels; install
// at most confirm).
export const up = (pgm: MigrationBuilder): void => {
  pgm.sql(`
    ALTER TABLE users ADD COLUMN kind text NOT NULL DEFAULT 'person' CHECK (kind IN ('person', 'service'));
    ALTER TABLE ai_mcp_tokens ADD COLUMN user_id integer REFERENCES users(id) ON DELETE CASCADE;
    ALTER TABLE ai_mcp_tokens ADD COLUMN levels jsonb NOT NULL DEFAULT '{"config": "confirm", "control": "confirm", "install": "confirm"}';
    CREATE TABLE ai_mcp_calls (
      id bigserial PRIMARY KEY,
      token_id integer REFERENCES ai_mcp_tokens(id) ON DELETE SET NULL,
      user_id integer REFERENCES users(id) ON DELETE SET NULL,
      tool text NOT NULL,
      input jsonb,
      is_error boolean NOT NULL DEFAULT false,
      error text,
      ms integer,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX ai_mcp_calls_created_at ON ai_mcp_calls (created_at DESC);

    DO $$
    DECLARE t record; uname text; uid integer; lv jsonb; acc jsonb;
    BEGIN
      FOR t IN SELECT * FROM ai_mcp_tokens WHERE user_id IS NULL LOOP
        uname := 'mcp-' || trim(both '-' from regexp_replace(lower(t.name), '[^a-z0-9]+', '-', 'g'));
        IF uname = 'mcp-' THEN uname := 'mcp-token-' || t.id; END IF;
        WHILE EXISTS (SELECT 1 FROM users WHERE username = uname) LOOP uname := uname || '-' || t.id; END LOOP;
        INSERT INTO users (username, password_hash, display_name, kind) VALUES (uname, '!', t.name, 'service') RETURNING id INTO uid;
        IF EXISTS (SELECT 1 FROM roles WHERE key = 'engineer') THEN
          INSERT INTO role_members (role_key, user_id) VALUES ('engineer', uid);
        END IF;
        acc := COALESCE((SELECT access FROM ai_instances WHERE instance_key = t.instance_key), '{}'::jsonb);
        lv := jsonb_build_object(
          'config', COALESCE(acc->>'config', 'confirm'),
          'control', COALESCE(acc->>'control', 'confirm'),
          'install', CASE WHEN COALESCE(acc->>'install', 'confirm') = 'off' THEN 'off' ELSE 'confirm' END);
        UPDATE ai_mcp_tokens SET user_id = uid, levels = lv WHERE id = t.id;
      END LOOP;
    END $$;
  `);
};

export const down = (pgm: MigrationBuilder): void => {
  pgm.sql(`
    DROP TABLE ai_mcp_calls;
    DELETE FROM users WHERE kind = 'service';
    ALTER TABLE ai_mcp_tokens DROP COLUMN levels;
    ALTER TABLE ai_mcp_tokens DROP COLUMN user_id;
    ALTER TABLE users DROP COLUMN kind;
  `);
};
