import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { config } from "./config.js";
import { pool } from "./db.js";
import { logger } from "./logger.js";

// A target project's own Postgres migrations (nexus-edge-aquarium
// AGENTS_TO_DO.md 2026-10-16, tech debt 11 - was the one-off `migrate-extra`
// container): each root's (config.extraMigrations.dirs - one or several,
// a dependency's first - projectRoots.ts) `*.sql`, root by root in file-name
// order, each
// applied ONCE and recorded in `extra_migrations` (name, sha256 - the same
// table and checksums the container kept). Run with psql (in this image), so
// a file may use psql's \gset / \if. When:
// - the api starts (after its own migrations) - they came with a
//   deployment (2026-10-17: no "wait for a confirmation" mode - what the AI
//   assistant proposes goes through its Install access level);
// - POST /dnp/migrations/apply (an admin; the assistant - stage 5).
// A recorded file changed since - reported ("changed"), never re-run: a
// new migration is written instead. Recorded as its file name (the first
// root - as in the single-root days) or "<root label>/<file name>".

export interface ExtraMigration {
  name: string;
  file: string;
  checksum: string;
  status: "applied" | "pending" | "changed";
  appliedAt: string | null;
}

const NAME = /^[A-Za-z0-9_.-]+\.sql$/;

// Run after a batch applied at least one migration (on start or later): the
// data a plugin derives at its own start (e.g. stored totals) may predate the
// rows these migrations added - api plugins subscribe via their context.
type AppliedListener = (applied: string[]) => void | Promise<void>;
const appliedListeners: AppliedListener[] = [];

export function onProjectMigrationsApplied(fn: AppliedListener): void {
  appliedListeners.push(fn);
}

async function notifyApplied(applied: string[]): Promise<void> {
  for (const fn of appliedListeners) {
    try {
      await fn(applied);
    } catch (err) {
      logger.error({ err }, "a project-migrations listener failed");
    }
  }
}

async function ensureTable(): Promise<void> {
  await pool.query(`CREATE TABLE IF NOT EXISTS extra_migrations (
    name text PRIMARY KEY,
    checksum text NOT NULL,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);
}

/** The project's migrations and their state, root by root (empty - no directory configured). */
export async function listExtraMigrations(): Promise<ExtraMigration[]> {
  const roots = config.extraMigrations.dirs;
  if (roots.length === 0) return [];
  await ensureTable();
  const recorded = new Map(
    (await pool.query<{ name: string; checksum: string; applied_at: Date }>("SELECT name, checksum, applied_at FROM extra_migrations")).rows.map((r) => [r.name, r]),
  );
  const out: ExtraMigration[] = [];
  for (const [i, root] of roots.entries()) {
    const files = (await readdir(root.dir)).filter((f) => NAME.test(f)).sort();
    for (const file of files) {
      const name = i === 0 ? file : `${root.label}/${file}`;
      const checksum = createHash("sha256").update(await readFile(path.join(root.dir, file))).digest("hex");
      const r = recorded.get(name);
      out.push({
        name,
        file: path.join(root.dir, file),
        checksum,
        status: !r ? "pending" : r.checksum === checksum ? "applied" : "changed",
        appliedAt: r ? r.applied_at.toISOString() : null,
      });
    }
  }
  return out;
}

// one psql run of a file - its output into the log
function runPsql(file: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("psql", ["-v", "ON_ERROR_STOP=1", "-q", "-f", file], {
      env: {
        ...process.env,
        PGHOST: config.postgres.host,
        PGPORT: String(config.postgres.port),
        PGDATABASE: config.postgres.database,
        PGUSER: config.postgres.user,
        PGPASSWORD: config.postgres.password,
      },
    });
    let output = "";
    child.stdout.on("data", (d) => (output += d));
    child.stderr.on("data", (d) => (output += d));
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`psql exited ${code}: ${output.trim().slice(-2000)}`))));
  });
}

let running: Promise<{ applied: string[]; failed: { name: string; error: string } | null }> | null = null;

/** Applies the pending migrations, in order, stopping at the first failure. One run at a time. */
export function applyPendingExtraMigrations(): Promise<{ applied: string[]; failed: { name: string; error: string } | null }> {
  running ??= (async () => {
    const applied: string[] = [];
    try {
      for (const m of (await listExtraMigrations()).filter((x) => x.status === "pending")) {
        try {
          await runPsql(m.file);
        } catch (err) {
          logger.error({ err, migration: m.name }, "project migration failed");
          return { applied, failed: { name: m.name, error: err instanceof Error ? err.message : String(err) } };
        }
        await pool.query("INSERT INTO extra_migrations (name, checksum) VALUES ($1, $2)", [m.name, m.checksum]);
        applied.push(m.name);
        logger.info({ migration: m.name }, "project migration applied");
      }
      return { applied, failed: null };
    } finally {
      running = null;
      if (applied.length > 0) await notifyApplied(applied);
    }
  })();
  return running;
}

/** On the api's start: the pending ones applied. */
export async function runExtraMigrationsOnStart(): Promise<void> {
  if (config.extraMigrations.dirs.length === 0) return;
  const all = await listExtraMigrations();
  const pending = all.filter((m) => m.status === "pending");
  const changed = all.filter((m) => m.status === "changed");
  for (const m of changed) logger.warn({ migration: m.name }, "project migration changed after it was applied - not re-run (write a new one)");
  if (pending.length === 0) return;
  const { applied, failed } = await applyPendingExtraMigrations();
  logger.info({ applied: applied.length, failed: failed?.name ?? null }, "project migrations on start");
}
