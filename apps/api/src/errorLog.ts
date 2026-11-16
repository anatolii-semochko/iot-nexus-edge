import { Writable } from "node:stream";
import { pool } from "./db.js";

// The error-level log lines (pino level 50+) of the API kept in `api_errors` (migration 111) - they
// outlive a deploy's new container and the log rotation. Written after the line went to stdout, never
// awaited by the caller; a failed insert goes to stderr only (logging it again would loop).
const ERROR_LEVEL = 50;
const MAX_DETAIL_CHARS = 20_000;

export const errorLogStream = new Writable({
  write(chunk: Buffer, _encoding, done) {
    done();
    let line: Record<string, unknown>;
    try {
      line = JSON.parse(chunk.toString("utf8"));
    } catch {
      return;
    }
    if (typeof line.level !== "number" || line.level < ERROR_LEVEL) return;
    const { level: _level, time, pid: _pid, hostname: _hostname, name, msg, req, ...rest } = line;
    // the request: Fastify's own (req) or the failed-request line's fields (server.ts)
    const request = (req ?? rest) as { method?: string; url?: string } | undefined;
    const source = request?.method ? `${request.method} ${request.url ?? ""}` : String(name ?? "api");
    let detail = JSON.stringify(rest);
    if (detail.length > MAX_DETAIL_CHARS) detail = JSON.stringify({ cut: detail.slice(0, MAX_DETAIL_CHARS) });
    pool
      .query("INSERT INTO api_errors (created_at, source, msg, detail) VALUES (to_timestamp($1 / 1000.0), $2, $3, $4)", [
        typeof time === "number" ? time : Date.now(),
        source,
        String(msg ?? ""),
        detail,
      ])
      .catch((err: unknown) => process.stderr.write(`api_errors: not stored - ${err instanceof Error ? err.message : String(err)}\n`));
  },
});
