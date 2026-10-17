import type { FastifyInstance } from "fastify";

import { connectionProblem, deleteConnection, listConnections, saveConnection, clientFor, type ConnectionInput } from "../ai/connections.js";
import { secretsAvailable } from "../ai/secrets.js";
import { requireAdmin, type JwtPayload } from "../auth.js";

// AI connections (ai/connections.ts; Service -> Config -> AI), admin only:
// list (no keys - `hasKey`), create, edit (`apiKey` absent - kept, null /
// "" - removed), delete, test (a one-line completion: the model answers,
// how long it took, the tokens). `secretsAvailable` - whether a key can be
// stored at all (AI_SECRETS_KEY in .env).

export async function aiRoutes(app: FastifyInstance): Promise<void> {
  app.get("/ai/connections", { preHandler: requireAdmin }, async () => ({
    connections: await listConnections(),
    secretsAvailable: secretsAvailable(),
  }));

  app.post<{ Body: ConnectionInput }>("/ai/connections", { preHandler: requireAdmin }, async (request, reply) => {
    const body = request.body ?? {};
    const problem = connectionProblem(body, true);
    if (problem) return reply.code(400).send({ error: problem });
    try {
      return await saveConnection(null, body, (request.user as JwtPayload).sub);
    } catch (err) {
      if ((err as { code?: string }).code === "23505") return reply.code(409).send({ error: "a connection with this name exists" });
      throw err;
    }
  });

  app.patch<{ Params: { id: string }; Body: ConnectionInput }>("/ai/connections/:id", { preHandler: requireAdmin }, async (request, reply) => {
    const body = request.body ?? {};
    const problem = connectionProblem(body, false);
    if (problem) return reply.code(400).send({ error: problem });
    try {
      return await saveConnection(Number(request.params.id), body, (request.user as JwtPayload).sub);
    } catch (err) {
      const e = err as { code?: string; statusCode?: number; message: string };
      if (e.statusCode === 404) return reply.code(404).send({ error: e.message });
      if (e.code === "23505") return reply.code(409).send({ error: "a connection with this name exists" });
      throw err;
    }
  });

  app.delete<{ Params: { id: string } }>("/ai/connections/:id", { preHandler: requireAdmin }, async (request, reply) =>
    (await deleteConnection(Number(request.params.id))) ? { status: "ok" } : reply.code(404).send({ error: "connection not found" }),
  );

  app.post<{ Params: { id: string } }>("/ai/connections/:id/test", { preHandler: requireAdmin }, async (request, reply) => {
    const client = await clientFor(Number(request.params.id));
    if (!client) return reply.code(404).send({ error: "no such enabled connection" });
    try {
      const result = await client.complete({ prompt: "Reply with the single word OK.", maxTokens: 16 });
      return { ok: true, text: result.text.trim(), model: result.model, latencyMs: result.latencyMs, usage: result.usage };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });
}
