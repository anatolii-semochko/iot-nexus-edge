import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

import type { FastifyInstance } from "fastify";

import { requireAdmin } from "../auth.js";
import { config } from "../config.js";
import { configSchemaKinds } from "../configSchemas.js";
import { pool } from "../db.js";
import { applyPendingExtraMigrations, listExtraMigrations } from "../extraMigrations.js";

// The DNPs of this system and their migrations (nexus-edge-aquarium
// AGENTS_TO_DO.md 2026-10-16, tech debt 11) - for a person (Service ->
// Database -> Migrations) and the coming AI assistant that registers and
// configures DNPs. Admin only.
// - GET /dnp - the Library catalog's DNPs (device / node / process types,
//   public and the project's private ones, with `version` - "0" unset) and
//   the project's code plugins (plugins/<name>: what each brings - api.ts,
//   process.ts, ui; `plugin.json` {version, description} optional), the
//   process kinds with a config schema;
// - GET /dnp/migrations - the core's (node-pg-migrate) and the project's
//   (extraMigrations.ts: applied / pending / changed);
// - POST /dnp/migrations/apply - the project's pending ones, now.

const exists = async (p: string) => stat(p).then(() => true, () => false);

async function projectPlugins(): Promise<object[]> {
  const out: object[] = [];
  for (const { dir } of config.apiPlugins.extraDirs)
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const root = path.join(dir, entry.name);
    const manifest = await readFile(path.join(root, "plugin.json"), "utf8").then(
      (t) => JSON.parse(t) as { version?: string; description?: string },
      () => ({}) as { version?: string; description?: string },
    );
    const [api, processCode, ui] = await Promise.all([exists(path.join(root, "api.ts")), exists(path.join(root, "process.ts")), exists(path.join(root, "ui"))]);
    // a folder of Library-style DNPs (devices/, nodes/, processes/) - listed by the catalog instead
    if (!api && !processCode && !ui) continue;
    out.push({ name: entry.name, version: manifest.version ?? "0", description: manifest.description ?? null, brings: { api, process: processCode, ui } });
  }
  return out.sort((a: any, b: any) => a.name.localeCompare(b.name)); // eslint-disable-line @typescript-eslint/no-explicit-any
}

export async function dnpRoutes(app: FastifyInstance): Promise<void> {
  app.get("/dnp", { preHandler: requireAdmin }, async () => {
    const library = (
      await pool.query<{ id: string; kind: string; type_name: string; name: string; folder_path: string; version: string | null }>(
        "SELECT id, kind, type_name, name, folder_path, version FROM library_items ORDER BY kind, folder_path",
      )
    ).rows.map((r) => ({ id: r.id, kind: r.kind, type: r.type_name, name: r.name, folder: r.folder_path, version: r.version ?? "0" }));
    return { library, plugins: await projectPlugins(), configSchemaKinds: configSchemaKinds() };
  });

  app.get("/dnp/migrations", { preHandler: requireAdmin }, async () => {
    const core = (await pool.query<{ name: string; run_on: Date }>("SELECT name, run_on FROM pgmigrations ORDER BY id")).rows.map((r) => ({
      name: r.name,
      appliedAt: r.run_on.toISOString(),
    }));
    return { core, project: await listExtraMigrations() };
  });

  app.post("/dnp/migrations/apply", { preHandler: requireAdmin }, async (_request, reply) => {
    const result = await applyPendingExtraMigrations();
    return result.failed ? reply.code(500).send({ error: `${result.failed.name}: ${result.failed.error}`, ...result }) : result;
  });
}
