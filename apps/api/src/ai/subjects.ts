import { pool } from "../db.js";

// What a conversation is about (2026-10-24): the AI button on a thing - a node, a device, a process,
// a WEM message, a Dashboard card - opens the assistant on it. The subject names it for the system
// prompt (with its ids - the tools take them) and finds the process it belongs to (that DNP
// instance's assistant, when it is on). `processId` from the caller - the process the thing is
// shown in (a unit's popup in its scene) - wins over a guess.

// "page" (2026-10-25) - a panel page (its title's AI button: Nodes, Logs, Service...); `view` - on any
// subject, what the person is looking at there (the tab / the sub-tab, a filter) - told to the model
export const SUBJECT_TYPES = ["node", "device", "process", "message", "card", "page"] as const;
export type SubjectType = (typeof SUBJECT_TYPES)[number];

export interface SubjectInput {
  type: SubjectType;
  id?: number;
  processId?: number | null;
  page?: string;
  view?: string | null;
}

export interface Subject {
  type: SubjectType;
  id: number;
  processId: number | null;
  label: string;
  // for the system prompt
  detail: string;
  page?: string;
  view?: string | null;
}

const PAGE_MAX = 80;
const VIEW_MAX = 300;

const LABEL_MAX = 60;
const cut = (text: string) => (text.length > LABEL_MAX ? `${text.slice(0, LABEL_MAX - 1)}…` : text);

export function subjectProblem(input: unknown): string | null {
  const s = input as Partial<SubjectInput> | null;
  if (!s || typeof s !== "object") return "subject must be an object";
  if (!SUBJECT_TYPES.includes(s.type as SubjectType)) return `subject.type must be one of ${SUBJECT_TYPES.join(", ")}`;
  if (s.type === "page") {
    if (typeof s.page !== "string" || !s.page.trim() || s.page.length > PAGE_MAX) return `subject.page - the page's title, up to ${PAGE_MAX} characters`;
  } else if (!Number.isInteger(s.id)) return "subject.id must be an integer";
  if (s.view != null && (typeof s.view !== "string" || s.view.length > VIEW_MAX)) return `subject.view - up to ${VIEW_MAX} characters`;
  if (s.processId != null && !Number.isInteger(s.processId)) return "subject.processId must be an integer";
  return null;
}

const processOfNode = async (nodeId: number): Promise<number | null> =>
  (
    await pool.query<{ id: number }>(
      `SELECT p.id FROM processes p JOIN nodes n ON p.node_id = n.id OR p.node_id = n.parent_id
       WHERE n.id = $1 ORDER BY (p.node_id = n.id) DESC, p.id LIMIT 1`,
      [nodeId],
    )
  ).rows[0]?.id ?? null;

const processLine = async (processId: number | null): Promise<string> => {
  if (processId === null) return "";
  const p = (await pool.query<{ name: string; kind: string }>("SELECT name, kind FROM processes WHERE id = $1", [processId])).rows[0];
  return p ? `, in the process ${processId} "${p.name}" (kind ${p.kind})` : "";
};

/** The subject named and placed, null - no such thing; what the person looks at (`view`) told too. */
export async function resolveSubject(input: SubjectInput): Promise<Subject | null> {
  const subject = await placed(input);
  if (!subject) return null;
  const view = input.view?.trim() || null;
  return view ? { ...subject, view, detail: `${subject.detail}; the person is looking at: ${view}` } : subject;
}

async function placed(input: SubjectInput): Promise<Subject | null> {
  if (input.type === "page") {
    const page = input.page!.trim();
    return { type: "page", id: 0, processId: null, label: cut(page), page, detail: `the panel's page "${page}"` };
  }
  const id = input.id as number;
  const hint = input.processId ?? null;
  if (input.type === "process") {
    const p = (await pool.query<{ name: string; kind: string }>("SELECT name, kind FROM processes WHERE id = $1", [id])).rows[0];
    if (!p) return null;
    return { type: "process", id: id, processId: id, label: p.name, detail: `the process ${id} "${p.name}" (kind ${p.kind})` };
  }
  if (input.type === "node") {
    const n = (await pool.query<{ name: string; type: string; model: string | null }>("SELECT name, type, model FROM nodes WHERE id = $1", [id])).rows[0];
    if (!n) return null;
    const processId = hint ?? (await processOfNode(id));
    return {
      type: "node",
      id: id,
      processId,
      label: n.name,
      detail: `the node ${id} "${n.name}" (type ${n.type}${n.model ? `, model ${n.model}` : ""})${await processLine(processId)}`,
    };
  }
  if (input.type === "device") {
    const d = (
      await pool.query<{ name: string; type: string; node_id: number | null; node_name: string | null }>(
        "SELECT d.name, d.type, d.node_id, n.name AS node_name FROM devices d LEFT JOIN nodes n ON n.id = d.node_id WHERE d.id = $1",
        [id],
      )
    ).rows[0];
    if (!d) return null;
    const processId =
      hint ??
      (await pool.query<{ id: number }>("SELECT id FROM processes WHERE device_id = $1 ORDER BY id LIMIT 1", [id])).rows[0]?.id ??
      (d.node_id === null ? null : await processOfNode(d.node_id));
    return {
      type: "device",
      id: id,
      processId,
      label: d.name,
      detail: `the device ${id} "${d.name}" (type ${d.type}${d.node_id === null ? "" : `, on the node ${d.node_id} "${d.node_name}"`})${await processLine(processId)}`,
    };
  }
  if (input.type === "message") {
    const m = (
      await pool.query<{ type: string; level: number; code: string | null; text: string; process_id: number | null; created_at: Date; resolved_at: Date | null }>(
        "SELECT type, level, code, text, process_id, created_at, resolved_at FROM log_messages WHERE id = $1",
        [id],
      )
    ).rows[0];
    if (!m) return null;
    const processId = m.process_id ?? hint;
    return {
      type: "message",
      id: id,
      processId,
      label: cut(m.text),
      detail:
        `the ${m.type} message ${id} (code ${m.code ?? "-"}, level ${m.level}, since ${m.created_at.toISOString()}` +
        `${m.resolved_at ? `, resolved ${m.resolved_at.toISOString()}` : ", active"}): "${m.text}"${await processLine(processId)}`,
    };
  }
  const c = (await pool.query<{ title: string | null; type: string; process_id: number | null }>("SELECT title, type, process_id FROM dashboard_cards WHERE id = $1", [id])).rows[0];
  if (!c) return null;
  const processId = c.process_id ?? hint;
  const label = c.title ?? `Card ${id}`;
  return {
    type: "card",
    id: id,
    processId,
    label,
    detail: `the Dashboard ${c.type === "folder" ? "folder" : "card"} ${id} "${label}"${await processLine(processId)}`,
  };
}

/** The work type a subject opens with: a message - its analysis, a page - help with it, anything else - the state. */
export const subjectWorkType = (s: Subject): string => (s.type === "message" ? "wem-analysis" : s.type === "page" ? "help" : "status-analysis");
