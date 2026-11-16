import type { MigrationBuilder } from "node-pg-migrate";

// The API's errors kept in the database (the user, 2026-11-16): the container's log goes with every
// deploy (a new container) and rotates within days, so a failure reported later could not be read.
// errorLog.ts writes each error-level log line here; the nightly maintenance keeps API_ERROR_RETENTION_DAYS.
export const up = (pgm: MigrationBuilder): void => {
  pgm.createTable("api_errors", {
    id: "id",
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    // the logger's name (api) or the request's method and url
    source: { type: "text", notNull: true, default: "" },
    msg: { type: "text", notNull: true, default: "" },
    // the rest of the log line (err with its stack, the tool, the job ...)
    detail: { type: "jsonb" },
  });
  pgm.createIndex("api_errors", "created_at");
};

export const down = (pgm: MigrationBuilder): void => {
  pgm.dropTable("api_errors");
};
