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
// A CORE Library process package - the same block in its library.json
// (kinds - its own by default; 2026-10-21).

export interface WorkType {
  key: string;
  title: string;
  description: string;
  // the messenger's tile (2026-10-24): a CoreUI icon's name (cil*) and the start phrase put in the
  // message box - "{name}" becomes what it is about: the thing the AI button was on, else the
  // object (a DNP instance's name; "the whole system")
  icon?: string;
  start?: string;
}

// The whole system's work types (entity "Nexus Edge") - prompts/nexus-edge/<key>.md
export const NE_WORK_TYPES: WorkType[] = [
  { key: "about-help", title: "About & Help", description: "What the assistant is and how to use Nexus Edge", icon: "cilLifeRing", start: "What can you do for me in Nexus Edge, and where do I start?" },
  { key: "status-analysis", title: "Status Analysis", description: "What works, what is degraded and why", icon: "cilHeart", start: "Analyse the state of {name} now: what works, what is degraded and why." },
  { key: "wem-analysis", title: "WEM Analysis", description: "Warnings, errors, messages: causes and fixes", icon: "cilWarning", start: "Go through the active warnings, errors and messages of {name}: what caused them and how to fix them." },
  { key: "system-testing", title: "System Testing", description: "The tests the DNPs declare and their results", icon: "cilTask", start: "Which tests can {name} run, and what did the last ones show?" },
  { key: "install-dnp", title: "Install DNP", description: "Connect new equipment and register it", icon: "cilPlus", start: "I want to connect new equipment: " },
  { key: "config-dnp", title: "Config DNP", description: "Set up the instances", icon: "cilSettings", start: "Help me set up " },
  { key: "control-rules", title: "Control Rules", description: "Rules in words turned into the system's rules", icon: "cilFork", start: "Make a rule: " },
  { key: "automated-control-rules", title: "Automated Control Rules", description: "Rules found from the history", icon: "cilLoopCircular", start: "Find rules worth automating for {name} from its history." },
  { key: "control-tasks", title: "Control Tasks", description: "One-off and scheduled actions", icon: "cilAlarm", start: "Schedule an action: " },
  { key: "analysis-proposals", title: "Analysis and Proposals", description: "Trends, waste, improvements", icon: "cilChartLine", start: "Analyse the trends of {name} over the last days: where is waste, what would you improve?" },
  { key: "developer-report", title: "Developer Report", description: "A bug, a gap or an idea for the developers", icon: "cilBug", start: "Report to the developers: " },
  { key: "other", title: "Other", description: "Anything else", icon: "cilChatBubble", start: "" },
];

// The standard work types of a DNP instance - prompts/dnp/<key>.md
export const DNP_WORK_TYPES: WorkType[] = [
  { key: "help", title: "Help", description: "How it works, how to connect and set it up", icon: "cilLifeRing", start: "How does {name} work, and how do I set it up?" },
  { key: "status-analysis", title: "Status Analysis", description: "Its state, what is off and why", icon: "cilHeart", start: "Analyse the state of {name} now: what works, what is off and why." },
  { key: "wem-analysis", title: "WEM Analysis", description: "Its warnings, errors, messages", icon: "cilWarning", start: "Go through the warnings, errors and messages of {name}: causes and fixes." },
  { key: "config", title: "Config", description: "Its settings for the user's goal", icon: "cilSettings", start: "Help me set up {name} for this goal: " },
  { key: "control-rules", title: "Control Rules", description: "Its rules from words", icon: "cilFork", start: "Make a rule for {name}: " },
  { key: "automated-control-rules", title: "Automated Control Rules", description: "Its rules from the history", icon: "cilLoopCircular", start: "Find rules worth automating for {name} from its history." },
  { key: "control-tasks", title: "Control Tasks", description: "One-off and scheduled actions", icon: "cilAlarm", start: "Schedule an action for {name}: " },
  { key: "available-tests", title: "Available Tests", description: "Its calibrations, test runs and checks", icon: "cilTask", start: "Which calibrations, test runs and checks does {name} have?" },
  { key: "analysis-proposals", title: "Analysis and Proposals", description: "Its trends, waste, improvements", icon: "cilChartLine", start: "Analyse the trends of {name} over the last days: where is waste, what would you improve?" },
  { key: "other", title: "Other", description: "Anything else about it", icon: "cilChatBubble", start: "" },
];

// a DNP's own work type without its icon / start phrase
const DEFAULT_ICON = "cilChatBubble";
const defaultStart = (w: WorkType) => `${w.title} - {name}: `;

/** A manifest's work type: a standard one by its key, an own one (or an override) completed. */
function workTypeOf(w: string | WorkType): WorkType | null {
  const standard = DNP_WORK_TYPES.find((d) => d.key === (typeof w === "string" ? w : w.key));
  if (typeof w === "string") return standard ?? null;
  if (!w?.key || !w.title) return null;
  const merged = { ...standard, ...w };
  return { ...merged, icon: merged.icon ?? DEFAULT_ICON, start: merged.start ?? defaultStart(merged) };
}

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

/** The project plugins' and the Library packages' AI manifests (read once - they change with a deployment). */
export function aiManifests(): Promise<AiManifest[]> {
  cache ??= load();
  return cache;
}

async function load(): Promise<AiManifest[]> {
  const out: AiManifest[] = [];
  const add = (plugin: string, dir: string, manifest: { version?: string; description?: string; ai?: { kinds?: string[]; workTypes?: (string | WorkType)[]; scheduledTypes?: string[] } }, kinds: string[]) => {
    const ai = manifest.ai!;
    const workTypes = (ai.workTypes ?? DNP_WORK_TYPES.map((w) => w.key))
      .map(workTypeOf)
      .filter((w): w is WorkType => w !== null);
    out.push({
      plugin,
      dir,
      version: manifest.version ?? "0",
      description: manifest.description ?? null,
      kinds,
      workTypes,
      scheduledTypes: (ai.scheduledTypes ?? []).filter((k) => workTypes.some((w) => w.key === k)),
    });
  };
  // every project root (a dependency's packages first)
  for (const { dir: root } of config.apiPlugins.extraDirs)
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(root, entry.name);
    const manifest = await readFile(path.join(dir, "plugin.json"), "utf8").then(
      (t) => JSON.parse(t) as { version?: string; description?: string; ai?: { kinds?: string[]; workTypes?: (string | WorkType)[]; scheduledTypes?: string[] } },
      () => null,
    );
    if (!manifest?.ai) continue;
    add(entry.name, dir, manifest, manifest.ai.kinds ?? []);
  }
  // the CORE Library's process packages (after the projects' - a project's kind of the same name wins):
  // their library.json's "ai" block, the kinds - the package's own by default
  const processesDir = path.join(config.apiPlugins.builtinDevicesDir, "processes");
  for (const entry of await readdir(processesDir, { withFileTypes: true }).catch(() => [])) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(processesDir, entry.name);
    const manifest = await readFile(path.join(dir, "library.json"), "utf8").then(
      (t) => JSON.parse(t) as { description?: string; ai?: { kinds?: string[]; workTypes?: (string | WorkType)[]; scheduledTypes?: string[] } },
      () => null,
    );
    if (!manifest?.ai) continue;
    add(entry.name, dir, manifest, manifest.ai.kinds ?? [entry.name]);
  }
  return out;
}

/** The manifest that covers a process kind (null - its instances have no assistant). */
export async function manifestForKind(kind: string): Promise<AiManifest | null> {
  return (await aiManifests()).find((m) => m.kinds.includes(kind)) ?? null;
}
