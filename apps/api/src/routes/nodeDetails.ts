// A node's details for its information popup (AGENTS_TO_DO.md 2026-10-20,
// X1): which of its type's Library models it is, where it stands (the map),
// a photo of the real unit (Media Store, the node's own scope). One read
// route gathers everything the popup shows; the writes are the engineer's
// (nodes.manage - the access guard's /nodes prefix).

import type { MultipartFile } from "@fastify/multipart";
import type { FastifyInstance, FastifyReply } from "fastify";

import { config } from "../config.js";
import { pool } from "../db.js";
import { FileStoreError } from "../fileStore.js";
import { getLibraryModels } from "../libraryCatalog.js";
import { contentTypeForPart, extensionForMimeType, mediaStore, nodeMediaScope, originalPartName, originalPartOf } from "../mediaStore.js";

interface DetailsRow {
  id: number;
  name: string;
  type: string;
  location: string | null;
  model: string | null;
  latitude: number | null;
  longitude: number | null;
  photo_media_id: string | null;
}

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

function sendStoreError(reply: FastifyReply, err: unknown) {
  if (err instanceof FileStoreError) return reply.code(err.statusCode).send({ error: err.message });
  throw err;
}

const findDetails = async (id: string) =>
  (
    await pool.query<DetailsRow>(
      "SELECT id, name, type, location, model, latitude, longitude, photo_media_id FROM nodes WHERE id = $1",
      [id],
    )
  ).rows[0];

export async function nodeDetailsRoutes(app: FastifyInstance): Promise<void> {
  // Everything the information popup shows: the node, its type (the Library
  // item), the model (the node's own, else the type's first), the photo's
  // URL and the point on the map.
  app.get<{ Params: { id: string } }>("/nodes/:id/info", async (request, reply) => {
    const node = await findDetails(request.params.id);
    if (!node) return reply.code(404).send({ error: "node not found" });
    const item = (
      await pool.query<{ id: string; name: string; description: string | null; icon_path: string | null; folder_path: string }>(
        "SELECT id, name, description, icon_path, folder_path FROM library_items WHERE kind = 'node' AND type_name = $1 LIMIT 1",
        [node.type],
      )
    ).rows[0];
    const models = item ? await getLibraryModels(item.folder_path) : [];
    return {
      node: { id: node.id, name: node.name, type: node.type, location: node.location },
      type: item ? { id: item.id, name: item.name, description: item.description, iconPath: item.icon_path } : null,
      model: models.find((m) => m.key === node.model) ?? models[0] ?? null,
      models: models.map((m) => ({ key: m.key, name: m.name })),
      photo: node.photo_media_id ? `/nodes/${node.id}/photo` : null,
      position: node.latitude !== null && node.longitude !== null ? { latitude: node.latitude, longitude: node.longitude } : null,
    };
  });

  // The model (a key of the type's models, null - the type's first) and the
  // point on the map (both or neither).
  app.patch<{ Params: { id: string }; Body: { model?: string | null; latitude?: number | null; longitude?: number | null } }>(
    "/nodes/:id/details",
    async (request, reply) => {
      const node = await findDetails(request.params.id);
      if (!node) return reply.code(404).send({ error: "node not found" });
      const { model, latitude, longitude } = request.body ?? {};
      const lat = latitude ?? null;
      const lon = longitude ?? null;
      if ((lat === null) !== (lon === null)) return reply.code(400).send({ error: "latitude and longitude go together" });
      if (lat !== null && (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lon) || lon! < -180 || lon! > 180))
        return reply.code(400).send({ error: "latitude -90..90, longitude -180..180" });
      if (model !== undefined && model !== null && typeof model !== "string") return reply.code(400).send({ error: "model must be a key" });
      await pool.query("UPDATE nodes SET model = $1, latitude = $2, longitude = $3, updated_at = now() WHERE id = $4", [
        model === undefined ? node.model : model || null,
        latitude === undefined ? node.latitude : lat,
        longitude === undefined ? node.longitude : lon,
        node.id,
      ]);
      return { status: "ok" };
    },
  );

  app.get<{ Params: { id: string } }>("/nodes/:id/photo", async (request, reply) => {
    const node = await findDetails(request.params.id);
    if (!node?.photo_media_id) return reply.code(404).send({ error: "no photo" });
    try {
      const entry = await mediaStore.get(nodeMediaScope(node.id), node.photo_media_id);
      const part = entry ? originalPartOf(entry) : undefined;
      if (!entry || !part) return reply.code(404).send({ error: "no photo" });
      const data = await mediaStore.readPart(nodeMediaScope(node.id), entry.id, part);
      return reply.header("Cache-Control", "private, max-age=3600").type(contentTypeForPart(part)).send(data);
    } catch (err) {
      return sendStoreError(reply, err);
    }
  });

  // A new photo replaces the old one (the old one removed).
  app.put<{ Params: { id: string } }>("/nodes/:id/photo", async (request, reply) => {
    const node = await findDetails(request.params.id);
    if (!node) return reply.code(404).send({ error: "node not found" });
    const file: MultipartFile | undefined = await request.file({ limits: { fileSize: config.media.maxFileBytes } });
    if (!file) return reply.code(400).send({ error: "a photo is required" });
    const ext = IMAGE_TYPES.includes(file.mimetype) ? extensionForMimeType(file.mimetype) : undefined;
    if (!ext) return reply.code(400).send({ error: `unsupported image type "${file.mimetype}" - JPEG, PNG or WebP` });
    const buffer = await file.toBuffer();
    if (file.file.truncated) return reply.code(413).send({ error: "file exceeds the maximum allowed size" });
    try {
      const entry = await mediaStore.create(nodeMediaScope(node.id), originalPartName(ext), buffer);
      await pool.query("UPDATE nodes SET photo_media_id = $1, updated_at = now() WHERE id = $2", [entry.id, node.id]);
      if (node.photo_media_id) await mediaStore.remove(nodeMediaScope(node.id), node.photo_media_id);
    } catch (err) {
      return sendStoreError(reply, err);
    }
    return { status: "ok" };
  });

  app.delete<{ Params: { id: string } }>("/nodes/:id/photo", async (request, reply) => {
    const node = await findDetails(request.params.id);
    if (!node) return reply.code(404).send({ error: "node not found" });
    if (node.photo_media_id) {
      await pool.query("UPDATE nodes SET photo_media_id = NULL, updated_at = now() WHERE id = $1", [node.id]);
      try {
        await mediaStore.remove(nodeMediaScope(node.id), node.photo_media_id);
      } catch (err) {
        return sendStoreError(reply, err);
      }
    }
    return { status: "ok" };
  });
}
