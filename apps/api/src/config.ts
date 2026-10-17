// Central place that reads process.env - see AGENTS.md section 1 ("read
// config once at startup; do not scatter process.env.X reads across the
// codebase"). Every other module imports `config`, never process.env
// directly.

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config = {
  host: process.env.API_HOST ?? "0.0.0.0",
  port: Number(process.env.API_PORT ?? 3001),
  // Fastify's own per-request auto-logging (every incoming request +
  // completed response, at "info") - real, measurable CPU/IO cost under
  // sustained internal traffic (found live 2026-08-29 on a Raspberry Pi
  // deployment: ~60 req/s from the orchestrator's own 1Hz tick touching
  // ~20+ individual devices with no batch endpoint, each producing 2 JSON
  // log lines). Defaults to "info" (today's existing behavior, unchanged
  // for local dev) - a resource-constrained deployment sets LOG_LEVEL=warn
  // in its own .env to drop the per-request noise while keeping real
  // logger.warn()/error() calls elsewhere in the app visible.
  logLevel: process.env.LOG_LEVEL ?? "info",
  // POST /devices/values (AGENTS.md section 88): how old a PHYSICAL
  // sensor's cached reading may be before the batch read goes to EdgeX
  // for a fresh one.
  deviceValuesMaxAgeMs: Number(process.env.DEVICE_VALUES_MAX_AGE_MS ?? 5000),
  postgres: {
    host: required("POSTGRES_HOST"),
    port: Number(process.env.POSTGRES_PORT ?? 5432),
    database: required("POSTGRES_DB"),
    user: required("POSTGRES_USER"),
    password: required("POSTGRES_PASSWORD"),
  },
  redis: {
    host: required("REDIS_HOST"),
    port: Number(process.env.REDIS_PORT ?? 6379),
  },
  rabbitmq: {
    // Reuses the single RabbitMQ user already provisioned for the whole
    // platform (RABBITMQ_DEFAULT_USER/PASS) - see the same note in
    // apps/messaging-gateway/src/config.ts.
    url: `amqp://${required("RABBITMQ_DEFAULT_USER")}:${required("RABBITMQ_DEFAULT_PASS")}@${required("RABBITMQ_HOST")}:${process.env.RABBITMQ_PORT ?? 5672}`,
  },
  edgex: {
    coreMetadataUrl: `http://${required("EDGEX_CORE_METADATA_HOST")}:${process.env.EDGEX_CORE_METADATA_PORT ?? 59881}`,
    coreDataUrl: `http://${required("EDGEX_CORE_DATA_HOST")}:${process.env.EDGEX_CORE_DATA_PORT ?? 59880}`,
    coreCommandUrl: `http://${required("EDGEX_CORE_COMMAND_HOST")}:${process.env.EDGEX_CORE_COMMAND_PORT ?? 59882}`,
    // EdgeX's own internal message bus (edgex-mqtt-broker) - read by the
    // device push bridge (edgexPushBridge.ts, AGENTS.md section 80).
    // Optional: unset = pushes not bridged, polling still works as before.
    messageBus: {
      host: process.env.EDGEX_MESSAGEBUS_HOST,
      port: Number(process.env.EDGEX_MESSAGEBUS_PORT ?? 1883),
      clientId: process.env.EDGEX_MESSAGEBUS_CLIENT_ID ?? "nexus-edge-api-push-bridge",
    },
  },
  // UI login only (AGENTS.md section 13) - not per-endpoint API
  // authorization, which stays a separate, not-yet-started task.
  auth: {
    jwtSecret: required("JWT_SECRET"),
    tokenTtl: process.env.JWT_EXPIRES_IN ?? "12h",
    cookieName: "nexus_edge_session",
    // Only over HTTPS in production - this platform runs over plain HTTP on
    // a local network today, no TLS termination configured anywhere yet.
    secureCookies: process.env.NODE_ENV === "production",
  },
  // AI layer (AGENTS.md section 82; connections - ai/connections.ts,
  // Service -> Config -> AI). No connection = AI unavailable: consumers
  // record an error instead of analysing, the platform itself is unaffected.
  ai: {
    // the master key the connections' API keys are encrypted with (ai/secrets.ts)
    secretsKey: process.env.AI_SECRETS_KEY,
    // imported ONCE as the first connection when there is none yet
    // (ai/connections.ts importEnvConnection) - may be removed from .env then
    provider: process.env.AI_PROVIDER ?? "openai",
    openaiApiKey: process.env.OPENAI_API_KEY,
    openaiModel: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
    requestTimeoutMs: Number(process.env.AI_REQUEST_TIMEOUT_MS ?? 25000),
    // an answer's tokens when the connection sets no limit of its own
    defaultMaxOutputTokens: Number(process.env.AI_MAX_OUTPUT_TOKENS ?? 2048),
    // Longest side of the copy sent for analysis - the original is kept as is.
    imageMaxSide: Number(process.env.AI_IMAGE_MAX_SIDE ?? 1536),
  },
  // Media Store (AGENTS.md section 81) - device media (camera frames etc.)
  // as plain files on a docker volume, no DB table.
  media: {
    dir: process.env.MEDIA_DIR ?? "/workspace/apps/api/media",
    maxFileBytes: Number(process.env.MEDIA_MAX_FILE_BYTES ?? 8 * 1024 * 1024),
    // Longest side of generated thumbnails (e.g. preview.jpg next to a frame).
    previewMaxSide: Number(process.env.MEDIA_PREVIEW_MAX_SIDE ?? 320),
  },
  uploads: {
    avatarsDir: process.env.AVATAR_UPLOAD_DIR ?? "/workspace/apps/api/uploads/avatars",
    avatarMaxSizeBytes: Number(process.env.AVATAR_MAX_SIZE_BYTES ?? 2 * 1024 * 1024),
  },
  // Change notifications (entityChanges.ts): the wait before the LISTEN
  // connection to Postgres is opened again after it dropped.
  entityChanges: {
    reconnectMs: Number(process.env.ENTITY_CHANGES_RECONNECT_MS ?? 5000),
  },
  // Fleet-wide process public-state broadcast (AGENTS.md section 24) -
  // independent of the orchestrator's own 1s compute tick. Urgent changes
  // (critical/warning transitions, a new active WEM entry, or an explicit
  // forced broadcast) push immediately regardless of this interval.
  // One-shot process commands (routes/processes.ts, migrations/1690000000064):
  // a command not taken within this is dropped - never applied late (a
  // "replace the cartridge" days after the click).
  processCommands: {
    ttlMs: Number(process.env.PROCESS_COMMAND_TTL_MS ?? 10 * 60_000),
  },
  processState: {
    broadcastIntervalMs: Number(process.env.PROCESS_STATE_BROADCAST_INTERVAL_MS ?? 5000),
  },
  // Command-API extension points (extension points design, AGENTS_TO_DO.md
  // 2026-07-28) - both scanned for api.ts plugin files by apiPlugins.ts,
  // Library first then private. builtinDevicesDir has no consumers yet
  // (zero api.ts today) but is always scanned - see apiPlugins.ts.
  // extraApiPluginsDir is unset by default (nothing to scan for this
  // repo's own docker-compose); a target project sets it to its own
  // plugins/ directory.
  apiPlugins: {
    builtinDevicesDir: process.env.BUILTIN_DEVICES_DIR ?? "/workspace/devices",
    extraDir: process.env.EXTRA_API_PLUGINS_DIR,
  },
  // A target project's own Postgres migrations (extraMigrations.ts) - its
  // migrations/ directory mounted here; unset - none.
  extraMigrations: {
    dir: process.env.EXTRA_MIGRATIONS_DIR,
  },
  // AGENTS_TO_DO.md, 2026-08-14 process management - internal compose-
  // network URL, not a host-published port (see ORCHESTRATOR_PORT in
  // docker-compose.yml, which is a different, host-facing concern).
  // Used only for GET /process-kinds (routes/processes.ts's own
  // registered-kinds proxy) - a "which processes rows are pending an
  // orchestrator restart" signal, nothing else reaches into orchestrator
  // from this service.
  orchestratorUrl: process.env.ORCHESTRATOR_URL ?? `http://orchestrator:${process.env.ORCHESTRATOR_PORT ?? 3000}`,
  // Service->Commands (AGENTS_TO_DO.md, 2026-08-30) - host power commands
  // (systemCommands.ts, routes/service.ts) via a D-Bus systemd-logind call.
  // Both default false: a fresh checkout, or a target project that hasn't
  // mounted /run/dbus/system_bus_socket into the api container, must not
  // show or allow these even though the routes/UI exist unconditionally.
  service: {
    shutdownEnabled: process.env.SHUTDOWN_ENABLE === "true",
    restartEnabled: process.env.RESTART_ENABLE === "true",
  },
  // Service->Database (AGENTS_TO_DO.md, 2026-08-30) - System Stamps
  // (config-table snapshots) saved as files here, not a DB table ("стани
  // в файлах" - restoring FROM the very database being restored would be
  // an awkward dependency). Same volume-mount pattern as uploads.avatarsDir.
  systemStamps: {
    dir: process.env.SYSTEM_STAMPS_DIR ?? "/workspace/apps/api/uploads/system-stamps",
    maxUploadSizeBytes: Number(process.env.SYSTEM_STAMP_MAX_SIZE_BYTES ?? 50 * 1024 * 1024),
  },
};
