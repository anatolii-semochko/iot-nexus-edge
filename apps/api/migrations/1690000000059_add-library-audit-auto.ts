import type { MigrationBuilder } from "node-pg-migrate";

// A device type's audit policy for the AUTO values a process writes
// (nexus-edge-aquarium AGENTS_TO_DO.md 2026-10-16): `library.json`
// `auditAuto` - "change" (default - a log_command row when the AUTO value
// changes), "transition" (only when it goes between zero / off and
// non-zero / on - e.g. a timed output's lease renewals aren't commands),
// "never" (a continuous output - a display's text, a pump's power from
// its flow loop - is the process's own working, not a command). People's
// commands are always logged. Synced from library.json like the rest.
export const up = (pgm: MigrationBuilder): void => {
  pgm.addColumn("library_items", {
    audit_auto: { type: "text", check: "audit_auto IS NULL OR audit_auto IN ('change', 'transition', 'never')" },
  });
};

export const down = (pgm: MigrationBuilder): void => {
  pgm.dropColumn("library_items", "audit_auto");
};
