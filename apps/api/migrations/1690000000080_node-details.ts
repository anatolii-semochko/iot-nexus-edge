import type { MigrationBuilder } from "node-pg-migrate";

// A node's details for its information popup (AGENTS_TO_DO.md 2026-10-20,
// X1): the model it is - one of its node type's Library `models` (by key;
// null - the type's first), where it stands (a point on the map - PV
// blocks, wind turbines; null - not placed) and a photo of the real unit
// (a Media Store entry in the node's own scope; null - none).
export const up = (pgm: MigrationBuilder): void => {
  pgm.addColumns("nodes", {
    model: { type: "text" },
    latitude: { type: "double precision" },
    longitude: { type: "double precision" },
    photo_media_id: { type: "text" },
  });
};

export const down = (pgm: MigrationBuilder): void => {
  pgm.dropColumns("nodes", ["model", "latitude", "longitude", "photo_media_id"]);
};
