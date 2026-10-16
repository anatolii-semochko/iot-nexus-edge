import type { MigrationBuilder } from "node-pg-migrate";

// A message's subject (nexus-edge-aquarium AGENTS_TO_DO.md 2026-10-16,
// tech debt 2): what part of its process's domain the message is about - a
// key the project defines (an aquarium's service: "heating", "co2", ...),
// sent by the process with the message, so a UI groups messages without
// matching their codes. Null - the process as a whole.
export const up = (pgm: MigrationBuilder): void => {
  pgm.addColumn("log_messages", { subject: { type: "text" } });
};

export const down = (pgm: MigrationBuilder): void => {
  pgm.dropColumn("log_messages", "subject");
};
