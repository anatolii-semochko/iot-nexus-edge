import type { MigrationBuilder } from "node-pg-migrate";

// Change notifications (nexus-edge-aquarium AGENTS_TO_DO.md 2026-10-16,
// item 10: a cache is dropped the moment what it holds changes, not after
// its TTL). A row of a watched table that is inserted, deleted or really
// changed sends `pg_notify('entity_changes', {table, op, id})` - on
// commit, whoever wrote it (a core route, a plugin's own SQL, a
// migration). The api relays each to `nexus.events` as
// `<table>.<id>.changed` (entityChanges.ts); the orchestrator's processes
// drop their caches by it.
//
// `notify_change(ignored...)` - the trigger's arguments name the columns
// whose change alone is no change (heartbeats, sync stamps); `updated_at`
// is always ignored. A plugin watches its own tables with the same
// function (CREATE OR REPLACE TRIGGER ... EXECUTE FUNCTION notify_change()).
const WATCHED: Record<string, string[]> = {
  processes: ["dashboard_flagged_at"],
  nodes: ["last_heartbeat_at", "health"],
  devices: [],
  series: [],
  library_items: ["last_synced_at"],
};

export const up = (pgm: MigrationBuilder): void => {
  pgm.sql(`CREATE OR REPLACE FUNCTION notify_change() RETURNS trigger LANGUAGE plpgsql AS $$
    DECLARE
      ignored text[] := TG_ARGV || ARRAY['updated_at'];
      row_id text;
    BEGIN
      IF TG_OP = 'UPDATE' AND (to_jsonb(OLD) - ignored) = (to_jsonb(NEW) - ignored) THEN
        RETURN NULL;
      END IF;
      row_id := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ->> 'id' ELSE to_jsonb(NEW) ->> 'id' END;
      PERFORM pg_notify('entity_changes', json_build_object('table', TG_TABLE_NAME, 'op', lower(TG_OP), 'id', row_id)::text);
      RETURN NULL;
    END $$`);
  for (const [table, ignored] of Object.entries(WATCHED)) {
    const args = ignored.map((c) => `'${c}'`).join(", ");
    pgm.sql(`CREATE TRIGGER ${table}_notify_change AFTER INSERT OR UPDATE OR DELETE ON ${table}
      FOR EACH ROW EXECUTE FUNCTION notify_change(${args})`);
  }
};

export const down = (pgm: MigrationBuilder): void => {
  for (const table of Object.keys(WATCHED)) pgm.sql(`DROP TRIGGER IF EXISTS ${table}_notify_change ON ${table}`);
  pgm.sql("DROP FUNCTION IF EXISTS notify_change()");
};
