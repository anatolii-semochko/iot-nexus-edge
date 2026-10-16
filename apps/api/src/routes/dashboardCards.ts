import type { FastifyInstance } from "fastify";

import { requireAdmin, requireAuth, type JwtPayload } from "../auth.js";
import { pool } from "../db.js";

// Dashboard cards (migrations/1690000000058) - the Dashboard page's tree:
// read by every signed-in user (the cards they may see), edited by admins
// only (Service -> Config -> Dashboard; the Service page is admin-only).
// The list is flat (tens of rows) - the UI builds the tree from
// `parentId`, siblings ordered by `position`.

interface CardRow {
  id: number;
  parent_id: number | null;
  position: number;
  type: "folder" | "component";
  title: string;
  icon: string | null;
  layout: "blocks" | "list";
  component_key: string | null;
  process_id: number | null;
  view: "fit-height" | "fit-width";
  preview: "auto" | "scaled";
  access_group_ids: number[];
  created_at: string;
  updated_at: string;
}

interface CardBody {
  parentId?: number | null;
  type?: "folder" | "component";
  title?: string;
  icon?: string | null;
  layout?: "blocks" | "list";
  componentKey?: string | null;
  processId?: number | null;
  view?: "fit-height" | "fit-width";
  preview?: "auto" | "scaled";
}

const toCard = (row: CardRow) => ({
  id: row.id,
  parentId: row.parent_id,
  position: row.position,
  type: row.type,
  title: row.title,
  icon: row.icon,
  layout: row.layout,
  componentKey: row.component_key,
  processId: row.process_id,
  view: row.view,
  preview: row.preview,
  accessGroupIds: row.access_group_ids,
});

/**
 * Whether `user` may see `card`. STUB: the system has no user groups yet
 * (users carry `roles` only), so every signed-in user sees every card.
 * TODO(access rights package, AGENTS_TO_DO.md "Доступи / права"): a card
 * with `access_group_ids` is visible to the members of any of them (an
 * admin - always); a folder hidden hides its subtree.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- the stub's parameters are its contract
function cardVisibleTo(card: CardRow, user: JwtPayload): boolean {
  return true;
}

/** `parentId` would put `id` inside its own subtree. */
async function wouldCycle(
  id: number,
  parentId: number | null,
): Promise<boolean> {
  let current = parentId;
  while (current !== null) {
    if (current === id) return true;
    const row = (
      await pool.query<{ parent_id: number | null }>(
        "SELECT parent_id FROM dashboard_cards WHERE id = $1",
        [current],
      )
    ).rows[0];
    current = row ? row.parent_id : null;
  }
  return false;
}

const problemOf = (body: CardBody, type: string | undefined): string | null => {
  if (body.title !== undefined && !body.title.trim())
    return "title is required";
  if (type !== undefined && type !== "folder" && type !== "component")
    return "type must be folder or component";
  if (
    type === "component" &&
    body.componentKey !== undefined &&
    !body.componentKey
  )
    return "a component card needs its component";
  return null;
};

