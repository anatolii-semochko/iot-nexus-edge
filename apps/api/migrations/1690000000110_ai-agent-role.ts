import type { MigrationBuilder } from "node-pg-migrate";

// The built-in assistant's own role (the user, 2026-11-12 - as the MCP service accounts, 109): `ai-agent`
// held `system` (everything), so only its instances' levels bounded it. Now it is a member of the role
// "AI Assistant" - every object configured, no system section - which an administrator may narrow
// (Users -> Roles) or replace on the account (never with a role holding everything). What the assistant
// reads and what its proposals may change follow these roles; the levels still say how (Off / Confirm /
// Auto).
export const up = (pgm: MigrationBuilder): void => {
  pgm.sql(`
    INSERT INTO roles (key, name, system, rights)
    VALUES ('ai-assistant', 'AI Assistant', true, '{"*": ["view", "control", "config"]}'::jsonb)
    ON CONFLICT (key) DO NOTHING;
    DELETE FROM role_members WHERE role_key = 'system' AND user_id = (SELECT id FROM users WHERE username = 'ai-agent');
    INSERT INTO role_members (role_key, user_id)
    SELECT 'ai-assistant', id FROM users WHERE username = 'ai-agent'
    ON CONFLICT DO NOTHING;
  `);
};

export const down = (pgm: MigrationBuilder): void => {
  pgm.sql(`
    DELETE FROM role_members WHERE user_id = (SELECT id FROM users WHERE username = 'ai-agent');
    INSERT INTO role_members (role_key, user_id) SELECT 'system', id FROM users WHERE username = 'ai-agent' ON CONFLICT DO NOTHING;
    DELETE FROM roles WHERE key = 'ai-assistant' AND NOT EXISTS (SELECT 1 FROM role_members WHERE role_key = 'ai-assistant');
  `);
};
