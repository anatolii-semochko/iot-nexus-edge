import type { MigrationBuilder } from "node-pg-migrate";

// The demo mode's visitors (B1.3 - access/, routes/ai.ts): every visitor
// signs in as the one `demo` account, each with an anonymous id of their
// own in the session. A conversation a visitor starts carries it - they see
// the showcase conversations (the demo account's, `visitor` NULL) and their
// own, never another visitor's; the nightly maintenance removes the
// visitors' ones (maintenance.ts).
export const up = (pgm: MigrationBuilder): void => {
  pgm.addColumn("ai_conversations", { visitor: { type: "text" } });
};

export const down = (pgm: MigrationBuilder): void => {
  pgm.dropColumn("ai_conversations", "visitor");
};
