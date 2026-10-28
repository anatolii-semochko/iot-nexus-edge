import type { FastifyInstance } from "fastify";

import { scopeFilter, scopeIds } from "../access/scope.js";
import { requireAuth } from "../auth.js";
import { logCommand } from "../commandLog.js";
import { config } from "../config.js";
import { pool } from "../db.js";
import * as heartbeatControl from "../heartbeatControl.js";
import type { HeartbeatControlConfig } from "../heartbeatControl.js";
import { configSchemaKinds, configSchemaOf } from "../configSchemas.js";
import { broadcastForced } from "../processBroadcast.js";
import { createProcess, giveProcessCommand, ProcessWriteError, switchProcess, writeProcessConfig } from "../processWrites.js";
import * as processMessages from "../processMessages.js";
import * as processRegistry from "../processRegistry.js";
import { isSimulationTargetSimulated } from "../simulationTarget.js";

interface ProcessConfig {
  min?: number;
  max?: number;
  // resource-monitor thresholds (AGENTS.md section 21) - percentages, same
  // loose "shape depends on kind" jsonb as min/max above. A threshold of 0
  // (or omitted) means "don't check this metric" - the orchestrator, not
  // this route, is what interprets that.
  cpuMax?: number;
  ramMax?: number;
  diskMax?: number;
  cpuWarnMax?: number;
  ramWarnMax?: number;
  diskWarnMax?: number;
  // alarm-annunciator (AGENTS_TO_DO.md, 2026-08-02) - 8 fixed slots (one
  // per LED pair, device ids never change post-seed), each bound to a
  // Message Group by an admin via this same generic config PATCH.
  // `testLevel`/`testSlotIndex` are the process panel's own momentary
  // test-button state (which slot is currently held, at which level) -
  // written through this same route on mousedown/mouseup rather than a
  // dedicated endpoint, since the traffic is a human clicking, not a hot
  // loop.
  slots?: AnnunciatorSlot[];
  testLevel?: { type: "warning" | "error"; level: number } | null;
  testSlotIndex?: number | null;
}

interface AnnunciatorSlot {
  redDeviceId: number;
  yellowDeviceId: number;
  messageGroupId: number | null;
}

interface ProcessRow {
  id: number;
  name: string;
  group_id: number;
  // Joined from process_groups (AGENTS.md section 10/17) - group_name
  // itself isn't a column on this table anymore, groups are a real,
  // independently manageable entity now (routes/processGroups.ts).
  group_name: string;
  // Includes "simulation" (AGENTS_TO_DO.md, 2026-08-29) even though the
  // POST /processes route below only ever accepts "controllable"/
  // "permanent" - a simulation process is seed-migration-created only,
  // never through this generic create route, but this interface also
  // types every row read back via SELECT * FROM processes (GET
  // /processes above), which legitimately includes simulation rows.
  type: "controllable" | "permanent" | "simulation";
  kind: string;
  actions: string[];
  device_id: number | null;
  // Simulation processes only (AGENTS_TO_DO.md, 2026-08-29) - the "spans
  // an entire Node" link nexus-edge core's 1690000000029 migration
  // established. Needed here (not just on the orchestrator-facing
  // apiClient.ts type) for withLiveState's own isSimulationTargetSimulated
  // check below.
  node_id: number | null;
  config: ProcessConfig;
  // per config section: last changed when / by whom (migrations/1690000000064)
  config_stamps: Record<string, { at: string; by: number | null }>;
  // pending one-shot commands (PROCESS_SELECT)
  commands: { id: number; action: string; params: Record<string, unknown> }[];
  // Dashboard tab (AGENTS.md section 22) - set once, the instant this
  // process first gets an active WEM entry (processMessages.
  // maybeFlagForDashboard), cleared only via the dashboard-flag DELETE
  // route below.
  dashboard_flagged_at: string | null;
  // Heartbeating Control (AGENTS.md) - design-time config (stoppable +
  // warning/error skipped-tick thresholds); live last-seen/stopped state
  // is Redis-backed, added below in withLiveState.
  heartbeat_control: HeartbeatControlConfig;
  created_at: string;
  updated_at: string;
}

