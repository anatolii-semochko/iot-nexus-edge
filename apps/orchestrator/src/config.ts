// Central place that reads process.env - see AGENTS.md section 1 ("read
// config once at startup; do not scatter process.env.X reads across the
// codebase"). Every other module imports `config`, never process.env
// directly.

export const config = {
  host: process.env.ORCHESTRATOR_HOST ?? "0.0.0.0",
  port: Number(process.env.ORCHESTRATOR_PORT ?? 3000),
  // The orchestrator never talks to Postgres/Redis/EdgeX directly (AGENTS.md
  // section 4/10) - only to the Devices API, the same as any other client.
  // "api" is the docker-compose *service name* (stable, resolved via
  // Docker's internal DNS) - not API_HOST, which is api's own bind address
  // (0.0.0.0) and isn't reachable from another container. Same pattern
  // apps/ui/nginx.conf.template already uses for the same reason - only the
  // port is templated from env, the hostname is not.
  apiUrl: `http://api:${process.env.API_PORT ?? 3001}`,
  // apiClient.ts's own request() timeout (AGENTS_TO_DO.md, 2026-08-29) -
  // generous relative to normal response times (single/double-digit ms,
  // even under real load per live logs) but bounded, so tick()'s own
  // re-entrancy guard (added the same day) can never freeze forever on a
  // single hung call with no timeout at all.
  apiRequestTimeoutMs: Number(process.env.API_REQUEST_TIMEOUT_MS ?? 10000),
  // The internal services' token the API accepts instead of a person's
  // session (header X-Service-Token; apps/api access/guard.ts).
  serviceApiToken: (() => {
    const token = process.env.SERVICE_API_TOKEN;
    if (!token) throw new Error("Missing required environment variable: SERVICE_API_TOKEN");
    return token;
  })(),
  // Same LOG_LEVEL knob as apps/api's own config.ts - this server only
  // ever serves /health and /process-kinds (not the hot path, that's
  // this app acting as a *client* against api's own server), but kept
  // consistent for the same "warn in a resource-constrained deployment"
  // override to be discoverable in one place.
  logLevel: process.env.LOG_LEVEL ?? "info",
  // The Raspberry budget (nexus-edge-aquarium AGENTS_TO_DO.md 2026-10-16):
  // a process's unchanged state reports (flags, metrics, messages) and
  // unchanged AUTO device values are not sent again every tick - only
  // re-sent / re-asserted after this long (a restarted API converges, a
  // device that drifted gets corrected).
  reportResendMs: Number(process.env.ORCHESTRATOR_REPORT_RESEND_MS ?? 60000),
  autoReassertMs: Number(process.env.ORCHESTRATOR_AUTO_REASSERT_MS ?? 60000),
  // How often the "ai-assistant" process asks the API to start the due
  // scheduled AI runs (processes/aiAssistant.ts) - the calendar's resolution.
  aiCalendarIntervalMs: Number(process.env.AI_CALENDAR_INTERVAL_MS ?? 60000),
  // Extension points (AGENTS_TO_DO.md 2026-07-29) - a target project's own
  // process kinds (e.g. nexus-edge-smart-house's temperature-control),
  // scanned by processPlugins.ts. Unset for this repo's own docker-compose
  // (nothing to scan).
  processPlugins: {
    // CORE Library process kinds (devices/processes/*/process.ts, AGENTS.md
    // section 82) - baked into this image, always scanned, the same way
    // apps/api always scans devices/ for api.ts. A target project's own
    // kinds come from its roots on top - one or several, comma-separated
    // "label=path" or "path" (the demo project on the aquarium's packages;
    // the same format as the api's - apps/api projectRoots.ts).
    builtinDevicesDir: process.env.BUILTIN_DEVICES_DIR ?? "/workspace/devices",
    extraDirs: (process.env.EXTRA_PROCESS_PLUGINS_DIR ?? "")
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean)
      .map((entry, i) => {
        const eq = entry.indexOf("=");
        return { label: eq > 0 ? entry.slice(0, eq).trim() : i === 0 ? "private" : `private-${i + 1}`, dir: eq > 0 ? entry.slice(eq + 1).trim() : entry };
      }),
  },
  // nexus.events subscription (busEvents.ts) for process onDeviceEvent
  // hooks (AGENTS.md section 80) and change events (changeEvents.ts) - the
  // same RabbitMQ user/host the Devices API publishes with. Optional:
  // without RABBITMQ_HOST, hooks simply never fire, caches only expire by
  // their TTLs and processes keep running on the tick alone.
  rabbitmq: process.env.RABBITMQ_HOST
    ? {
        url: `amqp://${process.env.RABBITMQ_DEFAULT_USER}:${process.env.RABBITMQ_DEFAULT_PASS}@${process.env.RABBITMQ_HOST}:${process.env.RABBITMQ_PORT ?? 5672}`,
      }
    : null,
};
