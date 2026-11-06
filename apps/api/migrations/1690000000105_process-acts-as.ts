import type { MigrationBuilder } from "node-pg-migrate";

// A process acting for a person (iot AGENTS_TO_DO.md 2026-11-06 - a maintenance process does a
// technician's work): `acts_as_user_id` - the account its requests made "as the person" act for
// (access/guard.ts - `X-Acting-Process`): that person's rights, that person the author of what it
// records. Set by an administrator only (PUT /processes/:id/acts-as); a removed person - none.
export const up = (pgm: MigrationBuilder): void => {
  pgm.addColumn("processes", {
    acts_as_user_id: { type: "integer", references: "users", onDelete: "SET NULL" },
  });
};

export const down = (pgm: MigrationBuilder): void => {
  pgm.dropColumn("processes", "acts_as_user_id");
};
