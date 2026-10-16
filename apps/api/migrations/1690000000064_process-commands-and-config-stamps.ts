import type { MigrationBuilder } from "node-pg-migrate";

// Concurrent config edits and one-shot commands (nexus-edge-aquarium
// AGENTS_TO_DO.md 2026-10-16, tech debt 6):
//
// - `processes.config_stamps` - per top-level config section, when it was
//   last changed and by whom: {section: {at, by}}. Kept by a trigger on
//   EVERY config write (the config route, a plugin's own SQL, a
//   migration); `by` - the user the writing transaction names
//   (`SET LOCAL nexus.actor`), null otherwise. A UI sends the stamps it saw
//   with an edit; the API refuses one whose section changed after
//   (routes/processes.ts - 409).
// - `process_commands` - one-shot commands to a process (a calibration
//   start, a replacement done, a test) kept out of its config: they were
//   written there (`actionRequest`), mixed with the settings and landed in
//   backups. A pending command reaches the process with the tick's process
//   list (GET /processes - `commands`), the process reports it done.
export const up = (pgm: MigrationBuilder): void => {
  pgm.addColumn("processes", { config_stamps: { type: "jsonb", notNull: true, default: "{}" } });
  pgm.sql(`CREATE OR REPLACE FUNCTION stamp_config_sections() RETURNS trigger LANGUAGE plpgsql AS $$
    DECLARE
      section text;
      actor integer := nullif(current_setting('nexus.actor', true), '')::integer;
    BEGIN
      IF NEW.config IS DISTINCT FROM OLD.config THEN
        FOR section IN
          SELECT jsonb_object_keys(COALESCE(NEW.config, '{}'::jsonb))
          UNION SELECT jsonb_object_keys(COALESCE(OLD.config, '{}'::jsonb))
        LOOP
          IF (NEW.config -> section) IS DISTINCT FROM (OLD.config -> section) THEN
            NEW.config_stamps := jsonb_set(NEW.config_stamps, ARRAY[section], jsonb_build_object('at', now(), 'by', actor));
          END IF;
        END LOOP;
      END IF;
      RETURN NEW;
    END $$`);
  pgm.sql(`CREATE TRIGGER processes_stamp_config BEFORE UPDATE OF config ON processes
    FOR EACH ROW EXECUTE FUNCTION stamp_config_sections()`);

  pgm.createTable("process_commands", {
    id: "id",
    process_id: { type: "integer", notNull: true, references: "processes", onDelete: "CASCADE" },
    action: { type: "text", notNull: true },
    params: { type: "jsonb", notNull: true, default: "{}" },
    created_by: { type: "integer", references: "users", onDelete: "SET NULL" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    done_at: { type: "timestamptz" },
    result: { type: "jsonb" },
  });
  pgm.sql("CREATE INDEX process_commands_pending ON process_commands (process_id) WHERE done_at IS NULL");
  // a command given is audited like a config edit (log_command action "command")
  pgm.dropConstraint("log_command", "log_command_action_check");
  pgm.addConstraint("log_command", "log_command_action_check", "CHECK (action in ('write', 'auto', 'release', 'simulate', 'on', 'off', 'config', 'simulated-on', 'simulated-off', 'create', 'delete', 'set-state', 'clear-logs', 'command'))");
};

export const down = (pgm: MigrationBuilder): void => {
  pgm.dropConstraint("log_command", "log_command_action_check");
  pgm.addConstraint("log_command", "log_command_action_check", "CHECK (action in ('write', 'auto', 'release', 'simulate', 'on', 'off', 'config', 'simulated-on', 'simulated-off', 'create', 'delete', 'set-state', 'clear-logs'))");
  pgm.dropTable("process_commands");
  pgm.sql("DROP TRIGGER IF EXISTS processes_stamp_config ON processes");
  pgm.sql("DROP FUNCTION IF EXISTS stamp_config_sections()");
  pgm.dropColumn("processes", "config_stamps");
};
