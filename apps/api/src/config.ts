// Central place that reads process.env - see AGENTS.md section 1 ("read
// config once at startup; do not scatter process.env.X reads across the
// codebase"). Every other module imports `config`, never process.env
// directly.

import { parseRoots } from "./projectRoots.js";

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
    // the device-service's name in EdgeX (apps/device-service) - the service a
    // device registered through the API (registry.ts) is bound to
    deviceServiceName: process.env.EDGEX_DEVICE_SERVICE_NAME ?? "device-nexus-edge",
    // EdgeX's own internal message bus (edgex-mqtt-broker) - read by the
    // device push bridge (edgexPushBridge.ts, AGENTS.md section 80).
    // Optional: unset = pushes not bridged, polling still works as before.
    messageBus: {
      host: process.env.EDGEX_MESSAGEBUS_HOST,
      port: Number(process.env.EDGEX_MESSAGEBUS_PORT ?? 1883),
      clientId: process.env.EDGEX_MESSAGEBUS_CLIENT_ID ?? "nexus-edge-api-push-bridge",
    },
  },
  // Sign-in and access control (AGENTS.md section 13; access/ - B1): a
  // session's token lives JWT_TOKEN_TTL seconds (its cookie too - it outlives
  // the browser); the server keeps each session's last activity
  // (user_sessions) - one unused for JWT_TIME_INVALIDATION seconds is over,
  // and signing out / a deactivation revokes it at once. The internal
  // services (orchestrator, device-service) send SERVICE_API_TOKEN instead.
  auth: {
    jwtSecret: required("JWT_SECRET"),
    tokenTtlSeconds: Number(process.env.JWT_TOKEN_TTL ?? 31536000),
    idleSeconds: Number(process.env.JWT_TIME_INVALIDATION ?? 36000),
    // a session's last activity is written at most this often (every request reads it)
    activityWriteSeconds: Number(process.env.AUTH_ACTIVITY_WRITE_SECONDS ?? 60),
    serviceApiToken: required("SERVICE_API_TOKEN"),
    // how long a person's computed permissions are reused before re-reading the roles, ms
    principalCacheMs: Number(process.env.AUTH_PRINCIPAL_CACHE_MS ?? 15000),
    cookieName: "nexus_edge_session",
    // Only over HTTPS in production - this platform runs over plain HTTP on
    // a local network today, no TLS termination configured anywhere yet.
    secureCookies: process.env.NODE_ENV === "production",
    // the guest's conversations of more than its settings' days go at this local time (HH:MM; maintenance.ts)
    guestCleanupAt: process.env.GUEST_CLEANUP_AT ?? "03:00",
  },
  // External data services the Library packages use (fetched by the API,
  // never by a browser): the weather forecast (weather-control - Open-Meteo,
  // no key); day-ahead electricity prices (energy-grid - Energy-Charts of
  // Fraunhofer ISE, aWATTar as the fallback; no keys).
  services: {
    openMeteoUrl: process.env.OPEN_METEO_URL ?? "https://api.open-meteo.com/v1/forecast",
    energyChartsUrl: process.env.ENERGY_CHARTS_URL ?? "https://api.energy-charts.info/price",
    awattarUrl: process.env.AWATTAR_URL ?? "https://api.awattar.de/v1/marketdata",
    // the map tiles of a node's information popup ({z}/{x}/{y} in the
    // template), fetched and cached by the API (routes/map.ts) - the
    // browser never calls the tile server; its usage policy wants a
    // User-Agent naming the application and an attribution where shown
    mapTilesUrl: process.env.MAP_TILES_URL ?? "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    mapTilesAttribution: process.env.MAP_TILES_ATTRIBUTION ?? "© OpenStreetMap contributors",
    mapTilesUserAgent: process.env.MAP_TILES_USER_AGENT ?? "NexusEdge (IoT platform)",
    mapTilesCacheSize: Number(process.env.MAP_TILES_CACHE_SIZE ?? 500),
  },
  // The nightly maintenance (maintenance.ts): logs older than
  // LOG_RETENTION_DAYS cleared at LOG_RETENTION_AT (0 / empty - never); the
  // time series' raw samples kept SAMPLES_RETENTION_DAYS (a TimescaleDB
  // retention policy; 0 - forever - the hourly / daily aggregates stay).
  logRetentionDays: Number(process.env.LOG_RETENTION_DAYS ?? 0),
  logRetentionAt: process.env.LOG_RETENTION_AT ?? "03:30",
  samplesRetentionDays: Number(process.env.SAMPLES_RETENTION_DAYS ?? 0),
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
    // one model call of a conversation (the agent) - a long context with tool results takes longer
    chatTimeoutMs: Number(process.env.AI_CHAT_TIMEOUT_MS ?? 90000),
    // an answer's tokens when the connection sets no limit of its own
    defaultMaxOutputTokens: Number(process.env.AI_MAX_OUTPUT_TOKENS ?? 2048),
    // the core's prompt packs (ai/prompts.ts) - relative to the api's working directory
    promptsDir: process.env.AI_PROMPTS_DIR ?? "prompts",
    // what `docs.search` reads (ai/docs.ts): "label=dir" pairs, comma-separated -
    // the core's docs (copied into the image), the Library DNPs, the project's
    // docs (mounted) and its plugins (their docs / node docs / prompts)
    docsSources: (process.env.AI_DOCS_SOURCES ?? "core=/workspace/docs-core,library=/workspace/devices,project=/workspace/project-docs,plugins=/workspace/plugins")
      .split(",")
      .map((pair) => pair.split("="))
      .filter(([label, dir]) => label && dir)
      .map(([label, dir]) => ({ label: label.trim(), dir: dir.trim() })),
    // a tool answer's size limit, characters (the gateway cuts longer ones)
    toolMaxChars: Number(process.env.AI_TOOL_MAX_CHARS ?? 12000),
    // the agent (ai/agent.ts): model calls in one answer (each may call tools);
    // the conversation history sent back, characters (older turns are dropped)
    agentMaxSteps: Number(process.env.AI_AGENT_MAX_STEPS ?? 8),
    historyMaxChars: Number(process.env.AI_HISTORY_MAX_CHARS ?? 40000),
    // the messenger's "Quick start" for a newcomer (2026-10-24): the whole system's work types offered first
    quickStart: (process.env.AI_QUICK_START ?? "status-analysis,wem-analysis,analysis-proposals")
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean),
    // the calendar (ai/calendar.ts): how late a scheduled run may still start, minutes
    // (the system down longer - that occurrence is skipped)
    calendarCatchUpMin: Number(process.env.AI_CALENDAR_CATCH_UP_MIN ?? 30),
    // the language a scheduled run reports in (no person asks - nothing to answer in kind)
    scheduledLanguage: process.env.AI_SCHEDULED_LANGUAGE ?? "English",
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
    // a Dashboard card's own picture / background (dashboard_card_images - in the database)
    dashboardImageMaxBytes: Number(process.env.DASHBOARD_IMAGE_MAX_BYTES ?? 1024 * 1024),
    // a larger upload (up to this) is shrunk to fit the store: its longest side to ..._MAX_SIDE, WebP
    // at the qualities tried in turn (images.ts fitImage)
    dashboardImageUploadMaxBytes: Number(process.env.DASHBOARD_IMAGE_UPLOAD_MAX_BYTES ?? 8 * 1024 * 1024),
    dashboardImageMaxSide: Number(process.env.DASHBOARD_IMAGE_MAX_SIDE ?? 1600),
    dashboardImageWebpQualities: (process.env.DASHBOARD_IMAGE_WEBP_QUALITIES ?? "86,76,64,50").split(",").map(Number),
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
  // The project's plugin roots (projectRoots.ts - one or several, e.g. the
  // demo project on the aquarium's packages): "label=path" or "path", comma-separated.
  apiPlugins: {
    builtinDevicesDir: process.env.BUILTIN_DEVICES_DIR ?? "/workspace/devices",
    extraDirs: parseRoots(process.env.EXTRA_API_PLUGINS_DIR, "private"),
  },
  // A target project's own Postgres migrations (extraMigrations.ts) - its
  // migrations/ directory mounted here, or several (a dependency's first);
  // none set - none.
  extraMigrations: {
    dirs: parseRoots(process.env.EXTRA_MIGRATIONS_DIR, "project"),
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
