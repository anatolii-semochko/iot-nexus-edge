import bcrypt from "bcryptjs";
import type { FastifyReply, FastifyRequest } from "fastify";


// Passwords and the request's identity (AGENTS.md section 13). Access is
// decided by ONE guard for every route (access/guard.ts - B1); the
// preHandlers below remain for the routes and DNP plugins that still name
// them: a person or a service is known (the guard already decided).

const BCRYPT_COST = 10;

// the session's token (access/session.ts)
export interface JwtPayload {
  sub: number;
  username: string;
  // the server-side session (user_sessions); none on a service's request
  sid?: string;
  guest?: boolean;
  ctx?: string;
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: JwtPayload;
    user: JwtPayload;
  }
}

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_COST);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!request.principal) await reply.code(401).send({ error: "unauthorized" });
}

// The route's own permission (access/routes.ts) is what decides now - this
// stays for the routes that still name it and means the same as requireAuth.
export const requireAdmin = requireAuth;
