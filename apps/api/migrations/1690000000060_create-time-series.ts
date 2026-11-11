import type { MigrationBuilder } from "node-pg-migrate";

// Time series (nexus-edge-aquarium AGENTS_TO_DO.md 2026-10-16) - ONE store
// for logged values: a device's reading or a value a process publishes in
// its metrics (e.g. an aquarium's clogging), each a `series` with its own
// recording policy; the points in `samples` - a TimescaleDB hypertable with
// continuous aggregates per hour and per day, so a chart of a year reads a
// few hundred rows. Written by the Data Logger process only.
//
// `series`:
// - `key` - "device:<id>" or "process:<processId>:<valueKey>" (unique);
// - `kind` - how points add up: `gauge` (a measured value - averaged),
//   `counter` (cumulative, only grows - consumption = its rise), `state`
//   (a step value: on / off, a power that changes in steps - weighted by
//   time);
// - `mode` - `period` (one point every `period_s`: a gauge - the average
//   of the readings in the period, a counter - the last), `change` (a point
//   when the value moves by more than `deadband`, and at least every
//   `max_interval_s`), `off`;
// - `stale_s` - a reading older than this is expired: not logged.
// Without the TimescaleDB extension (an older stack) the tables are plain
// and the queries bucket the raw points themselves.
export const up = (pgm: MigrationBuilder): void => {
  pgm.noTransaction(); // continuous aggregates can't be created in a transaction
  pgm.sql(`DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'timescaledb') THEN
      CREATE EXTENSION IF NOT EXISTS timescaledb;
    END IF;
  END $$`);
  pgm.createTable("series", {
    id: "id",
    key: { type: "text", notNull: true, unique: true },
    name: { type: "text", notNull: true },
    unit: { type: "text" },
    device_id: { type: "integer", references: "devices", onDelete: "CASCADE" },
    process_id: { type: "integer", references: "processes", onDelete: "CASCADE" },
    value_key: { type: "text" },
    kind: { type: "text", notNull: true, default: "gauge", check: "kind IN ('gauge', 'counter', 'state')" },
    mode: { type: "text", notNull: true, default: "period", check: "mode IN ('period', 'change', 'off')" },
    period_s: { type: "integer", check: "period_s IS NULL OR period_s > 0" },
    deadband: { type: "double precision" },
    max_interval_s: { type: "integer", check: "max_interval_s IS NULL OR max_interval_s > 0" },
    stale_s: { type: "integer", check: "stale_s IS NULL OR stale_s > 0" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.createIndex("series", "process_id");
  pgm.createIndex("series", "device_id");
  pgm.createTable("samples", {
    series_id: { type: "integer", notNull: true, references: "series", onDelete: "CASCADE" },
    t: { type: "timestamptz", notNull: true },
    v: { type: "double precision", notNull: true },
  });
  pgm.addConstraint("samples", "samples_series_t", { primaryKey: ["series_id", "t"] });
  pgm.sql(`DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
      PERFORM create_hypertable('samples', by_range('t', INTERVAL '7 days'), migrate_data => true);
    END IF;
  END $$`);
  // the aggregates - only with the extension (EXECUTE: plain Postgres
  // would reject the WITH (timescaledb.continuous) clause even unrun)
  pgm.sql(`DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
      EXECUTE 'CREATE MATERIALIZED VIEW samples_hourly WITH (timescaledb.continuous) AS
        SELECT series_id, time_bucket(INTERVAL ''1 hour'', t) AS bucket,
               avg(v) AS v_avg, min(v) AS v_min, max(v) AS v_max, last(v, t) AS v_last, count(*) AS n
        FROM samples GROUP BY series_id, time_bucket(INTERVAL ''1 hour'', t) WITH NO DATA';
      EXECUTE 'CREATE MATERIALIZED VIEW samples_daily WITH (timescaledb.continuous) AS
        SELECT series_id, time_bucket(INTERVAL ''1 day'', t) AS bucket,
               avg(v) AS v_avg, min(v) AS v_min, max(v) AS v_max, last(v, t) AS v_last, count(*) AS n
        FROM samples GROUP BY series_id, time_bucket(INTERVAL ''1 day'', t) WITH NO DATA';
      PERFORM add_continuous_aggregate_policy('samples_hourly', start_offset => INTERVAL '3 days', end_offset => INTERVAL '1 hour', schedule_interval => INTERVAL '30 minutes');
      PERFORM add_continuous_aggregate_policy('samples_daily', start_offset => INTERVAL '7 days', end_offset => INTERVAL '1 day', schedule_interval => INTERVAL '6 hours');
    END IF;
  END $$`);
};

export const down = (pgm: MigrationBuilder): void => {
  pgm.noTransaction();
  pgm.sql("DROP MATERIALIZED VIEW IF EXISTS samples_daily CASCADE");
  pgm.sql("DROP MATERIALIZED VIEW IF EXISTS samples_hourly CASCADE");
  pgm.dropTable("samples");
  pgm.dropTable("series");
};