export async function dashboardCardRoutes(app: FastifyInstance): Promise<void> {
  app.get("/dashboard-cards", { preHandler: requireAuth }, async (request) => {
    const rows = (
      await pool.query<CardRow>(
        "SELECT * FROM dashboard_cards ORDER BY parent_id NULLS FIRST, position, id",
      )
    ).rows;
    const user = request.user as JwtPayload;
    return rows.filter((row) => cardVisibleTo(row, user)).map(toCard);
  });

  app.post<{ Body: CardBody }>(
    "/dashboard-cards",
    { preHandler: requireAdmin },
    async (request, reply) => {
      const body = request.body ?? {};
      const type = body.type ?? "folder";
      const problem =
        problemOf(body, type) ??
        (!body.title ? "title is required" : null) ??
        (type === "component" && !body.componentKey
          ? "a component card needs its component"
          : null);
      if (problem) return reply.code(400).send({ error: problem });
      const parentId = body.parentId ?? null;
      // the new card goes last among its siblings (computed inside the INSERT)
      const row = (
        await pool.query<CardRow>(
          `INSERT INTO dashboard_cards (parent_id, position, type, title, icon, layout, component_key, process_id, view, preview)
         SELECT $1, COALESCE(MAX(position) + 1, 0), $2, $3, $4, $5, $6, $7, $8, $9
         FROM dashboard_cards WHERE parent_id IS NOT DISTINCT FROM $1
         RETURNING *`,
          [
            parentId,
            type,
            body.title!.trim(),
            body.icon ?? null,
            body.layout ?? "blocks",
            type === "component" ? body.componentKey : null,
            type === "component" ? (body.processId ?? null) : null,
            body.view ?? "fit-height",
            body.preview ?? "auto",
          ],
        )
      ).rows[0];
      return reply.code(201).send(toCard(row));
    },
  );

  // Edit and / or move to another parent (last among its new siblings)
  app.patch<{ Params: { id: string }; Body: CardBody }>(
    "/dashboard-cards/:id",
    { preHandler: requireAdmin },
    async (request, reply) => {
      const id = Number(request.params.id);
      const body = request.body ?? {};
      const current = (
        await pool.query<CardRow>(
          "SELECT * FROM dashboard_cards WHERE id = $1",
          [id],
        )
      ).rows[0];
      if (!current) return reply.code(404).send({ error: "card not found" });
      const problem = problemOf(body, body.type);
      if (problem) return reply.code(400).send({ error: problem });
      const moving =
        body.parentId !== undefined && body.parentId !== current.parent_id;
      if (moving && (await wouldCycle(id, body.parentId ?? null)))
        return reply.code(400).send({ error: "a card can't go inside itself" });
      const type = body.type ?? current.type;
      const row = (
        await pool.query<CardRow>(
          `UPDATE dashboard_cards SET
           parent_id = $2,
           position = CASE WHEN $3 THEN (SELECT COALESCE(MAX(position) + 1, 0) FROM dashboard_cards WHERE parent_id IS NOT DISTINCT FROM $2) ELSE position END,
           type = $4, title = $5, icon = $6, layout = $7, component_key = $8, process_id = $9, view = $10, preview = $11,
           updated_at = now()
         WHERE id = $1 RETURNING *`,
          [
            id,
            moving ? (body.parentId ?? null) : current.parent_id,
            moving,
            type,
            body.title !== undefined ? body.title.trim() : current.title,
            body.icon !== undefined ? body.icon : current.icon,
            body.layout ?? current.layout,
            type === "component"
              ? body.componentKey !== undefined
                ? body.componentKey
                : current.component_key
              : null,
            type === "component"
              ? body.processId !== undefined
                ? body.processId
                : current.process_id
              : null,
            body.view ?? current.view,
            body.preview ?? current.preview,
          ],
        )
      ).rows[0];
      if (row.type === "component" && !row.component_key)
        return reply
          .code(400)
          .send({ error: "a component card needs its component" });
      return toCard(row);
    },
  );

  // A card and its whole subtree (ON DELETE CASCADE)
  app.delete<{ Params: { id: string } }>(
    "/dashboard-cards/:id",
    { preHandler: requireAdmin },
    async (request, reply) => {
      const result = await pool.query(
        "DELETE FROM dashboard_cards WHERE id = $1",
        [request.params.id],
      );
      if (result.rowCount === 0)
        return reply.code(404).send({ error: "card not found" });
      return reply.code(204).send();
    },
  );

  // Up / down among its siblings: swaps positions with the neighbour (the
  // siblings are renumbered first, so gaps or ties never block a move)
  app.post<{ Params: { id: string }; Body: { direction: "up" | "down" } }>(
    "/dashboard-cards/:id/move",
    { preHandler: requireAdmin },
    async (request, reply) => {
      const id = Number(request.params.id);
      const direction = request.body?.direction;
      if (direction !== "up" && direction !== "down")
        return reply.code(400).send({ error: "direction must be up or down" });
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const card = (
          await client.query<CardRow>(
            "SELECT * FROM dashboard_cards WHERE id = $1 FOR UPDATE",
            [id],
          )
        ).rows[0];
        if (!card) {
          await client.query("ROLLBACK");
          return reply.code(404).send({ error: "card not found" });
        }
        const siblings = (
          await client.query<{ id: number }>(
            "SELECT id FROM dashboard_cards WHERE parent_id IS NOT DISTINCT FROM $1 ORDER BY position, id",
            [card.parent_id],
          )
        ).rows.map((r) => r.id);
        const i = siblings.indexOf(id);
        const j = direction === "up" ? i - 1 : i + 1;
        if (j >= 0 && j < siblings.length)
          [siblings[i], siblings[j]] = [siblings[j], siblings[i]];
        for (const [position, siblingId] of siblings.entries()) {
          await client.query(
            "UPDATE dashboard_cards SET position = $1, updated_at = now() WHERE id = $2",
            [position, siblingId],
          );
        }
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
      return { status: "ok" };
    },
  );
}
