// Which permission a route needs (B1) - ONE table for the whole API, read
// by the guard (access/guard.ts). A route is matched by its method and its
// Fastify pattern (`/processes/:id/config`, never the concrete URL):
// 1. a route's own `config.permission` (a DNP plugin may name its key);
// 2. an exact "METHOD /pattern" below;
// 3. the longest matching prefix: a read (GET / HEAD) or a write key;
// 4. else - a project package's route: GET "dnp.view", a change "dnp.config".
// Special values: "public" (no session - sign-in, health, MCP with its own
// tokens), "authenticated" (any signed-in person), "service" (only the
// internal services with SERVICE_API_TOKEN - the orchestrator's tick
// reports, device pushes).

export type RoutePermission = string;

const EXACT: Record<string, RoutePermission> = {
  "GET /health": "public",
  "POST /auth/login": "public",
  "POST /auth/logout": "public",
  // checks the session itself (and starts a guest session - routes/auth.ts)
  "GET /auth/me": "public",
  // act in another of one's groups (G1) - any signed-in person, their own groups only
  "POST /auth/context": "authenticated",
  // what a role's rights table gives - reading, for whoever sees the roles
  "POST /access/rights/preview": "users.view",
  "GET /mcp": "public",
  "POST /mcp": "public",
  "DELETE /mcp": "public",
  "GET /system/mode": "authenticated",
  "GET /users/directory": "authenticated",
  "GET /access/catalog": "authenticated",
  "GET /access/stream-scope": "authenticated",

  // the orchestrator, simulations and device pushes
  "POST /system/tick": "service",
  "POST /processes/heartbeat": "service",
  "POST /processes/state/broadcast": "service",
  "POST /processes/:id/critical": "service",
  "POST /processes/:id/warning": "service",
  "POST /processes/:id/metrics": "service",
  "POST /processes/:id/messages": "service",
  "PUT /processes/:id/events": "service",
  "POST /processes/:id/commands/:commandId/done": "service",
  "POST /nodes/heartbeat": "service",
  "POST /nodes/state/broadcast": "service",
  "PUT /devices/:id/auto": "service",
  "PUT /devices/:id/reading": "service",
  "PUT /devices/:id/simulate-auto": "service",
  "PUT /devices/simulate-auto": "service",
  "POST /devices/:id/log": "service",
  "PUT /media/edgex/:edgexDeviceName": "service",
  "POST /samples": "service",
  "POST /series/declare": "service",
  "POST /ai/calendar/tick": "service",

  // devices: values, simulation, the registry
  "POST /devices/values": "devices.view",
  "PUT /devices/:id": "devices.write",
  "POST /devices/:id/release": "devices.write",
  "PUT /devices/:id/simulate": "devices.simulate",
  "PATCH /devices/:id/simulated": "devices.simulate",
  "POST /devices/:id/media/simulate": "devices.simulate",
  "PATCH /nodes/:id/simulated": "devices.simulate",
  "GET /registry/node-types/:type": "nodes.view",

  // processes: control and configuration
  "POST /processes/:id/action": "processes.control",
  "POST /processes/:id/commands": "processes.control",
  // the operational days' notes (dayNotes.ts) - TODO(access rework): per panel
  "GET /processes/:id/day-notes": "processes.view",
  "POST /processes/:id/day-notes": "processes.control",
  "PATCH /processes/:id/day-notes/:noteId": "processes.control",
  "DELETE /processes/:id/day-notes/:noteId": "processes.control",
  "PUT /processes/:id/heartbeat-test-failure": "processes.control",
  "DELETE /processes/:id/dashboard-flag": "processes.control",
  "PATCH /log-messages/:messageId": "processes.control",
  "PATCH /processes/:id/config": "processes.config",

  // logs: what is logged
  "PATCH /series/:id": "logs.configure",

  // the library
  "POST /library/sync": "library.manage",

  // the AI Assistant: the messenger for its users, the rest - its settings
  "GET /ai/entities": "ai.use",
  "GET /ai/conversations": "ai.use",
  "POST /ai/conversations": "ai.use",
  "GET /ai/conversations/:id": "ai.use",
  "DELETE /ai/conversations/:id": "ai.use",
  "PATCH /ai/conversations/:id/topic": "ai.use",
  "GET /ai/subject": "ai.use",
  "PATCH /ai/conversations/:id/shared": "ai.share",
  "POST /ai/conversations/:id/messages": "ai.use",
  "POST /ai/conversations/:id/messages/stream": "ai.use",
  "GET /ai/proposals": "ai.use",
  "POST /ai/proposals/:id/:decision": "ai.decide",

  // service -> database
  "GET /service/database/stats": "service.database.backup",
  "GET /service/database/download": "service.database.backup",
  "GET /service/database/download-logs": "service.database.backup",
  "GET /service/database/stamps": "service.database.backup",
  "POST /service/database/stamps": "service.database.backup",
  "DELETE /service/database/stamps/:filename": "service.database.backup",
  "POST /service/database/stamps/:filename/apply": "service.database.restore",
  "POST /service/database/upload": "service.database.restore",
  "GET /service/database/logs/volumes": "service.database.clear-logs",
  "DELETE /service/database/logs": "service.database.clear-logs",
};

