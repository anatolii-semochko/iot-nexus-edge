import { timingSafeEqual } from "node:crypto";

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { getSystemActorUserId } from "../commandLog.js";
import { config } from "../config.js";
import { instanceUnits } from "../dnpInstances.js";
import { can, principalOf, SERVICE_PRINCIPAL, type Principal } from "./principal.js";
import { entityOf, permissionFor } from "./routes.js";
import { sessionAlive, type SessionPayload } from "./session.js";

// The API's one access check (B1 - iot AGENTS_TO_DO.md 2026-10-17), an
// onRequest hook for every route, before any handler or plugin preHandler:
// 1. the route's permission (access/routes.ts); "public" - through;
// 2. an internal service - `X-Service-Token` = SERVICE_API_TOKEN: everything,
//    acting as the "orchestrator" account (the role `system`);
// 3. else the session cookie (a JWT naming a server-side session -
//    access/session.ts): no / bad / over - 401; the person's principal
//    (access/principal.ts) in the session's context (G1);
// 4. the permission: on the DNP instance the route names (a process / node /
//    device id - its unit) or anywhere; an instance the person can't see at
//    all - 404 (it doesn't exist for them), seen but not allowed - 403; the
//    guest's refusal asks to sign in.
// Lists filter by the person's units in their routes (visibleUnits).

declare module "fastify" {
  interface FastifyRequest {
    principal?: Principal;
    // the session (access/session.ts) - its id, the context, whether a guest's
    session?: SessionPayload;
    // a guest's own session id - their conversations (routes/auth.ts); none for a person
    guestSession?: string;
  }
  interface FastifyContextConfig {
    // a route's own permission key (a DNP plugin's) - else access/routes.ts decides
    permission?: string;
  }
}

const tokenMatches = (given: string) => {
  const a = Buffer.from(given);
  const b = Buffer.from(config.auth.serviceApiToken);
  return a.length === b.length && timingSafeEqual(a, b);
};

const isRead = (method: string) => method === "GET" || method === "HEAD";

export function registerAccessGuard(app: FastifyInstance): void {
  app.addHook("onRequest", async (request: FastifyRequest, reply: FastifyReply) => {
    const pattern = request.routeOptions.url;
    if (!pattern) return; // no route - Fastify answers 404
    const permission = permissionFor(request.method, pattern, request.routeOptions.config?.permission);
    if (permission === "public") return;

    const serviceToken = request.headers["x-service-token"];
    if (typeof serviceToken === "string") {
      if (!tokenMatches(serviceToken)) return reply.code(401).send({ error: "bad service token" });
      const systemId = await getSystemActorUserId();
      request.principal = SERVICE_PRINCIPAL(systemId);
      request.user = { sub: systemId, username: "orchestrator" } as never;
      return;
    }
    if (permission === "service") return reply.code(403).send({ error: "internal services only" });

    let session: SessionPayload;
    try {
      session = await request.jwtVerify<SessionPayload>();
    } catch {
      return reply.code(401).send({ error: "unauthorized" });
    }
    if (!(await sessionAlive(session))) return reply.code(401).send({ error: "the session is over - sign in again" });
    // the role the person acts in (G1 - one of theirs)
    const principal = await principalOf(session.sub, session.ctx ?? null);
    if (!principal) return reply.code(401).send({ error: "unauthorized" });
    request.principal = principal;
    request.session = session;
    request.guestSession = session.guest ? session.sid : undefined;
    if (permission === "authenticated") return;

    const entity = entityOf(pattern, request.params as Record<string, string>);
    if (entity) {
      const units = await instanceUnits();
      const unit = (entity.kind === "process" ? units.processUnit : entity.kind === "node" ? units.nodeUnit : units.deviceUnit).get(entity.id) ?? null;
      if (can(principal, permission, unit)) return;
      // can't even see the instance - for them it doesn't exist
      const viewKey = `${permission.split(".")[0]}.view`;
      if (!can(principal, viewKey, unit)) return reply.code(404).send({ error: "not found" });
    } else if (can(principal, permission)) {
      return;
    }
    const guest = principal.guest && !isRead(request.method);
    return reply.code(403).send({ error: guest ? "sign in to change this" : "forbidden", permission, ...(guest ? { guest: true } : {}) });
  });
}
