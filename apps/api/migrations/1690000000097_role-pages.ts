import type { MigrationBuilder } from "node-pg-migrate";

// A role's pages (iot AGENTS_TO_DO.md 2026-10-27): the menu entries / pages it shows, on their own - an
// owner, an operator or a visitor works on the Dashboard and needs no Nodes / Devices / Processes pages
// although their rights let the Dashboard read those; "messages" - the header's messages (the
// notification centre). NULL - every page the role's rights open (as before). Only what is shown - the
// rights still decide what may be read or done.
export const up = (pgm: MigrationBuilder): void => {
  pgm.addColumns("roles", { pages: { type: "jsonb" } });
};

export const down = (pgm: MigrationBuilder): void => {
  pgm.dropColumns("roles", ["pages"]);
};
