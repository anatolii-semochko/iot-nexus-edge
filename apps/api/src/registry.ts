import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { parse as parseYaml } from "yaml";

import { logCommand } from "./commandLog.js";
import { pool } from "./db.js";
import { addEdgeXDevice, deleteEdgeXDevice, EdgeXError } from "./edgex.js";
import { resolveAbsDir } from "./libraryCatalog.js";
import { logger } from "./logger.js";

// The Device Registry's writes through the API (Nexus Edge AI Assistant,
// stage 8 - nexus-edge-aquarium AGENTS_TO_DO.md 2026-10-17): until now a
// node and its devices only came from a project's seed migration plus its
// EdgeX device list (extra-res/devices/*.yaml). Here - the same rows and
// registrations at run time, for a person (routes/nodes.ts, devices.ts)
// and the AI Assistant's Install proposals (ai/proposals.ts):
// - a node of a Library node type, with the devices its `node.yaml`
//   declares by role (all, or the roles asked for) - a process finds a
//   device of its node by `capabilities.role` (AGENTS.md section 87);
// - a device of a Library device type: its EdgeX profile and resource from
//   the type's `edgex-device-profile.yaml`; registered in EdgeX core-
//   metadata first (the device-service picks it up - no restart), then the
//   row; a failed row removes the registration again.
// Checks: a node type that declares `parents` needs a parent of one of
// them; a device on a node must be of a type the node `supports`, and its
// role unique on that node. Virtual by default; physical - with the
// transport binding given (`transport: {type, ...}`, e.g. can / mqtt).

export class RegistryError extends Error {
  constructor(
    message: string,
    public statusCode = 400,
  ) {
    super(message);
  }
}

interface NodeYaml {
  bus?: { type?: string };
  parents?: string[];
  supports?: string[];
  devices?: { role: string; type: string; name?: string }[];
  // the node's Heartbeating Control thresholds (HeartbeatControlConfig) - absent: not monitored
  heartbeatControl?: Record<string, unknown>;
}

interface DeviceType {
  typeName: string;
  name: string;
  profileName: string;
  resource: string;
  readOnly: boolean;
  labels: string[];
  description: string;
}

async function libraryDir(kind: "node" | "device", typeName: string): Promise<{ dir: string; name: string }> {
  const item = (
    await pool.query<{ folder_path: string; name: string }>("SELECT folder_path, name FROM library_items WHERE kind = $1 AND type_name = $2", [kind, typeName])
  ).rows[0];
  if (!item) throw new RegistryError(`no ${kind} type "${typeName}" in the Library`);
  return { dir: resolveAbsDir(item.folder_path), name: item.name };
}

/** A Library node type's declaration (node.yaml). */
export async function nodeTypeOf(typeName: string): Promise<NodeYaml & { name: string }> {
  const { dir, name } = await libraryDir("node", typeName);
  const text = await readFile(path.join(dir, "node.yaml"), "utf8").catch(() => null);
  return { ...((text ? parseYaml(text) : {}) as NodeYaml), name };
}

// a device type's contract (contract.schema.ts - its source of truth, AGENTS.md section 7):
// the exported object naming `deviceType`; imported as the API imports a DNP's api.ts
async function contractOf(dir: string): Promise<{ readOnly?: boolean } | null> {
  const file = path.join(dir, "contract.schema.ts");
  try {
    const mod = (await import(pathToFileURL(file).href)) as Record<string, unknown>;
    return (Object.values(mod).find((v) => v && typeof v === "object" && "deviceType" in v) as { readOnly?: boolean }) ?? null;
  } catch {
    return null;
  }
}

