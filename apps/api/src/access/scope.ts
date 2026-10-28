import type { FastifyRequest } from "fastify";

import { instanceUnits } from "../dnpInstances.js";
import { visibleUnits } from "./principal.js";

// Lists for a person limited to some DNP instances (B1): they don't see the
// others at all. `scopeFilter` - null when the person sees everything with
// the permission, else predicates by process / node / device id over the
// units they hold it on (dnpInstances.ts).

export interface ScopeFilter {
  process: (id: number) => boolean;
  node: (id: number) => boolean;
  device: (id: number) => boolean;
}

export async function scopeFilter(request: FastifyRequest, permission: string): Promise<ScopeFilter | null> {
  const principal = request.principal;
  if (!principal) return null;
  const units = visibleUnits(principal, permission);
  if (units === null) return null;
  const map = await instanceUnits();
  const inUnit = (unit: string | undefined) => unit !== undefined && units.has(unit);
  return {
    process: (id) => inUnit(map.processUnit.get(id)),
    node: (id) => inUnit(map.nodeUnit.get(id)),
    device: (id) => inUnit(map.deviceUnit.get(id)),
  };
}

/** The process and device ids a limited person sees with `permission` (null - all) - for SQL filters. */
export async function scopeIds(request: FastifyRequest, permission: string): Promise<{ processIds: number[]; deviceIds: number[] } | null> {
  const principal = request.principal;
  if (!principal) return null;
  const units = visibleUnits(principal, permission);
  if (units === null) return null;
  const map = await instanceUnits();
  const pick = (m: Map<number, string>) => [...m].filter(([, unit]) => units.has(unit)).map(([id]) => id);
  return { processIds: pick(map.processUnit), deviceIds: pick(map.deviceUnit) };
}

/**
 * The live stream's scope for a person (the messaging gateway asks with the
 * person's cookie on a WebSocket connect, and again from time to time): per
 * domain - null (everything) or the ids they may see; [] - none.
 */
export async function streamScope(request: FastifyRequest): Promise<{ processes: number[] | null; devices: number[] | null; nodes: number[] | null }> {
  const principal = request.principal;
  if (!principal) return { processes: [], devices: [], nodes: [] };
  const map = await instanceUnits();
  const ids = (permission: string, m: Map<number, string>) => {
    const units = visibleUnits(principal, permission);
    return units === null ? null : [...m].filter(([, unit]) => units.has(unit)).map(([id]) => id);
  };
  return { processes: ids("processes.view", map.processUnit), devices: ids("devices.view", map.deviceUnit), nodes: ids("nodes.view", map.nodeUnit) };
}
