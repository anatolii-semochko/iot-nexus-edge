import { pool } from "../db.js";

// The guest's settings (iot AGENTS_TO_DO.md 2026-10-27; system_settings 'guest', migration 094; Users ->
// Guest): whether the guests' conversations are private (each browser its own) or public (every guest
// reads all of them, continues only their own); how many days they are kept (null - kept); whether a
// question the assistant marks off-topic is dropped with its answer (ai/agent.ts); the role a new visitor
// starts in (`defaultRole` - one of the guest's; none - the most allowing; a link's `?account=` wins).

export interface GuestSettings {
  conversations: "private" | "public";
  retentionDays: number | null;
  relevantOnly: boolean;
  defaultRole: string | null;
}

const DEFAULTS: GuestSettings = { conversations: "private", retentionDays: null, relevantOnly: true, defaultRole: null };

export async function guestSettings(): Promise<GuestSettings> {
  const row = (await pool.query<{ value: Partial<GuestSettings> }>("SELECT value FROM system_settings WHERE key = 'guest'")).rows[0];
  return { ...DEFAULTS, ...(row?.value ?? {}) };
}

/** The settings from a form - the merged ones, or a problem's text. */
export function guestSettingsProblem(current: GuestSettings, input: unknown): GuestSettings | string {
  if (!input || typeof input !== "object") return "settings are required";
  const v = input as Record<string, unknown>;
  const next = { ...current };
  if (v.conversations !== undefined) {
    if (v.conversations !== "private" && v.conversations !== "public") return "conversations: private or public";
    next.conversations = v.conversations;
  }
  if (v.retentionDays !== undefined) {
    if (v.retentionDays !== null && !(Number.isInteger(v.retentionDays) && (v.retentionDays as number) > 0)) return "retentionDays: empty (kept) or whole days > 0";
    next.retentionDays = v.retentionDays as number | null;
  }
  if (v.defaultRole !== undefined) {
    if (v.defaultRole !== null && (typeof v.defaultRole !== "string" || !v.defaultRole)) return "defaultRole: a role key or null";
    next.defaultRole = v.defaultRole as string | null;
  }
  if (v.relevantOnly !== undefined) {
    if (typeof v.relevantOnly !== "boolean") return "relevantOnly: true or false";
    next.relevantOnly = v.relevantOnly;
  }
  return next;
}

export async function saveGuestSettings(settings: GuestSettings): Promise<void> {
  await pool.query(
    `INSERT INTO system_settings (key, value) VALUES ('guest', $1::jsonb)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [JSON.stringify(settings)],
  );
}

/** The guests' conversations past the kept days - removed (maintenance.ts); none set - none. */
export async function removeOldGuestConversations(): Promise<number> {
  const { retentionDays } = await guestSettings();
  if (!retentionDays) return 0;
  const r = await pool.query("DELETE FROM ai_conversations WHERE guest_session IS NOT NULL AND updated_at < now() - make_interval(days => $1)", [retentionDays]);
  return r.rowCount ?? 0;
}
