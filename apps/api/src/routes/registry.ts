import type { FastifyInstance, FastifyReply } from "fastify";

import { requireAuth } from "../auth.js";
import { createDevice, createNode, deleteDevice, deleteNode, nodeTypeOf, RegistryError, type NewDevice, type NewNode } from "../registry.js";

// The Device Registry's writes (registry.ts - Nexus Edge AI Assistant,
// stage 8): a node of a Library node type with the devices its node.yaml
// declares (all, or `roles`), a single device, and deleting either (a
// node - with its devices; EdgeX registrations go with them). The AI
// Assistant's Install proposals make the same calls (ai/proposals.ts).

const failed = (reply: FastifyReply, err: unknown) => {
  if (err instanceof RegistryError) return reply.code(err.statusCode).send({ error: err.message });
  // a unique name taken (nodes.name, devices' EdgeX name)
  if ((err as { code?: string }).code === "23505") return reply.code(409).send({ error: (err as { detail?: string }).detail ?? "already exists" });
  throw err;
};

export async function registryRoutes(app: FastifyInstance): Promise<void> {
  // a node type's declaration (node.yaml) - what "Add node" offers: its parents, bus, devices by role
  app.get<{ Params: { type: string } }>("/registry/node-types/:type", { preHandler: requireAuth }, async (request, reply) => {
    try {
      const t = await nodeTypeOf(request.params.type);
      return { type: request.params.type, name: t.name, bus: t.bus?.type ?? null, parents: t.parents ?? [], devices: t.devices ?? [] };
    } catch (err) {
      return failed(reply, err);
    }
  });

  app.post<{ Body: NewNode }>("/nodes", { preHandler: requireAuth }, async (request, reply) => {
    try {
      return await createNode(request.body ?? ({} as NewNode), request.user.sub, "api");
    } catch (err) {
      return failed(reply, err);
    }
  });

  app.delete<{ Params: { id: string } }>("/nodes/:id", { preHandler: requireAuth }, async (request, reply) => {
    try {
      await deleteNode(Number(request.params.id), request.user.sub, "api");
      return { status: "ok" };
    } catch (err) {
      return failed(reply, err);
    }
  });

  app.post<{ Body: NewDevice }>("/devices", { preHandler: requireAuth }, async (request, reply) => {
    try {
      return { id: await createDevice(request.body ?? ({} as NewDevice), request.user.sub, "api") };
    } catch (err) {
      return failed(reply, err);
    }
  });

  app.delete<{ Params: { id: string } }>("/devices/:id", { preHandler: requireAuth }, async (request, reply) => {
    try {
      await deleteDevice(Number(request.params.id), request.user.sub, "api");
      return { status: "ok" };
    } catch (err) {
      return failed(reply, err);
    }
  });
}
