import type { MigrationBuilder } from "node-pg-migrate";

// The weather forecast of a weather-control process (CORE Library package
// devices/processes/weather-control/, its api.ts): the last forecast
// fetched for the process's location - kept when a later fetch fails, so
// consumers (the simulated weather node, the energy planners, the AI
// Assistant) always have the latest one known.
export const up = (pgm: MigrationBuilder): void => {
  pgm.createTable("weather_forecasts", {
    process_id: { type: "integer", primaryKey: true, references: "processes", onDelete: "CASCADE" },
    location: { type: "jsonb", notNull: true },
    fetched_at: { type: "timestamptz" },
    // [{ t (ms), ...values }] per hour / per day - the package's own shape
    hourly: { type: "jsonb", notNull: true, default: "[]" },
    daily: { type: "jsonb", notNull: true, default: "[]" },
    // the last failed fetch (cleared by a successful one)
    error: { type: "text" },
    error_at: { type: "timestamptz" },
  });
};

export const down = (pgm: MigrationBuilder): void => {
  pgm.dropTable("weather_forecasts");
};
