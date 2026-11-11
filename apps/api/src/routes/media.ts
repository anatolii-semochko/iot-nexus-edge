// Media Store routes (AGENTS.md section 81).
//
// - PUT  /media/edgex/:edgexDeviceName?ext=jpg   gateway -> store (internal,
//   raw body). The only way media enters from a real device: the gateway
//   (apps/device-service) receives the blob over MQTT, uploads it here and
//   pushes the returned id as the device's value.
// - GET  /devices/:id/media                      list (newest first, paged)
// - GET  /devices/:id/media/:mediaId             the original file
// - GET  /devices/:id/media/:mediaId/:part       one part (e.g. preview.jpg)
// - DELETE /devices/:id/media/:mediaId           the whole entry
// - POST /devices/:id/media/simulate             UI upload for a simulated
//   media device: store + set it as the device's value, exactly like a
//   real device would (processes can't tell the difference).

import type { MultipartFile } from "@fastify/multipart";
import type { FastifyInstance, FastifyReply } from "fastify";

import { requireAuth } from "../auth.js";
import { logCommand } from "../commandLog.js";
import { config } from "../config.js";
import * as dualDevicesModel from "../dualDevicesModel.js";
import { EdgeXError, writeValue } from "../edgex.js";
import { FileStoreError } from "../fileStore.js";
import {
  contentTypeForPart,
  extensionForMimeType,
  MEDIA_TYPES,
  mediaScope,
  mediaStore,
  originalPartName,
  originalPartOf,
} from "../mediaStore.js";
import { findActiveDevicesByEdgexName, findDevice, requireEdgeXDevice } from "./devices.js";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

function sendStoreError(reply: FastifyReply, err: unknown) {
  if (err instanceof FileStoreError) return reply.code(err.statusCode).send({ error: err.message });
  throw err;
}

