// A DNP package's own proposal (AGENTS_TO_DO.md 2026-10-21, Energy Ledger
// L3): a package's logic - not a conversation - suggests a change of its
// process's config (e.g. the ledger's strategy for tomorrow). It goes
// through the same proposals as the assistant's `config.propose`, under the
// process's AI instance - so its Config level is the permission: Auto -
// applied at once, Confirm - a card waiting for a person's Accept / Reject,
// Off - not offered. A pending proposal with the same change is not
// repeated.

import { pool } from "../db.js";
import { checkProcessConfig } from "../processWrites.js";
import { getInstance } from "./instances.js";
import { propose, type Proposal } from "./proposals.js";

export async function proposeProcessConfig(
  processId: number,
  sections: Record<string, unknown>,
  reason: string,
): Promise<Proposal | null> {
  const instance = await getInstance(`process:${processId}`);
  if (!instance || instance.access.config === "off") return null;
  const p = (
    await pool.query<{ name: string; config: Record<string, unknown>; config_stamps: Record<string, { at: string }> | null }>(
      "SELECT name, config, config_stamps FROM processes WHERE id = $1",
      [processId],
    )
  ).rows[0];
  if (!p) return null;
  const changed = Object.fromEntries(Object.entries(sections).filter(([k, v]) => JSON.stringify(p.config[k]) !== JSON.stringify(v)));
  const names = Object.keys(changed);
  if (!names.length) return null;
  const pending = await pool.query(
    "SELECT 1 FROM ai_proposals WHERE process_id = $1 AND status = 'pending' AND operation = 'config' AND payload = $2::jsonb LIMIT 1",
    [processId, JSON.stringify({ sections: changed })],
  );
  if (pending.rows.length) return null;
  await checkProcessConfig(processId, changed);
  return propose(
    {
      access: "config",
      operation: "config",
      processId,
      summary: `${p.name}: change ${names.join(", ")}`,
      reason,
      payload: { sections: changed },
      before: {
        sections: Object.fromEntries(names.map((k) => [k, p.config[k] ?? null])),
        stamps: Object.fromEntries(names.map((k) => [k, p.config_stamps?.[k]?.at ?? null])),
      },
    },
    { instance },
  );
}
