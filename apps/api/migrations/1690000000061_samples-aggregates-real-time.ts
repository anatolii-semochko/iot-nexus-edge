import type { MigrationBuilder } from "node-pg-migrate";

// The time series' continuous aggregates (migrations/1690000000060) in
// real time: a query of samples_hourly / samples_daily adds the raw points
// past the last materialized bucket on the fly - otherwise a chart from
// the aggregates would miss its newest hour / day (the refresh policies
// end an hour / a day back). Without the extension - nothing to change.
export const up = (pgm: MigrationBuilder): void => {
  pgm.sql(`DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_matviews WHERE matviewname = 'samples_hourly') THEN
      ALTER MATERIALIZED VIEW samples_hourly SET (timescaledb.materialized_only = false);
      ALTER MATERIALIZED VIEW samples_daily SET (timescaledb.materialized_only = false);
    END IF;
  END $$`);
};

export const down = (pgm: MigrationBuilder): void => {
  pgm.sql(`DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_matviews WHERE matviewname = 'samples_hourly') THEN
      ALTER MATERIALIZED VIEW samples_hourly SET (timescaledb.materialized_only = true);
      ALTER MATERIALIZED VIEW samples_daily SET (timescaledb.materialized_only = true);
    END IF;
  END $$`);
};