export async function mediaRoutes(app: FastifyInstance): Promise<void> {
  // Raw binary bodies for the gateway upload only - scoped to this plugin,
  // sized to the Media Store's own per-file limit.
  app.addContentTypeParser(
    ["application/octet-stream", ...Object.values(MEDIA_TYPES).filter((t) => t !== "application/json")],
    { parseAs: "buffer", bodyLimit: config.media.maxFileBytes },
    (_request, body, done) => done(null, body),
  );

  // Gateway-facing, unauthenticated like the orchestrator's own .../auto
  // write path: service-to-service auth doesn't exist on the platform yet
  // (AGENTS.md section 13) - like .../auto, it is reachable through the
  // UI's /api proxy too, and gets closed by the same platform-wide
  // authorization task, not piecemeal here.
  app.put<{ Params: { edgexDeviceName: string }; Querystring: { ext?: string } }>(
    "/media/edgex/:edgexDeviceName",
    async (request, reply) => {
      const ext = request.query.ext ?? "jpg";
      if (!MEDIA_TYPES[ext]) return reply.code(400).send({ error: `unsupported media extension "${ext}"` });
      if (!Buffer.isBuffer(request.body) || request.body.length === 0) {
        return reply.code(400).send({ error: "request body must be the raw media bytes" });
      }
      // Same routing rule as pushed readings: only the Device whose active
      // registration this is (a node switched to simulated mode doesn't get
      // its physical twin's frames).
      const [device] = await findActiveDevicesByEdgexName(request.params.edgexDeviceName);
      if (!device) return reply.code(409).send({ error: "no active Device for this EdgeX device" });
      try {
        const entry = await mediaStore.create(mediaScope(device.id), originalPartName(ext), request.body);
        return { mediaId: entry.id, deviceId: device.id };
      } catch (err) {
        return sendStoreError(reply, err);
      }
    },
  );

  app.get<{ Params: { id: string }; Querystring: { offset?: string; limit?: string; from?: string; to?: string } }>(
    "/devices/:id/media",
    async (request, reply) => {
      const device = await findDevice(request.params.id);
      if (!device) return reply.code(404).send({ error: "device not found" });
      const offset = Math.max(0, Number(request.query.offset ?? 0) || 0);
      const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(request.query.limit ?? DEFAULT_PAGE_SIZE) || DEFAULT_PAGE_SIZE));
      try {
        return await mediaStore.list(mediaScope(device.id), { offset, limit, from: request.query.from, to: request.query.to });
      } catch (err) {
        return sendStoreError(reply, err);
      }
    },
  );

  const servePart = async (reply: FastifyReply, deviceId: number, mediaId: string, part: string | undefined) => {
    try {
      const scope = mediaScope(deviceId);
      let resolved = part;
      if (!resolved) {
        const entry = await mediaStore.get(scope, mediaId);
        resolved = entry ? originalPartOf(entry) : undefined;
        if (!resolved) return reply.code(404).send({ error: "media not found" });
      }
      const data = await mediaStore.readPart(scope, mediaId, resolved);
      // Entries never change once written (a new capture is a new id), so
      // the browser may cache them for good.
      return reply
        .header("content-type", contentTypeForPart(resolved))
        .header("cache-control", "private, max-age=31536000, immutable")
        .send(data);
    } catch (err) {
      return sendStoreError(reply, err);
    }
  };

  app.get<{ Params: { id: string; mediaId: string } }>("/devices/:id/media/:mediaId", async (request, reply) => {
    const device = await findDevice(request.params.id);
    if (!device) return reply.code(404).send({ error: "device not found" });
    return servePart(reply, device.id, request.params.mediaId, undefined);
  });

  app.get<{ Params: { id: string; mediaId: string; part: string } }>(
    "/devices/:id/media/:mediaId/:part",
    async (request, reply) => {
      const device = await findDevice(request.params.id);
      if (!device) return reply.code(404).send({ error: "device not found" });
      return servePart(reply, device.id, request.params.mediaId, request.params.part);
    },
  );

  app.delete<{ Params: { id: string; mediaId: string } }>(
    "/devices/:id/media/:mediaId",
    { preHandler: requireAuth },
    async (request, reply) => {
      const device = await findDevice(request.params.id);
      if (!device) return reply.code(404).send({ error: "device not found" });
      try {
        const removed = await mediaStore.remove(mediaScope(device.id), request.params.mediaId);
        return removed ? reply.code(204).send() : reply.code(404).send({ error: "media not found" });
      } catch (err) {
        return sendStoreError(reply, err);
      }
    },
  );

  // Media counterpart of PUT /devices/:id/simulate (routes/devices.ts) - a
  // file instead of a typed value: stored first, then its id written as the
  // device's value through the same EdgeX + publishReading path, so the
  // live UI and any process hook (AGENTS.md section 80) see it exactly as
  // they would a real device's upload.
  app.post<{ Params: { id: string } }>(
    "/devices/:id/media/simulate",
    { preHandler: requireAuth },
    async (request, reply) => {
      const device = await requireEdgeXDevice(request.params.id, reply);
      if (!device) return;
      if (!device.capabilities.readOnly || !device.capabilities.media) {
        return reply.code(400).send({ error: `device '${device.name}' is not a read-only media device` });
      }
      if (!device.capabilities.edgexResource) {
        return reply.code(409).send({ error: "device has no edgexResource configured" });
      }

      const file: MultipartFile | undefined = await request.file({ limits: { fileSize: config.media.maxFileBytes } });
      if (!file) return reply.code(400).send({ error: "a media file is required" });
      const ext = extensionForMimeType(file.mimetype);
      if (!ext) return reply.code(400).send({ error: `unsupported media type "${file.mimetype}"` });
      const buffer = await file.toBuffer();
      if (file.file.truncated) return reply.code(413).send({ error: "file exceeds the maximum allowed size" });

      let mediaId: string;
      try {
        mediaId = (await mediaStore.create(mediaScope(device.id), originalPartName(ext), buffer)).id;
      } catch (err) {
        return sendStoreError(reply, err);
      }

      await logCommand({ deviceId: device.id, action: "simulate", value: mediaId, source: "api", actorUserId: request.user.sub });
      try {
        await writeValue(device.resolvedEdgexName, device.capabilities.edgexResource, mediaId);
      } catch (err) {
        if (err instanceof EdgeXError) {
          return reply.code(err.status >= 400 && err.status < 500 ? err.status : 502).send({ error: err.message });
        }
        throw err;
      }
      await dualDevicesModel.publishReading(device.id, mediaId, "api");
      return { mediaId };
    },
  );
}
