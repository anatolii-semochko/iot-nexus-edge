import { timingSafeEqual } from "node:crypto";

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { getSystemActorUserId } from "../commandLog.js";
import { config } from "../config.js";
import { requestContext, withRequestContext } from "../requestContext.js";
import { instanceUnits } from "../dnpInstances.js";
import { linkedAllows } from "./linked.js";
import { SYSTEM_WIDE_CONFIG } from "./rights.js";
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
    // a process's command / day note refused on its own rights - decided on the body (access/linked.ts)
    linkedCheck?: { processId: number; dayNotes: boolean };
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

// the routes a linked process's rights may open: -> whether it is a day note's (else a command's)
const LINKABLE = new Map([
  ["POST /processes/:id/commands", false],
  ["POST /processes/:id/day-notes", true],
]);

export function registerAccessGuard(app: FastifyInstance): void {
  // each request its own context (requestContext.ts) - the hooks and the handler after it run inside
  app.addHook("onRequest", (_request, _reply, done) => withRequestContext(done));
  // the deferred linked check (above) - the command's action is in the body
  app.addHook("preHandler", async (request: FastifyRequest, reply: FastifyReply) => {
    const check = request.linkedCheck;
    if (!check || !request.principal) return;
    const action = check.dayNotes ? "dayNotes" : String((request.body as { action?: unknown } | undefined)?.action ?? "");
    if (action && (await linkedAllows(request.principal, check.processId, action))) return;
    const guest = request.principal.guest;
    return reply.code(403).send({ error: guest ? "sign in to change this" : "forbidden", permission: "processes.control", ...(guest ? { guest: true } : {}) });
  });

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
    const context = requestContext();
    if (context) context.actedAs = principal.roleNames.join(", ") || null;
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
      // a command / a day note a linked process may give (its manifest's "access.linked") - on the body
      const linkable = LINKABLE.get(`${request.method} ${pattern}`);
      if (linkable !== undefined && entity.kind === "process") {
        request.linkedCheck = { processId: entity.id, dayNotes: linkable };
        return;
      }
    } else if (!isRead(request.method) && SYSTEM_WIDE_CONFIG.has(permission)) {
      // a configuration change with no object named - the whole system's (rights.ts SYSTEM_WIDE_CONFIG)
      if (principal.global.has("*") || principal.global.has(permission)) return;
    } else if (can(principal, permission)) {
      return;
    }
    const guest = principal.guest && !isRead(request.method);
    return reply.code(403).send({ error: guest ? "sign in to change this" : "forbidden", permission, ...(guest ? { guest: true } : {}) });
  });
}
