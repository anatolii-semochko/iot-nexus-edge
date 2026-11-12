import { can, principalOf, type Principal } from "../access/principal.js";
import { pool } from "../db.js";
import type { Access } from "./instances.js";

// An agent's access cut to its account's roles (2026-11-12): an MCP token's service account (ai/mcp.ts) and
// the built-in assistant's `ai-agent` (migration 110 - its role "AI Assistant"). A level is on only where
// the roles hold its permission somewhere; on which objects - the tools and proposals check per object
// (ai/tools.ts principalScope, ai/proposals.ts principalAllows).

// the permission a level needs somewhere for the level to be on at all
export const LEVEL_PERMISSIONS: Record<"read" | "config" | "control" | "install", string[]> = {
  read: ["processes.view", "nodes.view", "devices.view"],
  config: ["processes.config"],
  control: ["processes.control"],
  install: ["processes.manage", "nodes.manage", "devices.manage"],
};

/** The access with every level the roles hold nowhere turned off. */
export function cutAccess(access: Access, principal: Principal): Access {
  const has = (level: keyof typeof LEVEL_PERMISSIONS) => LEVEL_PERMISSIONS[level].some((perm) => can(principal, perm));
  return {
    ...access,
    read: access.read && has("read"),
    config: has("config") ? access.config : "off",
    control: has("control") ? access.control : "off",
    install: has("install") ? access.install : "off",
  };
}

let agentIdCache: number | null = null;
/** The `ai-agent` user's id (migration 067) - the built-in assistant's account, the author of what it applies on Auto. */
export async function aiAgentUserId(): Promise<number> {
  if (agentIdCache !== null) return agentIdCache;
  const row = (await pool.query<{ id: number }>("SELECT id FROM users WHERE username = 'ai-agent'")).rows[0];
  if (!row) throw new Error("the ai-agent user not found");
  agentIdCache = row.id;
  return agentIdCache;
}

/** The built-in assistant's principal - `ai-agent`'s roles (null - the account is off). */
export const aiAgentPrincipal = async (): Promise<Principal | null> => principalOf(await aiAgentUserId());
