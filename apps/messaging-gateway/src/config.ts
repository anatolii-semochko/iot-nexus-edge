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
  host: process.env.MESSAGING_GATEWAY_HOST ?? "0.0.0.0",
  port: Number(process.env.MESSAGING_GATEWAY_PORT ?? 3030),
  rabbitmq: {
    // Reuses the single RabbitMQ user already provisioned for the whole
    // platform (RABBITMQ_DEFAULT_USER/PASS) - there is only one role today,
    // so a dedicated messaging-gateway user isn't justified yet. Revisit if
    // per-service RabbitMQ permissions become necessary (see AGENTS.md
    // section 9).
    url: `amqp://${required("RABBITMQ_DEFAULT_USER")}:${required("RABBITMQ_DEFAULT_PASS")}@${required("RABBITMQ_HOST")}:${process.env.RABBITMQ_PORT ?? 5672}`,
  },
  // The Devices API - asked who a WebSocket client is (its session cookie)
  // and what the live stream may show them (access.ts). "api" is the
  // compose service name, the port from env (the orchestrator's pattern).
  apiUrl: `http://api:${process.env.API_PORT ?? 3001}`,
  apiRequestTimeoutMs: Number(process.env.API_REQUEST_TIMEOUT_MS ?? 10000),
  // how often a connected client's scope is asked again (a changed role, an expired session)
  scopeRefreshMs: Number(process.env.GATEWAY_SCOPE_REFRESH_MS ?? 60000),
  redis: {
    host: required("REDIS_HOST"),
    port: Number(process.env.REDIS_PORT ?? 6379),
  },
};