/** A Library device type's EdgeX shape (its edgex-device-profile.yaml - one resource) and its contract's readOnly. */
export async function deviceTypeOf(typeName: string): Promise<DeviceType> {
  const { dir, name } = await libraryDir("device", typeName);
  const text = await readFile(path.join(dir, "edgex-device-profile.yaml"), "utf8").catch(() => null);
  if (!text) throw new RegistryError(`device type "${typeName}" has no edgex-device-profile.yaml`);
  const profile = parseYaml(text) as {
    name: string;
    labels?: string[];
    description?: string;
    deviceResources?: { name: string; properties?: { readWrite?: string } }[];
  };
  const resource = profile.deviceResources?.[0];
  if (!profile.name || !resource) throw new RegistryError(`device type "${typeName}": its profile names no resource`);
  return {
    typeName,
    name,
    profileName: profile.name,
    resource: resource.name,
    // the contract says (a sensor's profile is RW - its simulation writes it); no contract - the profile
    readOnly: (await contractOf(dir))?.readOnly ?? !String(resource.properties?.readWrite ?? "R").includes("W"),
    labels: profile.labels ?? [],
    description: profile.description ?? name,
  };
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

export interface NewDevice {
  type: string;
  name: string;
  nodeId?: number | null;
  role?: string | null;
  location?: string | null;
  // virtual (default) - played by a simulation; physical - `transport` binds it
  backend?: "virtual" | "physical";
  transport?: Record<string, unknown> | null;
  // extra capabilities (min / max / step / unit ...) beside role / readOnly / edgexResource
  capabilities?: Record<string, unknown>;
}

/** Checks a device can be created (nothing written) - its type and the key its EdgeX name starts with. */
export async function checkDevice(input: NewDevice): Promise<{ type: DeviceType; nodeKey: string }> {
  const type = await deviceTypeOf(input.type);
  if (!input.name?.trim()) throw new RegistryError("name is required");
  const backend = input.backend ?? "virtual";
  if (backend !== "virtual" && backend !== "physical") throw new RegistryError("backend must be virtual or physical");
  if (backend === "physical" && typeof input.transport?.type !== "string") throw new RegistryError("a physical device needs transport {type, ...}");
  if (input.nodeId == null) return { type, nodeKey: "standalone" };
  const node = (await pool.query<{ id: number; type: string }>("SELECT id, type FROM nodes WHERE id = $1", [input.nodeId])).rows[0];
  if (!node) throw new RegistryError(`no node ${input.nodeId}`, 404);
  const nodeType = await nodeTypeOf(node.type);
  if (nodeType.supports?.length && !nodeType.supports.includes(type.typeName))
    throw new RegistryError(`a ${node.type} node doesn't support ${type.typeName} (it supports ${nodeType.supports.join(", ")})`);
  if (input.role) {
    const taken = (await pool.query("SELECT 1 FROM devices WHERE node_id = $1 AND capabilities->>'role' = $2", [node.id, input.role])).rowCount;
    if (taken) throw new RegistryError(`node ${node.id} already has a device with the role "${input.role}"`, 409);
  }
  return { type, nodeKey: `${slug(node.type)}-${node.id}` };
}

/** Creates a device: its EdgeX registration, then its row - the device's id. */
export async function createDevice(input: NewDevice, actorUserId: number, source: string): Promise<number> {
  const { type, nodeKey } = await checkDevice(input);
  const backend = input.backend ?? "virtual";
  // unique and readable: the node's type and id + the role (or the name)
  const base = `${nodeKey}-${slug(input.role || input.name)}`;
  let edgexName = base;
  for (let i = 2; (await pool.query("SELECT 1 FROM devices WHERE edgex_device_name = $1", [edgexName])).rowCount; i++) edgexName = `${base}-${i}`;

  const protocols: Record<string, Record<string, unknown>> =
    backend === "virtual" ? { backend: { mode: "virtual" } } : { backend: { mode: "physical" }, transport: input.transport! };
  try {
    await addEdgeXDevice({ name: edgexName, profileName: type.profileName, description: input.name, labels: type.labels, protocols });
  } catch (err) {
    if (err instanceof EdgeXError) throw new RegistryError(err.message, err.status >= 500 ? 502 : 400);
    throw err;
  }
  const capabilities = { ...(input.capabilities ?? {}), ...(input.role ? { role: input.role } : {}), readOnly: type.readOnly, edgexResource: type.resource };
  try {
    const id = (
      await pool.query<{ id: number }>(
        `INSERT INTO devices (type, name, node_id, location, backend, edgex_device_name, capabilities)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [type.typeName, input.name.trim(), input.nodeId ?? null, input.location ?? null, backend, edgexName, capabilities],
      )
    ).rows[0].id;
    await logCommand({ deviceId: id, action: "create", value: { ...input, edgexDeviceName: edgexName }, source, actorUserId });
    return id;
  } catch (err) {
    // the row failed - the registration goes too, nothing is left half-made
    await deleteEdgeXDevice(edgexName).catch((e: unknown) => logger.error({ err: e, device: edgexName }, "removing an orphan EdgeX device failed"));
    throw err;
  }
}

export interface NewNode {
  type: string;
  name: string;
  parentId?: number | null;
  groupId?: number | null;
  location?: string | null;
  // its devices: the node.yaml roles to create (absent - all it declares; [] - none)
  roles?: string[];
  backend?: "virtual" | "physical";
  // physical: the bus binding of the node (bus_config, e.g. {"bus": "can2"}) and its devices' transport
  busConfig?: Record<string, unknown>;
  transport?: Record<string, unknown> | null;
  // played by a simulation (default - for a virtual node)
  simulated?: boolean;
}

/** Checks a node can be created (nothing written) - its type and the declared devices to create with it. */
export async function checkNode(input: NewNode): Promise<{ nodeType: NodeYaml & { name: string }; devices: { role: string; type: string; name?: string }[] }> {
  const nodeType = await nodeTypeOf(input.type);
  if (!input.name?.trim()) throw new RegistryError("name is required");
  if ((await pool.query("SELECT 1 FROM nodes WHERE name = $1", [input.name.trim()])).rowCount) throw new RegistryError(`a node named "${input.name.trim()}" exists`, 409);
  if (nodeType.parents?.length) {
    if (input.parentId == null) throw new RegistryError(`a ${input.type} node is a module of ${nodeType.parents.join(" / ")} - parentId is required`);
    const parent = (await pool.query<{ type: string }>("SELECT type FROM nodes WHERE id = $1", [input.parentId])).rows[0];
    if (!parent) throw new RegistryError(`no node ${input.parentId}`, 404);
    if (!nodeType.parents.includes(parent.type)) throw new RegistryError(`a ${input.type} node's parent must be ${nodeType.parents.join(" / ")}, not ${parent.type}`);
  } else if (input.parentId != null && !(await pool.query("SELECT 1 FROM nodes WHERE id = $1", [input.parentId])).rowCount) {
    throw new RegistryError(`no node ${input.parentId}`, 404);
  }
  const backend = input.backend ?? "virtual";
  if (backend !== "virtual" && backend !== "physical") throw new RegistryError("backend must be virtual or physical");
  if (backend === "physical" && typeof input.transport?.type !== "string") throw new RegistryError("a physical node's devices need transport {type, ...}");
  const declared = nodeType.devices ?? [];
  const roles = input.roles ?? declared.map((d) => d.role);
  const unknown = roles.filter((r) => !declared.some((d) => d.role === r));
  if (unknown.length) throw new RegistryError(`${input.type} declares no role ${unknown.join(", ")} (its roles: ${declared.map((d) => d.role).join(", ") || "none"})`);
  const devices = declared.filter((d) => roles.includes(d.role));
  // every device type known before anything is written
  for (const d of devices) await deviceTypeOf(d.type);
  return { nodeType, devices };
}

/** Creates a node and its declared devices - the node's id and its devices' ids. */
export async function createNode(input: NewNode, actorUserId: number, source: string): Promise<{ nodeId: number; deviceIds: number[] }> {
  const { nodeType, devices } = await checkNode(input);
  const backend = input.backend ?? "virtual";
  const nodeId = (
    await pool.query<{ id: number }>(
      `INSERT INTO nodes (type, name, location, bus_type, bus_config, group_id, parent_id, simulated, heartbeat_control)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [
        input.type,
        input.name.trim(),
        input.location ?? null,
        nodeType.bus?.type ?? null,
        input.busConfig ?? {},
        input.groupId ?? null,
        input.parentId ?? null,
        input.simulated ?? backend === "virtual",
        nodeType.heartbeatControl ?? {},
      ],
    )
  ).rows[0].id;
  const deviceIds: number[] = [];
  try {
    for (const d of devices) {
      deviceIds.push(
        await createDevice(
          { type: d.type, name: d.name ?? `${input.name.trim()} ${d.role}`, nodeId, role: d.role, backend, transport: input.transport },
          actorUserId,
          source,
        ),
      );
    }
  } catch (err) {
    // a device failed - the node goes back out whole
    await deleteNode(nodeId, actorUserId, source).catch((e: unknown) => logger.error({ err: e, node: nodeId }, "rolling back a node failed"));
    throw err;
  }
  return { nodeId, deviceIds };
}

/** Deletes a device: its row, its EdgeX registrations (and its simulated twin's). */
export async function deleteDevice(id: number, actorUserId: number, source: string): Promise<void> {
  const d = (await pool.query<{ edgex_device_name: string | null; edgex_device_name_simulated: string | null }>("SELECT edgex_device_name, edgex_device_name_simulated FROM devices WHERE id = $1", [id])).rows[0];
  if (!d) throw new RegistryError("device not found", 404);
  await logCommand({ deviceId: id, action: "delete", source, actorUserId });
  await pool.query("DELETE FROM devices WHERE id = $1", [id]);
  for (const name of [d.edgex_device_name, d.edgex_device_name_simulated]) if (name) await deleteEdgeXDevice(name);
}

/** Deletes a node with its devices (its processes stay - their node is unset; child nodes - refused). */
export async function deleteNode(id: number, actorUserId: number, source: string): Promise<void> {
  if (!(await pool.query("SELECT 1 FROM nodes WHERE id = $1", [id])).rowCount) throw new RegistryError("node not found", 404);
  if ((await pool.query("SELECT 1 FROM nodes WHERE parent_id = $1", [id])).rowCount) throw new RegistryError("the node has modules (child nodes) - delete them first", 409);
  for (const d of (await pool.query<{ id: number }>("SELECT id FROM devices WHERE node_id = $1", [id])).rows) await deleteDevice(d.id, actorUserId, source);
  await pool.query("DELETE FROM nodes WHERE id = $1", [id]);
}