// `commands` - the process's pending one-shot commands (process_commands,
// not older than config.processCommands.ttlMs) - the orchestrator gets them
// with the tick's list, no request of its own.
const PROCESS_SELECT = `
  SELECT p.*, g.name AS group_name,
    COALESCE((SELECT json_agg(json_build_object('id', c.id, 'action', c.action, 'params', c.params) ORDER BY c.id)
              FROM process_commands c
              WHERE c.process_id = p.id AND c.done_at IS NULL AND c.created_at > now() - make_interval(secs => ${config.processCommands.ttlMs / 1000})),
             '[]'::json) AS commands
  FROM processes p
  JOIN process_groups g ON g.id = p.group_id
`;

export async function processRoutes(app: FastifyInstance): Promise<void> {
  app.get("/processes", async (request) => {
    const result = await pool.query<ProcessRow>(`${PROCESS_SELECT} ORDER BY g.name, p.name`);
    // a person limited to some DNP instances sees only theirs (access/scope.ts)
    const scope = await scopeFilter(request, "processes.view");
    return Promise.all(result.rows.filter((p) => !scope || scope.process(p.id)).map(withLiveState));
  });

  // AGENTS_TO_DO.md, 2026-08-14 process management - live create/delete
  // for `processes` rows, which previously only existed via hand-written
  // seed migrations. This alone is fully live (no restart): apps/
  // orchestrator's tick() re-queries GET /processes fresh every tick
  // (TICK_INTERVAL_MS, no caching), so a newly-inserted row starts
  // getting ticked, or a deleted one stops, within about a second either
  // way - see AGENTS.md section 10/51's own writeup of this. What is NOT
  // live: a `kind` whose plugin code isn't loaded in the running
  // orchestrator yet (processRegistry.get(kind) returns undefined, the
  // row is just silently skipped each tick, per server.ts's own tick()) -
  // that still needs an orchestrator restart, which is exactly why GET
  // /processes/registered-kinds exists below, for the UI to tell the two
  // cases apart.
  app.post<{
    Body: {
      name: string;
      groupId: number;
      type: "controllable" | "permanent";
      kind: string;
      actions?: string[];
      deviceId?: number | null;
      config?: ProcessConfig;
    };
  }>("/processes", { preHandler: requireAuth }, async (request, reply) => {
    try {
      const id = await createProcess(request.body, request.user.sub, "api");
      return withLiveState((await findProcess(String(id)))!);
    } catch (err) {
      if (err instanceof ProcessWriteError) return reply.code(err.statusCode).send({ error: err.message, ...err.extra });
      throw err;
    }
  });

  // Deliberately unrestricted - this will happily delete a `permanent`
  // system process row (resource-monitor, heartbeat-control, ...) same as
  // a `controllable` one; no special-casing "official" kinds, matching
  // the same "no special-casing" principle processRegistry.register()
  // itself already follows (AGENTS.md section 10). The operator is
  // trusted to know what a permanent process' absence means.
  app.delete<{ Params: { id: string } }>("/processes/:id", { preHandler: requireAuth }, async (request, reply) => {
    const process = await findProcess(request.params.id);
    if (!process) {
      return reply.code(404).send({ error: "process not found" });
    }
    await logCommand({ processId: process.id, action: "delete", source: "api", actorUserId: request.user.sub });
    await pool.query("DELETE FROM processes WHERE id = $1", [process.id]);
    return { status: "ok" };
  });

  // Which `kind`s the running orchestrator actually has plugin code
  // loaded for right now (proxies apps/orchestrator's own GET
  // /process-kinds, config.orchestratorUrl) - the UI's "pending restart"
  // signal for a `processes` row whose kind was just added. Tolerant of
  // orchestrator being briefly unreachable (mid-restart is exactly when
  // this gets called) - returns an empty list rather than failing the
  // whole request, same "warn don't block" spirit as this project's own
  // check-ports.sh/check-version.
  // Config schemas (configSchemas.ts) - the kinds that have one, and one
  // kind's: what its config holds, the types, limits and defaults.
  app.get("/process-kinds/config-schemas", async () => ({ kinds: configSchemaKinds() }));
  app.get<{ Params: { kind: string } }>("/process-kinds/:kind/config-schema", async (request, reply) => {
    const schema = configSchemaOf(request.params.kind);
    return schema ?? reply.code(404).send({ error: "no config schema for this kind" });
  });

  app.get("/processes/registered-kinds", async (_request, reply) => {
    try {
      // 5s margin, not that it should ever need it - see docker-compose.yml's
      // own UV_THREADPOOL_SIZE comment on the `api` service for the real
      // fix to what looked, at first, like an unreachable-orchestrator
      // problem (live-debugged 2026-08-14).
      const res = await fetch(`${config.orchestratorUrl}/process-kinds`, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error(`orchestrator responded ${res.status}`);
      const body = (await res.json()) as { kinds: string[] };
      return { kinds: body.kinds };
    } catch (err) {
      app.log.warn({ err }, "failed to reach orchestrator for registered process kinds");
      reply.code(200);
      return { kinds: [], unreachable: true };
    }
  });

  app.get<{ Params: { id: string } }>("/processes/:id", async (request, reply) => {
    const process = await findProcess(request.params.id);
    if (!process) {
      return reply.code(404).send({ error: "process not found" });
    }
    return withLiveState(process);
  });

  // Same endpoint serves every kind's config fields (min/max for
  // temperature-*, cpuMax/ramMax/diskMax for resource-monitor) - the body is
  // a partial patch merged onto whatever's already there, same loose jsonb
  // approach as devices.capabilities. The min<=max guard only fires when a
  // request actually touches min/max.
  app.patch<{
    Params: { id: string };
    Body: {
      min?: number;
      max?: number;
      cpuMax?: number;
      ramMax?: number;
      diskMax?: number;
      cpuWarnMax?: number;
      ramWarnMax?: number;
      diskWarnMax?: number;
      slots?: AnnunciatorSlot[];
      testLevel?: { type: "warning" | "error"; level: number } | null;
      testSlotIndex?: number | null;
      // the sections' stamps the editor saw (config_stamps[section].at) -
      // not a config field: an edit of a section changed since is refused
      $seen?: Record<string, string | null>;
    };
  }>(
    "/processes/:id/config",
    { preHandler: requireAuth },
    async (request, reply) => {
      const process = await findProcess(request.params.id);
      if (!process) {
        return reply.code(404).send({ error: "process not found" });
      }

      const { $seen, ...sections } = request.body ?? {};
      // stamps, schema, command log, author - processConfig.ts (shared with
      // the AI Assistant's proposals)
      try {
        const { config, stamps } = await writeProcessConfig(process.id, sections, $seen, request.user.sub, "api");
        return { status: "ok", config, stamps };
      } catch (err) {
        if (err instanceof ProcessWriteError) return reply.code(err.statusCode).send({ error: err.message, ...err.extra });
        throw err;
      }
    },
  );

  // ON / OFF - processWrites.ts switchProcess (shared with the AI Assistant's proposals)
  app.post<{ Params: { id: string }; Body: { action: string } }>(
    "/processes/:id/action",
    { preHandler: requireAuth },
    async (request, reply) => {
      const process = await findProcess(request.params.id);
      if (!process) {
        return reply.code(404).send({ error: "process not found" });
      }

      try {
        await switchProcess(process.id, request.body.action, request.user.sub, "api");
        return { status: "ok" };
      } catch (err) {
        if (err instanceof ProcessWriteError) return reply.code(err.statusCode).send({ error: err.message, ...err.extra });
        throw err;
      }
    },
  );

  // One-shot commands (migrations/1690000000064): a person's command to a
  // process - a calibration start, a replacement done, a test - kept out
  // of its config. Logged like a config edit; reaches the process with the
  // tick's list (PROCESS_SELECT `commands`); the process reports it done.
  app.post<{ Params: { id: string }; Body: { action: string; params?: Record<string, unknown> } }>(
    "/processes/:id/commands",
    { preHandler: requireAuth },
    async (request, reply) => {
      const process = await findProcess(request.params.id);
      if (!process) return reply.code(404).send({ error: "process not found" });
      const { action, params } = request.body ?? ({} as never);
      if (typeof action !== "string" || action === "") return reply.code(400).send({ error: "action is required" });
      return { id: await giveProcessCommand(process.id, action, params ?? {}, request.user.sub, "api") };
    },
  );

  // Orchestrator-driven: the process applied the command (`result` - what it says back, optional).
  app.post<{ Params: { id: string; commandId: string }; Body: { result?: unknown } }>(
    "/processes/:id/commands/:commandId/done",
    async (request, reply) => {
      const result = await pool.query(
        "UPDATE process_commands SET done_at = now(), result = $3 WHERE id = $2 AND process_id = $1 AND done_at IS NULL",
        [request.params.id, request.params.commandId, request.body?.result === undefined ? null : JSON.stringify(request.body.result)],
      );
      return result.rowCount ? { status: "ok" } : reply.code(404).send({ error: "no such pending command" });
    },
  );

  // UI-driven, "heartbeat-control-test" kind only (AGENTS.md's
  // Heartbeating Control section) - a bespoke internal flag, deliberately
  // NOT the generic ON/OFF action above: `status` is a timer-only,
  // non-urgent broadcast field (visibly laggy for exactly this kind of
  // "flip it and watch the effect immediately" use case), so this process
  // stays `permanent` (no actions at all) and gets its own dedicated,
  // instantly-effective toggle instead.
  app.put<{ Params: { id: string }; Body: { simulate: boolean } }>(
    "/processes/:id/heartbeat-test-failure",
    async (request, reply) => {
      const process = await findProcess(request.params.id);
      if (!process) {
        return reply.code(404).send({ error: "process not found" });
      }

      await heartbeatControl.setTestSimulateFailure(process.id, request.body.simulate);
      return { status: "ok" };
    },
  );

  // Orchestrator-driven only - there is no "make critical" button in the
  // UI, this is how a permanent monitor process (e.g. Temperature Safety
  // Monitor) reports what it found on its last tick.
  app.post<{ Params: { id: string }; Body: { critical: boolean } }>("/processes/:id/critical", async (request, reply) => {
    const process = await findProcess(request.params.id);
    if (!process) {
      return reply.code(404).send({ error: "process not found" });
    }

    await processRegistry.setCritical(process.id, request.body.critical, "orchestrator");
    return { status: "ok" };
  });

  // Same as /critical above, but for the less severe warn threshold
  // (AGENTS.md section 21) - a resource-monitor metric past its warn max
  // but not yet its error max highlights the row yellow, not red.
  app.post<{ Params: { id: string }; Body: { warning: boolean } }>("/processes/:id/warning", async (request, reply) => {
    const process = await findProcess(request.params.id);
    if (!process) {
      return reply.code(404).send({ error: "process not found" });
    }

    await processRegistry.setWarning(process.id, request.body.warning, "orchestrator");
    return { status: "ok" };
  });

  // Orchestrator-driven only, same as /critical above - a resource-monitor
  // process pushes its latest CPU/RAM/disk readings here every tick
  // (AGENTS.md section 21); the control-node process (2026-08-09,
  // AGENTS_TO_DO.md "НОДА КОНТРОЛЮ") pushes {temperature, humidity}
  // instead - hence the generic body type, not a fixed cpu/ram/disk
  // shape. Published on the message bus unconditionally
  // (processRegistry.setMetrics) - the UI subscribes to the live feed for
  // these now, the same as status/critical/warning, not a separate poll.
  app.post<{ Params: { id: string }; Body: Record<string, number> }>(
    "/processes/:id/metrics",
    async (request, reply) => {
      const process = await findProcess(request.params.id);
      if (!process) {
        return reply.code(404).send({ error: "process not found" });
      }

      await processRegistry.setMetrics(process.id, request.body, "orchestrator");
      return { status: "ok" };
    },
  );

  // Orchestrator-driven only, same as /critical above - the shared WEM
  // dedup/reconciliation mechanism (AGENTS.md section 22). A process sends
  // the *complete current set* of codes it considers active for one type
  // each time it re-evaluates, not just newly-appearing ones - see
  // processMessages.syncActiveMessages for how that reconciles into
  // inserted/updated/resolved rows.
  app.post<{
    Params: { id: string };
    Body: {
      type: processMessages.MessageType;
      entries: processMessages.MessageInput[];
      autoResolve?: processMessages.AutoResolveMode;
    };
  }>("/processes/:id/messages", async (request, reply) => {
    const process = await findProcess(request.params.id);
    if (!process) {
      return reply.code(404).send({ error: "process not found" });
    }

    await processMessages.syncActiveMessages(
      process.id,
      request.body.type,
      request.body.entries,
      "orchestrator",
      request.body.autoResolve,
    );
    return { status: "ok" };
  });

  // Orchestrator-driven only - a process's events: one-shot reports for
  // the log only, never active (processMessages.logEvents).
  app.post<{ Params: { id: string }; Body: { entries: processMessages.MessageInput[] } }>(
    "/processes/:id/events",
    async (request, reply) => {
      const process = await findProcess(request.params.id);
      if (!process) {
        return reply.code(404).send({ error: "process not found" });
      }
      await processMessages.logEvents(process.id, request.body.entries ?? []);
      return { status: "ok" };
    },
  );

  // Orchestrator-driven only (AGENTS.md section 24) - lets a process force
  // an immediate fleet-wide public-state broadcast outside the normal
  // critical/warning/new-message urgent triggers and the periodic timer,
  // for a producer that knows a change is time-sensitive in a way none of
  // those automatic triggers cover. Fleet-wide, not scoped to one process
  // id - the broadcast itself is always the whole fleet's state (AGENTS.md
  // section 24), so there is nothing to scope by id.
  app.post<{ Body: { reason?: string } }>("/processes/state/broadcast", async (request) => {
    await broadcastForced(request.body?.reason ?? "forced");
    return { status: "ok" };
  });

  // Orchestrator-driven only (AGENTS.md's Heartbeating Control section) -
  // one batched call per tick, not one per process: `index.ts`'s tick()
  // collects every process id whose runner completed *without throwing*
  // this tick and sends the whole list here at once, rather than one HTTP
  // round trip per process per second. A process that isn't in this list
  // (its runner threw, or it has no runner at all - unlikely but not
  // rejected) simply doesn't get its last-seen timestamp refreshed; the
  // "Heartbeating Control" process kind is what actually compares that
  // against each process's configured thresholds.
  app.post<{ Body: { processIds: number[] } }>("/processes/heartbeat", async (request) => {
    await heartbeatControl.touchHeartbeats(request.body.processIds);
    return { status: "ok" };
  });

  // UI-driven dismiss - `hidden` is a single global flag (confirmed with
  // the user, not per-user), so this hides the message for everyone, not
  // just whoever clicked it. No :id/messages nesting check against
  // `messageId` here - a message's own id is already globally unique,
  // same reasoning as e.g. avatar routes not re-validating the user id.
  //
  // The one route in this whole processes/messages surface that requires
  // auth (AGENTS.md section 13/25) - not because the data is sensitive
  // (nothing else here is gated), but because the notification center
  // needs to know *who* dismissed an entry to show it. Safe to require
  // here specifically: every UI caller already has a valid session
  // (AuthGate covers the whole app, no anonymous UI access), so this
  // never actually blocks a real user - it just gives us `request.user.sub`
  // instead of trusting a client-supplied id, which would be spoofable.
  app.patch<{ Params: { messageId: string }; Body: { hidden: boolean } }>(
    "/log-messages/:messageId",
    { preHandler: requireAuth },
    async (request) => {
      await processMessages.setHidden(Number(request.params.messageId), request.body.hidden, request.user.sub);
      return { status: "ok" };
    },
  );

  // Notification center feed (AGENTS.md section 25) - server-side
  // paginated, unlike every other list in this app (section 11 - those
  // are client-side, "tens of rows"; this is an append-only log that only
  // grows). Historical (New/All tabs) only - the Active tab reads live
  // process state instead (section 24/25), never this route. `from`/`to`
  // (AGENTS.md section 29) are the Logs page's processes tab's own
  // addition - the notification center popup never sends them.
  app.get<{
    Querystring: {
      type: processMessages.MessageType | "all";
      scope: processMessages.MessageScope;
      processId?: string;
      processIds?: string; // comma-separated
      search?: string;
      from?: string;
      to?: string;
      page?: string;
      pageSize?: string;
    };
  }>("/log-messages", async (request) => {
    const { type, scope, search, from, to } = request.query;
    const processId = request.query.processId ? Number(request.query.processId) : undefined;
    const asked = request.query.processIds
      ? request.query.processIds.split(",").map(Number).filter(Number.isFinite)
      : undefined;
    // a person limited to some DNP instances sees only their processes' messages (access/scope.ts)
    const visible = await scopeIds(request, "processes.view");
    const processIds = visible ? (asked ?? visible.processIds).filter((id) => visible.processIds.includes(id)) : asked;
    const page = Math.max(1, Number(request.query.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(request.query.pageSize ?? 20)));
    return processMessages.listProcessMessages({ type, scope, processId, processIds, search, from, to, page, pageSize });
  });

  // UI-driven - which Tab Groups (routes/tabGroups.ts) this process is
  // currently curated into (AGENTS.md section 22). Fetched on-demand only
  // when the per-process Settings popup opens, not folded into the main
  // /processes payload above.
  app.get<{ Params: { id: string } }>("/processes/:id/tab-groups", async (request, reply) => {
    const process = await findProcess(request.params.id);
    if (!process) {
      return reply.code(404).send({ error: "process not found" });
    }

    const result = await pool.query<{ tab_group_id: number }>(
      "SELECT tab_group_id FROM process_tab_groups WHERE process_id = $1",
      [process.id],
    );
    return result.rows.map((row) => row.tab_group_id);
  });

  // Replaces the full membership set in one transaction (not incremental
  // add/remove) - matches the checkbox-multiselect popup that's this
  // route's only caller, which always submits the complete new set.
  app.put<{ Params: { id: string }; Body: { tabGroupIds: number[] } }>(
    "/processes/:id/tab-groups",
    async (request, reply) => {
      const process = await findProcess(request.params.id);
      if (!process) {
        return reply.code(404).send({ error: "process not found" });
      }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("DELETE FROM process_tab_groups WHERE process_id = $1", [process.id]);
        for (const tabGroupId of request.body.tabGroupIds) {
          await client.query(
            "INSERT INTO process_tab_groups (process_id, tab_group_id) VALUES ($1, $2)",
            [process.id, tabGroupId],
          );
        }
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }

      return { status: "ok" };
    },
  );

  // UI-driven - which Message Groups (routes/messageGroups.ts) this
  // process currently sends its WEM into (AGENTS.md section 22) - separate
  // notion from Tab Groups above, same shape. Fetched on-demand only when
  // the per-process Settings popup opens.
  app.get<{ Params: { id: string } }>("/processes/:id/message-groups", async (request, reply) => {
    const process = await findProcess(request.params.id);
    if (!process) {
      return reply.code(404).send({ error: "process not found" });
    }

    const result = await pool.query<{ message_group_id: number }>(
      "SELECT message_group_id FROM process_message_groups WHERE process_id = $1",
      [process.id],
    );
    return result.rows.map((row) => row.message_group_id);
  });

  // Replaces the full membership set in one transaction - same "complete
  // new set" contract as /tab-groups above.
  app.put<{ Params: { id: string }; Body: { messageGroupIds: number[] } }>(
    "/processes/:id/message-groups",
    async (request, reply) => {
      const process = await findProcess(request.params.id);
      if (!process) {
        return reply.code(404).send({ error: "process not found" });
      }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("DELETE FROM process_message_groups WHERE process_id = $1", [process.id]);
        for (const messageGroupId of request.body.messageGroupIds) {
          await client.query(
            "INSERT INTO process_message_groups (process_id, message_group_id) VALUES ($1, $2)",
            [process.id, messageGroupId],
          );
        }
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }

      return { status: "ok" };
    },
  );

  // UI-driven - clears the Dashboard flag (AGENTS.md section 22), but only
  // once this process is actually back to zero active WEM entries; a
  // process still genuinely wrong can't be swept off the Dashboard.
  app.delete<{ Params: { id: string } }>("/processes/:id/dashboard-flag", async (request, reply) => {
    const process = await findProcess(request.params.id);
    if (!process) {
      return reply.code(404).send({ error: "process not found" });
    }

    if (await processMessages.hasActiveEntries(process.id)) {
      return reply.code(400).send({ error: "process still has active WEM entries" });
    }

    await pool.query("UPDATE processes SET dashboard_flagged_at = NULL, updated_at = now() WHERE id = $1", [
      process.id,
    ]);
    // Forced, not left to the next periodic/urgent tick (AGENTS.md section
    // 24/26) - the Dashboard tab's eligibility filter prefers the live
    // broadcast's `dashboardFlaggedAt` over this same REST response's own
    // fresher value, so without this the row would linger for up to a
    // full broadcast interval after a successful removal (reported live).
    await broadcastForced("dashboard-flag-cleared");
    return { status: "ok" };
  });
}

