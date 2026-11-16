import pino from "pino";
import { config } from "./config.js";
import { errorLogStream } from "./errorLog.js";

// Separate from Fastify's request-scoped logger: RabbitMQ connection
// lifecycle events and best-effort cache/bus failures (dualDevicesModel.ts,
// messaging.ts) happen outside any HTTP request and need somewhere to log
// regardless.
// The log lines go to stdout; the errors also to the database (errorLog.ts - they outlive the container).
export const logStreams = () =>
  pino.multistream([
    { level: config.logLevel as pino.Level, stream: process.stdout },
    { level: "error", stream: errorLogStream },
  ]);
export const logger = pino({ name: "api", level: config.logLevel }, logStreams());
