import type { MigrationBuilder } from "node-pg-migrate";

// The simulation's sight apart from configuring (iot AGENTS_TO_DO.md 2026-10-27): `simulation.view` left
// an object's Configure level for its own section row "section:simulation" (view - on the objects
// viewed; access/rights.ts) - so a view-only engineer's role is possible. A role whose object rows had
// Configure keeps seeing the simulation: it gets the row.
export const up = (pgm: MigrationBuilder): void => {
  pgm.sql(`
    UPDATE roles SET rights = rights || '{"section:simulation": ["view"]}'::jsonb
     WHERE NOT (rights ? 'section:simulation')
       AND EXISTS (SELECT 1 FROM jsonb_each(rights) e WHERE e.key NOT LIKE 'section:%' AND e.value ? 'config')`);
};

export const down = (pgm: MigrationBuilder): void => {
  pgm.sql(`UPDATE roles SET rights = rights - 'section:simulation'`);
};