async function findProcess(id: string): Promise<ProcessRow | undefined> {
  const result = await pool.query<ProcessRow>(`${PROCESS_SELECT} WHERE p.id = $1`, [id]);
  return result.rows[0];
}

async function withLiveState(process: ProcessRow) {
  const [
    status,
    critical,
    warning,
    metrics,
    messages,
    hasActiveWem,
    heartbeatStopped,
    heartbeatLastSeenAt,
    heartbeatTestSimulateFailure,
    simulationTargetSimulated,
  ] = await Promise.all([
    // "simulation" (AGENTS_TO_DO.md, 2026-08-29) reuses the exact same
    // on/off `status` a controllable process already has - "sleeps
    // until turned on" is just status === "off", no new field. Read
    // here so apps/orchestrator's simulation process kinds get it from
    // the one `GET /processes` call the tick loop already makes every
    // tick, same reasoning as heartbeatStopped/heartbeatLastSeenAt
    // below.
    process.type === "controllable" || process.type === "simulation"
      ? processRegistry.getStatus(process.id)
      : Promise.resolve(undefined),
    processRegistry.getCritical(process.id),
    processRegistry.getWarning(process.id),
    processRegistry.getMetrics(process.id),
    processMessages.listActiveMessages(process.id),
    // Deliberately not derived from `messages` above - listActiveMessages
    // excludes hidden entries, but the Dashboard flag/unflag rule
    // (AGENTS.md section 22) is symmetric on resolved_at regardless of
    // hidden, so the UI's "can this be removed from Dashboard" check needs
    // this separate, unfiltered signal.
    processMessages.hasActiveEntries(process.id),
    // Heartbeating Control (AGENTS.md) - live Redis state alongside the
    // Postgres `heartbeat_control` config already on `process` itself.
    // Read here so apps/orchestrator's heartbeat-control process kind
    // gets everything it needs from the one `GET /processes` call it
    // already makes every tick, no separate endpoint required.
    heartbeatControl.getProcessHeartbeatStopped(process.id),
    heartbeatControl.getProcessLastSeenAt(process.id),
    // "heartbeat-control-test" kind only - fetched unconditionally for
    // every process anyway (same as hasActiveWem above), simpler than
    // branching on kind here.
    heartbeatControl.isTestSimulateFailure(process.id),
    // Second of the two independent gates a simulation process needs
    // (AGENTS_TO_DO.md, 2026-08-29) - see simulationTarget.ts's own doc
    // comment. Only meaningful for type: "simulation", same conditional
    // pattern `status` above already uses.
    process.type === "simulation" ? isSimulationTargetSimulated(process) : Promise.resolve(undefined),
  ]);
  return {
    ...process,
    status,
    critical,
    warning,
    metrics,
    messages,
    hasActiveWem,
    heartbeatStopped,
    heartbeatTestSimulateFailure,
    heartbeatLastSeenAt,
    simulationTargetSimulated,
  };
}
