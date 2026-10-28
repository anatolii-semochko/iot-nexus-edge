import type { MigrationBuilder } from "node-pg-migrate";

// Day-ahead electricity market prices (CORE Library package
// devices/processes/energy-grid/, its api.ts): one row per market slot of
// a bidding zone (e.g. DE-LU - 15 minutes since 2025), EUR/MWh, from its
// source (Energy-Charts / aWATTar); and per zone - when it was fetched and
// the last failed fetch. Shared by every energy-grid process of the zone.
export const up = (pgm: MigrationBuilder): void => {
  pgm.createTable("energy_prices", {
    zone: { type: "text", notNull: true },
    t: { type: "timestamptz", notNull: true },
    minutes: { type: "integer", notNull: true },
    price_eur_mwh: { type: "double precision", notNull: true },
    source: { type: "text", notNull: true },
  });
  pgm.addConstraint("energy_prices", "energy_prices_pkey", { primaryKey: ["zone", "t"] });
  pgm.createTable("energy_price_fetches", {
    zone: { type: "text", primaryKey: true },
    fetched_at: { type: "timestamptz" },
    source: { type: "text" },
    error: { type: "text" },
    error_at: { type: "timestamptz" },
  });
};

export const down = (pgm: MigrationBuilder): void => {
  pgm.dropTable("energy_price_fetches");
  pgm.dropTable("energy_prices");
};
