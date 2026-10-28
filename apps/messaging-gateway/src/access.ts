import { config } from "./config.js";

// Who may see what on the live stream (B1 - the API's access control): a
// WebSocket client is the person whose session cookie it brings; the API
// tells their scope (GET /access/stream-scope): per domain everything (null)
// or the ids they may see. No session - no stream. A person limited to some
// DNP instances gets only those processes, devices and nodes.

export interface StreamScope {
  processes: number[] | null;
  devices: number[] | null;
  nodes: number[] | null;
}

/** The person's scope (null - not signed in / the session is over). */
export async function fetchScope(cookie: string | undefined): Promise<StreamScope | null> {
  if (!cookie) return null;
  const res = await fetch(`${config.apiUrl}/access/stream-scope`, {
    headers: { cookie },
    signal: AbortSignal.timeout(config.apiRequestTimeoutMs),
  });
  if (res.status === 401 || res.status === 403) return null;
  if (!res.ok) throw new Error(`stream-scope failed: ${res.status}`);
  return (await res.json()) as StreamScope;
}

const allowed = (ids: number[] | null, id: number) => ids === null || ids.includes(id);
const DOMAIN: Record<string, keyof StreamScope> = { device: "devices", devices: "devices", node: "nodes", nodes: "nodes", process: "processes", processes: "processes" };

/** Whether an event about an entity ("device.12.updated", "processes.25.changed") is in the scope. */
export function eventAllowed(scope: StreamScope, routingKey: string): boolean {
  const [domain, idText] = routingKey.split(".");
  const key = DOMAIN[domain];
  const id = Number(idText);
  if (!key || !Number.isInteger(id)) return true;
  return allowed(scope[key], id);
}

/**
 * The fleet's process-state snapshot for a person: limited - only their processes, and the unread
 * counters summed over those (`unreadByProcess`, 2026-10-28); the per-process counts never go out.
 */
export function scopedProcessSnapshot(scope: StreamScope, event: unknown): unknown {
  if (typeof event !== "object" || event === null) return event;
  const { unreadByProcess, ...snapshot } = event as { processes?: { id: number }[]; unreadByProcess?: Record<string, number[]> };
  if (scope.processes === null) return snapshot;
  const sum = [0, 0, 0];
  for (const [id, counts] of Object.entries(unreadByProcess ?? {}))
    if (allowed(scope.processes, Number(id))) counts.forEach((n, i) => (sum[i] += Number(n) || 0));
  return {
    ...snapshot,
    processes: (snapshot.processes ?? []).filter((p) => allowed(scope.processes, p.id)),
    unreadCounts: { message: sum[0], warning: sum[1], error: sum[2] },
  };
}
