import { getSystemActorUserId, logCommand } from "./commandLog.js";
import { pool } from "./db.js";

/**
 * The operational days' notes (migration 088 -> 090 `day_notes`; iot AGENTS_TO_DO.md 2026-10-25): what is
 * known about a day - today or ahead - each note of the process it belongs to: the energy field's technical
 * ones (a grid outage, maintenance), the Energy Ledger's logic (holidays, days off, a working weekend - its
 * calendar writes the holidays), a heating's (maintenance, a room closed). The ledger's plan weighs its own,
 * its field's and its heatings' notes; every AI conversation is told today's and tomorrow's (`notesForPrompt`).
 * Written by people (the routes - processes.control), the AI (`daynote.propose` - its Control level) and the
 * processes themselves (`source` auto).
 */

export const DAY_NOTE_KINDS = ["outage", "holiday", "day-off", "workday", "maintenance", "room-closed", "other"] as const;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const TEXT_MAX = 500;

export type NoteFields = Record<string, unknown>;
// a request's body / a row - read field by field, each checked
type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** A note's fields from a request - checked; `partial` - an edit's (only what it has). */
export function dayNoteInput(body: unknown, partial: boolean): { error: string } | { fields: NoteFields } {
  const b: Loose = body ?? {};
  const f: NoteFields = {};
  if (b.day !== undefined || !partial) {
    if (typeof b.day !== "string" || !DAY.test(b.day)) return { error: "day YYYY-MM-DD" };
    f.day = b.day;
  }
  if (b.kind !== undefined || !partial) {
    if (!(DAY_NOTE_KINDS as readonly string[]).includes(b.kind)) return { error: `kind - one of ${DAY_NOTE_KINDS.join(", ")}` };
    f.kind = b.kind;
  }
  if (b.text !== undefined) {
    if (typeof b.text !== "string" || b.text.length > TEXT_MAX) return { error: `text - up to ${TEXT_MAX} characters` };
    f.text = b.text.trim();
  }
  for (const k of ["startsAt", "endsAt"]) {
    if (b[k] === undefined) continue;
    if (b[k] !== null && !Number.isFinite(Date.parse(b[k]))) return { error: `${k} - an ISO time or null` };
    f[k] = b[k] === null ? null : new Date(b[k]).toISOString();
  }
  if (typeof f.startsAt === "string" && typeof f.endsAt === "string" && f.endsAt <= f.startsAt) return { error: "endsAt after startsAt" };
  if (b.nodeIds !== undefined) {
    if (!Array.isArray(b.nodeIds) || b.nodeIds.length > 100 || !b.nodeIds.every((x: unknown) => Number.isInteger(x))) return { error: "nodeIds - node ids" };
    f.nodeIds = b.nodeIds;
  }
  return { fields: f };
}

/** A stored note on the wire. */
const noteRow = (x: Loose) => ({
  id: x.id,
  processId: x.process_id,
  processName: x.process_name ?? null,
  day: x.day,
  kind: x.kind,
  text: x.text,
  startsAt: x.starts_at ? new Date(x.starts_at).getTime() : null,
  endsAt: x.ends_at ? new Date(x.ends_at).getTime() : null,
  nodeIds: x.node_ids ?? [],
  source: x.source,
  auto: x.auto_key !== null,
  by: x.by ?? null,
  updatedAt: new Date(x.updated_at).getTime(),
});
export type DayNoteRow = ReturnType<typeof noteRow>;

/** The processes' notes from .. to (local dates), dismissed ones left out. */
export async function dayNotesOf(processIds: number[], from: string, to: string): Promise<DayNoteRow[]> {
  if (!processIds.length) return [];
  const { rows } = await pool.query(
    `SELECT n.*, to_char(n.day, 'YYYY-MM-DD') AS day, u.username AS by, p.name AS process_name
       FROM day_notes n LEFT JOIN users u ON u.id = n.created_by LEFT JOIN processes p ON p.id = n.process_id
      WHERE n.process_id = ANY($1) AND n.day BETWEEN $2 AND $3 AND NOT n.dismissed
      ORDER BY n.day, n.starts_at NULLS FIRST, n.id`,
    [processIds, from, to],
  );
  return rows.map(noteRow);
}

