import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { config } from "../config.js";

// The DNPs' AI manifests (Nexus Edge AI Assistant, stage 2 - nexus-edge-
// aquarium AGENTS_TO_DO.md 2026-10-17): a project plugin declares in its
// `plugin.json`:
//   "ai": {
//     "kinds": ["aquarium-control"],          // the process kinds whose instances get the assistant
//     "workTypes": ["help", ..., {"key": "tank-health", "title": "...", "description": "..."}],
//     "scheduledTypes": ["status-analysis"]   // what the calendar may run (stage 6)
//   }
// A standard work type is named by its key (DNP_WORK_TYPES - the core's
// prompt `prompts/dnp/<key>.md`); a DNP's own - an object, its prompt in
// `<plugin>/prompts/<key>.md` (which may also override a standard one).
// Library DNPs (library.json) - later, the same block.

export interface WorkType {
  key: string;
  title: string;
  description: string;
}

// The whole system's work types (entity "Nexus Edge") - prompts/nexus-edge/<key>.md
export const NE_WORK_TYPES: WorkType[] = [
  { key: "about-help", title: "About & Help", description: "What the assistant is and how to use Nexus Edge" },
  { key: "status-analysis", title: "Status Analysis", description: "What works, what is degraded and why" },
  { key: "wem-analysis", title: "WEM Analysis", description: "Warnings, errors, messages: causes and fixes" },
  { key: "system-testing", title: "System Testing", description: "The tests the DNPs declare and their results" },
  { key: "install-dnp", title: "Install DNP", description: "Connect new equipment and register it" },
  { key: "config-dnp", title: "Config DNP", description: "Set up the instances" },
  { key: "control-rules", title: "Control Rules", description: "Rules in words turned into the system's rules" },
  { key: "automated-control-rules", title: "Automated Control Rules", description: "Rules found from the history" },
  { key: "control-tasks", title: "Control Tasks", description: "One-off and scheduled actions" },
  { key: "analysis-proposals", title: "Analysis and Proposals", description: "Trends, waste, improvements" },
  { key: "developer-report", title: "Developer Report", description: "A bug, a gap or an idea for the developers" },
  { key: "other", title: "Other", description: "Anything else" },
];

// The standard work types of a DNP instance - prompts/dnp/<key>.md
export const DNP_WORK_TYPES: WorkType[] = [
  { key: "help", title: "Help", description: "How it works, how to connect and set it up" },
  { key: "status-analysis", title: "Status Analysis", description: "Its state, what is off and why" },
  { key: "wem-analysis", title: "WEM Analysis", description: "Its warnings, errors, messages" },
  { key: "config", title: "Config", description: "Its settings for the user's goal" },
  { key: "control-rules", title: "Control Rules", description: "Its rules from words" },
  { key: "automated-control-rules", title: "Automated Control Rules", description: "Its rules from the history" },
  { key: "control-tasks", title: "Control Tasks", description: "One-off and scheduled actions" },
  { key: "available-tests", title: "Available Tests", description: "Its calibrations, test runs and checks" },
  { key: "analysis-proposals", title: "Analysis and Proposals", description: "Its trends, waste, improvements" },
  { key: "other", title: "Other", description: "Anything else about it" },
];

export interface AiManifest {
  plugin: string; // the plugin's directory name
  dir: string; // its absolute directory
  version: string;
  description: string | null;
  kinds: string[];
  workTypes: WorkType[];
  scheduledTypes: string[];
}

let cache: Promise<AiManifest[]> | null = null;

/** The project plugins' AI manifests (read once - plugins change with a deployment). */
export function aiManifests(): Promise<AiManifest[]> {
  cache ??= load();
  return cache;
}

async function load(): Promise<AiManifest[]> {
  const root = config.apiPlugins.extraDir;
  if (!root) return [];
  const out: AiManifest[] = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(root, entry.name);
    const manifest = await readFile(path.join(dir, "plugin.json"), "utf8").then(
      (t) => JSON.parse(t) as { version?: string; description?: string; ai?: { kinds?: string[]; workTypes?: (string | WorkType)[]; scheduledTypes?: string[] } },
      () => null,
    );
    if (!manifest?.ai) continue;
    const workTypes = (manifest.ai.workTypes ?? DNP_WORK_TYPES.map((w) => w.key))
      .map((w) => (typeof w === "string" ? DNP_WORK_TYPES.find((d) => d.key === w) : w))
      .filter((w): w is WorkType => Boolean(w?.key && w.title));
    out.push({
      plugin: entry.name,
      dir,
      version: manifest.version ?? "0",
      description: manifest.description ?? null,
      kinds: manifest.ai.kinds ?? [],
      workTypes,
      scheduledTypes: (manifest.ai.scheduledTypes ?? []).filter((k) => workTypes.some((w) => w.key === k)),
    });
  }
  return out;
}

/** The manifest that covers a process kind (null - its instances have no assistant). */
export async function manifestForKind(kind: string): Promise<AiManifest | null> {
  return (await aiManifests()).find((m) => m.kinds.includes(kind)) ?? null;
}
