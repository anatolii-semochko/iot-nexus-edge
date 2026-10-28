import type { FastifyInstance } from "fastify";
import { pool } from "../db.js";
import { dayNoteInput, dayNotesOf, writeDayNote } from "../dayNotes.js";

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_DAYS = 14;
const plusDays = (day: string, n: number) => new Date(Date.parse(`${day}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const today = () => new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

/**
 * A process's operational days' notes (dayNotes.ts): GET (processes.view) from .. to (default today and 14
 * days on); people's CRUD (processes.control - the day's facts steer the plans, as the processes' commands
 * do). TODO(access rework): who may write which panel's notes - one package with the rights' rework.
 */
export async function dayNoteRoutes(app: FastifyInstance): Promise<void> {
  const exists = async (id: number) => (await pool.query("SELECT 1 FROM processes WHERE id = $1", [id])).rowCount === 1;

  app.get<{ Params: { id: string }; Querystring: { from?: string; to?: string } }>("/processes/:id/day-notes", async (request, reply) => {
    const id = Number(request.params.id);
    if (!(await exists(id))) return reply.code(404).send({ error: "process not found" });
    const from = request.query.from ?? today();
    const to = request.query.to ?? plusDays(from, DEFAULT_DAYS);
    if (!DAY.test(from) || !DAY.test(to)) return reply.code(400).send({ error: "from / to YYYY-MM-DD" });
    return { today: today(), notes: await dayNotesOf([id], from, to) };
  });

  app.post<{ Params: { id: string } }>("/processes/:id/day-notes", async (request, reply) => {
    const id = Number(request.params.id);
    if (!(await exists(id))) return reply.code(404).send({ error: "process not found" });
    const input = dayNoteInput(request.body, false);
    if ("error" in input) return reply.code(400).send(input);
    const out = await writeDayNote(id, "add", null, input.fields, "user", request.user.sub);
    return reply.code(201).send({ id: out.id });
  });

  app.patch<{ Params: { id: string; noteId: string } }>("/processes/:id/day-notes/:noteId", async (request, reply) => {
    const input = dayNoteInput(request.body, true);
    if ("error" in input) return reply.code(400).send(input);
    const out = await writeDayNote(Number(request.params.id), "update", Number(request.params.noteId), input.fields, "user", request.user.sub);
    return out.status === 200 ? { id: out.id } : reply.code(out.status).send({ error: out.error });
  });

  app.delete<{ Params: { id: string; noteId: string } }>("/processes/:id/day-notes/:noteId", async (request, reply) => {
    const out = await writeDayNote(Number(request.params.id), "delete", Number(request.params.noteId), {}, "user", request.user.sub);
    return out.status === 200 ? { status: "ok" } : reply.code(out.status).send({ error: out.error });
  });
}
