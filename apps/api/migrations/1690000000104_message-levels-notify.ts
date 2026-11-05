import type { MigrationBuilder } from "node-pg-migrate";

// The orchestrator keeps the message levels until they change, instead of
// reading them every tick (iot PERF_PROD_2026-11-05.md; orchestrator
// shared.ts): their table sends change notifications too (migration 062).
// The table has no `id` (its key is type + level) - the change goes out as
// `message_levels.all.changed`, which drops the whole cache.
export const up = (pgm: MigrationBuilder): void => {
  pgm.sql(`CREATE TRIGGER message_levels_notify_change AFTER INSERT OR UPDATE OR DELETE ON message_levels
    FOR EACH ROW EXECUTE FUNCTION notify_change()`);
};

export const down = (pgm: MigrationBuilder): void => {
  pgm.sql("DROP TRIGGER IF EXISTS message_levels_notify_change ON message_levels");
};
