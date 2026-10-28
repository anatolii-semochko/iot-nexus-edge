import { readFile } from "node:fs/promises";
import path from "node:path";

import { config } from "../config.js";
import type { AiManifest } from "./manifests.js";

// The prompt packs (apps/api/prompts/README.md): the base system prompt +
// the knowledge note, then the work type's prompt - the whole system's
// (prompts/nexus-edge/<key>.md) or a DNP instance's (its plugin's
// prompts/<key>.md, else the core's prompts/dnp/<key>.md). Read from disk
// on use and cached - they change only with a deployment.

const cache = new Map<string, Promise<string | null>>();

function readCached(file: string): Promise<string | null> {
  let hit = cache.get(file);
  if (!hit) {
    hit = readFile(file, "utf8").then(
      (t) => t.trim(),
      () => null,
    );
    cache.set(file, hit);
  }
  return hit;
}

const core = (...parts: string[]) => path.resolve(config.ai.promptsDir, ...parts);

/** The developer-report instruction (the instance's Report access on). */
export const reportInstruction = (): Promise<string | null> => readCached(core("report.md"));

/** A guest's conversation: what to answer, and the off-topic mark (ai/agent.ts OFF_TOPIC). */
export const guestInstruction = (): Promise<string | null> => readCached(core("guest.md"));

/** The calendar's request of a scheduled run (ai/calendar.ts) - "{workType}" / "{entity}" filled in. */
export const scheduledRunRequest = (): Promise<string | null> => readCached(core("scheduled.md"));

/** The system prompt for a work type: the base, the knowledge note, the work type's own (null - unknown work type). */
export async function systemPromptFor(workType: string, manifest: AiManifest | null): Promise<string | null> {
  if (!/^[a-z0-9-]+$/.test(workType)) return null;
  const own = manifest
    ? ((await readCached(path.join(manifest.dir, "prompts", `${workType}.md`))) ?? (await readCached(core("dnp", `${workType}.md`))))
    : await readCached(core("nexus-edge", `${workType}.md`));
  if (own === null) return null;
  const [base, knowledge] = await Promise.all([readCached(core("system.md")), readCached(core("knowledge.md"))]);
  return [base, knowledge, own].filter(Boolean).join("\n\n");
}
