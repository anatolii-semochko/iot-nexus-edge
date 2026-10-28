import type { FastifyInstance, FastifyRequest } from "fastify";

import { can } from "../access/principal.js";
import { scopeFilter } from "../access/scope.js";
import { requireAdmin, requireAuth } from "../auth.js";
import { pool } from "../db.js";
import { config } from "../config.js";
import type { MultipartFile } from "@fastify/multipart";

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
  // "auto" | "scaled" | an avatar's key (migrations/1690000000066)
  preview: string;
  // the component's own parameters (migration 084) - e.g. { nodeId } - a part of its process
  params: Record<string, unknown>;
  // "none" | "border" | "filled" | null - the type's default (migration 085)
  frame: string | null;
  // its own pictures (migration 091): useImage, imageScalePct, backgroundOpacityPct; icon / background -
  // { at } when uploaded (dashboard_card_images; `at` busts the browser's cache)
  picture: Picture;
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
  preview?: string;
  params?: Record<string, unknown>;
  frame?: string | null;
  picture?: Partial<Pick<Picture, "useImage" | "hidden" | "imageScalePct" | "backgroundOpacityPct" | "backgroundScalePct">>;
}

interface Picture {
  useImage?: boolean;
  hidden?: boolean; // no picture at all (the background only, if any)
  imageScalePct?: number;
  backgroundOpacityPct?: number;
  backgroundScalePct?: number; // 100 - covers the block; over - larger (its middle seen), under - smaller
  icon?: { at: number };
  background?: { at: number };
}

const SLOTS = ["icon", "background"];
const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

/** The picture's settings from a request merged over the stored ones (the uploads' marks kept). */
const pictureOf = (current: Picture | undefined, body: CardBody["picture"]): Picture => {
  const next: Picture = { ...(current ?? {}) };
  if (!body) return next;
  if (typeof body.useImage === "boolean") next.useImage = body.useImage;
  if (typeof body.hidden === "boolean") next.hidden = body.hidden;
  // over 100 % - larger than the block (its middle seen)
  if (Number.isFinite(body.imageScalePct)) next.imageScalePct = Math.max(10, Math.min(300, Number(body.imageScalePct)));
  if (Number.isFinite(body.backgroundScalePct)) next.backgroundScalePct = Math.max(10, Math.min(300, Number(body.backgroundScalePct)));
  if (Number.isFinite(body.backgroundOpacityPct)) next.backgroundOpacityPct = Math.max(0, Math.min(100, Number(body.backgroundOpacityPct)));
  return next;
};

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
  params: row.params ?? {},
  frame: row.frame,
  picture: row.picture ?? {},
});

/**
 * The cards a person sees (B1; by the role since 2026-10-27): whoever arranges the dashboard
 * (dashboard.manage) sees all; else a card shows when it is in the role's list (`roles.dashboard`, null -
 * all) and its object is seen - a process's card where the person sees the process, the core's own
 * cards ("system.<section>") with that section's view (processes / nodes / logs); a hidden folder hides
 * its subtree, a folder with nothing visible inside is hidden.
 */
async function visibleCards(request: FastifyRequest, rows: CardRow[]): Promise<CardRow[]> {
  const principal = request.principal;
  if (!principal || principal.kind === "service" || can(principal, "dashboard.manage")) return rows;
  const cards = principal.dashboardCards;
  const scope = await scopeFilter(request, "processes.view");
  const objectSeen = (r: CardRow) => {
    if (r.process_id !== null) return !scope || scope.process(r.process_id);
    const section = r.component_key?.startsWith("system.") ? r.component_key.slice("system.".length) : null;
    return section === null || can(principal, `${section}.view`);
  };
  const own = (r: CardRow) => (cards === null || cards.has(r.id)) && (r.type === "folder" || objectSeen(r));
  const children = new Map<number | null, CardRow[]>();
  for (const r of rows) children.set(r.parent_id, [...(children.get(r.parent_id) ?? []), r]);
  const shown: CardRow[] = [];
  // a card's subtree - the visible ones; true when something in it is a visible component
  const walk = (r: CardRow): boolean => {
    if (!own(r)) return false;
    if (r.type !== "folder") return shown.push(r) > 0;
    const at = shown.length;
    shown.push(r);
    const any = (children.get(r.id) ?? []).map(walk).some(Boolean);
    if (!any) shown.splice(at); // nothing to see inside
    return any;
  };
  (children.get(null) ?? []).forEach(walk);
  const ids = new Set(shown.map((r) => r.id));
  return rows.filter((r) => ids.has(r.id));
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

const MAX_PARAMS_CHARS = 2000;
const FRAMES = ["none", "border", "filled", "caption"];

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
  if (body.preview !== undefined && !/^[A-Za-z0-9_.-]{1,64}$/.test(body.preview))
    return 'preview must be "auto", "scaled" or an avatar\'s key';
  if (body.params !== undefined && (body.params === null || typeof body.params !== "object" || Array.isArray(body.params) || JSON.stringify(body.params).length > MAX_PARAMS_CHARS))
    return "params must be an object (a component's own parameters)";
  if (body.frame !== undefined && body.frame !== null && !FRAMES.includes(body.frame)) return "frame must be none, border, filled, caption or null";
  return null;
};