/** A note created / changed / removed - by a person or the AI; logged (Logs -> Commands). 404 - no such note. */
export async function writeDayNote(
  processId: number,
  op: "add" | "update" | "delete",
  noteId: number | null,
  fields: NoteFields,
  source: "user" | "ai",
  userId: number | null,
): Promise<{ status: 200 | 404; id?: number | null; error?: string }> {
  if (op === "add") {
    const { rows } = await pool.query(
      `INSERT INTO day_notes (process_id, day, kind, text, starts_at, ends_at, node_ids, source, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [processId, fields.day, fields.kind, fields.text ?? "", fields.startsAt ?? null, fields.endsAt ?? null, fields.nodeIds ?? [], source, userId],
    );
    noteId = rows[0].id;
  } else {
    const own = (await pool.query("SELECT id, auto_key FROM day_notes WHERE id = $1 AND process_id = $2 AND NOT dismissed", [noteId, processId])).rows[0];
    if (!own) return { status: 404, error: "note not found" };
    if (op === "delete") {
      // an automatic note (a holiday) is dismissed - never re-added by its process
      if (own.auto_key) await pool.query("UPDATE day_notes SET dismissed = true, updated_at = now() WHERE id = $1", [noteId]);
      else await pool.query("DELETE FROM day_notes WHERE id = $1", [noteId]);
    } else {
      const cols: Record<string, string> = { day: "day", kind: "kind", text: "text", startsAt: "starts_at", endsAt: "ends_at", nodeIds: "node_ids" };
      const keys = Object.keys(fields).filter((k) => cols[k]);
      const sets = keys.map((k, i) => `${cols[k]} = $${i + 3}`);
      // an edited note is the editor's (an automatic one keeps its key - its process leaves it)
      await pool.query(
        `UPDATE day_notes SET ${[...sets, `source = $${keys.length + 3}`, `created_by = $${keys.length + 4}`, "updated_at = now()"].join(", ")} WHERE id = $1 AND process_id = $2`,
        [noteId, processId, ...keys.map((k) => fields[k]), source, userId],
      );
    }
  }
  await logCommand({ processId, action: "command", value: { action: "day-note", params: { op, noteId, ...fields } }, source: source === "ai" ? "ai" : "api", actorUserId: userId ?? (await getSystemActorUserId()) });
  return { status: 200, id: noteId };
}

const localDate = (ms: number) => new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
const time = (d: Date) => new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);

/** Today's and tomorrow's notes of every process, a few lines for an AI conversation's system prompt (null - none). */
export async function notesForPrompt(now = Date.now()): Promise<string | null> {
  const today = localDate(now);
  const tomorrow = localDate(now + 86_400_000);
  const { rows } = await pool.query(
    `SELECT n.*, to_char(n.day, 'YYYY-MM-DD') AS day, p.name AS process_name FROM day_notes n JOIN processes p ON p.id = n.process_id
      WHERE n.day BETWEEN $1 AND $2 AND NOT n.dismissed ORDER BY n.day, n.starts_at NULLS FIRST, n.id LIMIT 40`,
    [today, tomorrow],
  );
  if (!rows.length) return null;
  const lines = rows.map((n: Loose) => {
    const window = n.starts_at || n.ends_at ? ` ${n.starts_at ? time(n.starts_at) : ""}-${n.ends_at ? time(n.ends_at) : ""}` : "";
    const nodes = n.node_ids?.length ? ` (nodes ${n.node_ids.join(", ")})` : "";
    return `- ${n.day === today ? "today" : "tomorrow"}${window}, ${n.process_name} (process ${n.process_id}): ${n.kind}${n.text ? ` - ${n.text}` : ""}${nodes}`;
  });
  return `The operational days' notes (the site's processes - what is known about today and tomorrow):\n${lines.join("\n")}`;
}