// [prefix, read key, write key] - the longest prefix wins
const PREFIX: [string, RoutePermission, RoutePermission][] = [
  ["/dashboard-cards", "dashboard.view", "dashboard.manage"],
  ["/ai", "ai.configure", "ai.configure"],
  ["/nodes", "nodes.view", "nodes.manage"],
  ["/map", "authenticated", "service"],
  ["/node-groups", "nodes.view", "nodes.manage"],
  ["/devices", "devices.view", "devices.manage"],
  ["/device-groups", "devices.view", "devices.manage"],
  ["/processes", "processes.view", "processes.manage"],
  ["/process-groups", "processes.view", "processes.manage"],
  ["/process-kinds", "processes.view", "processes.manage"],
  ["/tab-groups", "processes.view", "processes.manage"],
  ["/log-messages", "processes.view", "processes.control"],
  ["/logs", "logs.view", "logs.configure"],
  ["/series", "logs.view", "logs.configure"],
  ["/data-logger-controls", "logs.view", "logs.configure"],
  ["/library", "library.view", "library.manage"],
  ["/library-assets", "authenticated", "service"],
  ["/uploads/avatars", "authenticated", "service"],
  ["/message-groups", "settings.view", "settings.config"],
  ["/message-levels", "settings.view", "settings.config"],
  ["/message-signal-timing", "settings.view", "settings.config"],
  ["/heartbeat-controls", "settings.view", "settings.config"],
  ["/service/commands", "service.system", "service.system"],
  ["/service", "service.database.backup", "service.database.restore"],
  ["/dnp", "service.dnp", "service.dnp"],
  ["/users", "users.view", "users.manage"],
  ["/access", "users.view", "users.manage"],
];

const isRead = (method: string) => method === "GET" || method === "HEAD";

/** The permission a route needs - by its method and Fastify pattern (`own` - its `config.permission`). */
export function permissionFor(method: string, pattern: string, own?: RoutePermission): RoutePermission {
  if (own) return own;
  const exact = EXACT[`${method} ${pattern}`] ?? (method === "HEAD" ? EXACT[`GET ${pattern}`] : undefined);
  if (exact) return exact;
  let best: [string, RoutePermission, RoutePermission] | null = null;
  for (const p of PREFIX) {
    if ((pattern === p[0] || pattern.startsWith(`${p[0]}/`)) && (!best || p[0].length > best[0].length)) best = p;
  }
  if (best) return isRead(method) ? best[1] : best[2];
  return isRead(method) ? "dnp.view" : "dnp.config";
}

/**
 * The DNP instance a route acts on, by its pattern and params: which entity
 * id names it ("process" / "node" / "device"), or null - none (a list, a
 * setting). The guard maps the entity to its unit (dnpInstances.ts).
 */
export function entityOf(pattern: string, params: Record<string, string>): { kind: "process" | "node" | "device"; id: number } | null {
  const id = Number(params.id);
  if (pattern.startsWith("/processes/:id") && Number.isInteger(id)) return { kind: "process", id };
  if (pattern.startsWith("/nodes/:id") && Number.isInteger(id)) return { kind: "node", id };
  if (pattern.startsWith("/devices/:id") && Number.isInteger(id)) return { kind: "device", id };
  if (pattern.startsWith("/data-logger-controls/:deviceId")) return { kind: "device", id: Number(params.deviceId) };
  if (pattern.startsWith("/heartbeat-controls/:type/:id") && ["process", "node", "device"].includes(params.type))
    return { kind: params.type as "process" | "node" | "device", id };
  // a DNP package's own routes on one of its processes (`/<kind>/:processId/...`)
  const processId = Number(params.processId);
  if (params.processId !== undefined && Number.isInteger(processId)) return { kind: "process", id: processId };
  return null;
}