export async function dashboardCardRoutes(app: FastifyInstance): Promise<void> {
  app.get("/dashboard-cards", { preHandler: requireAuth }, async (request) => {
    const rows = (
      await pool.query<CardRow>(
        "SELECT * FROM dashboard_cards ORDER BY parent_id NULLS FIRST, position, id",
      )
    ).rows;
    return (await visibleCards(request, rows)).map(toCard);
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
          `INSERT INTO dashboard_cards (parent_id, position, type, title, icon, layout, component_key, process_id, view, preview, params, frame)
         SELECT $1, COALESCE(MAX(position) + 1, 0), $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
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
            JSON.stringify(type === "component" ? (body.params ?? {}) : {}),
            body.frame ?? null,
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
           type = $4, title = $5, icon = $6, layout = $7, component_key = $8, process_id = $9, view = $10, preview = $11, params = $12, frame = $13, picture = $14,
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
            JSON.stringify(type === "component" ? (body.params ?? current.params ?? {}) : {}),
            body.frame !== undefined ? body.frame : current.frame,
            JSON.stringify(pictureOf(current.picture, body.picture)),
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

  // a card's own picture / background (migration 091): read by whoever sees the dashboard, set by its admins
  app.get<{ Params: { id: string; slot: string } }>("/dashboard-cards/:id/images/:slot", { preHandler: requireAuth }, async (request, reply) => {
    if (!SLOTS.includes(request.params.slot)) return reply.code(404).send({ error: "no such picture" });
    const row = (await pool.query<{ mime: string; data: Buffer; updated_at: Date }>("SELECT mime, data, updated_at FROM dashboard_card_images WHERE card_id = $1 AND slot = $2", [Number(request.params.id), request.params.slot])).rows[0];
    if (!row) return reply.code(404).send({ error: "no such picture" });
    // the URL carries the upload's time - cached for long
    return reply.header("Content-Type", row.mime).header("Cache-Control", "private, max-age=86400").send(row.data);
  });

  app.post<{ Params: { id: string; slot: string } }>("/dashboard-cards/:id/images/:slot", { preHandler: requireAdmin }, async (request, reply) => {
    const id = Number(request.params.id);
    const slot = request.params.slot;
    if (!SLOTS.includes(slot)) return reply.code(404).send({ error: "no such picture" });
    const current = (await pool.query<CardRow>("SELECT * FROM dashboard_cards WHERE id = $1", [id])).rows[0];
    if (!current) return reply.code(404).send({ error: "card not found" });
    const file: MultipartFile | undefined = await request.file({ limits: { fileSize: config.uploads.dashboardImageMaxBytes } });
    if (!file) return reply.code(400).send({ error: "the image file is required" });
    if (!IMAGE_TYPES.has(file.mimetype)) return reply.code(400).send({ error: "the image must be PNG, JPEG, WebP or GIF" });
    const data = await file.toBuffer();
    if (file.file.truncated) return reply.code(413).send({ error: `the image is over ${Math.round(config.uploads.dashboardImageMaxBytes / 1024)} KB` });
    await pool.query(
      `INSERT INTO dashboard_card_images (card_id, slot, mime, data) VALUES ($1, $2, $3, $4)
       ON CONFLICT (card_id, slot) DO UPDATE SET mime = $3, data = $4, updated_at = now()`,
      [id, slot, file.mimetype, data],
    );
    const picture: Picture = { ...(current.picture ?? {}), [slot]: { at: Date.now() }, ...(slot === "icon" ? { useImage: true } : {}) };
    const row = (await pool.query<CardRow>("UPDATE dashboard_cards SET picture = $2, updated_at = now() WHERE id = $1 RETURNING *", [id, JSON.stringify(picture)])).rows[0];
    return toCard(row);
  });

  app.delete<{ Params: { id: string; slot: string } }>("/dashboard-cards/:id/images/:slot", { preHandler: requireAdmin }, async (request, reply) => {
    const id = Number(request.params.id);
    const slot = request.params.slot;
    if (!SLOTS.includes(slot)) return reply.code(404).send({ error: "no such picture" });
    const current = (await pool.query<CardRow>("SELECT * FROM dashboard_cards WHERE id = $1", [id])).rows[0];
    if (!current) return reply.code(404).send({ error: "card not found" });
    await pool.query("DELETE FROM dashboard_card_images WHERE card_id = $1 AND slot = $2", [id, slot]);
    const picture: Picture = { ...(current.picture ?? {}) };
    delete picture[slot as "icon" | "background"];
    if (slot === "icon") picture.useImage = false;
    const row = (await pool.query<CardRow>("UPDATE dashboard_cards SET picture = $2, updated_at = now() WHERE id = $1 RETURNING *", [id, JSON.stringify(picture)])).rows[0];
    return toCard(row);
  });

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
