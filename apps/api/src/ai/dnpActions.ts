// A DNP package's own proposing action (2026-11-04): a change the core's
// proposing tools can't express - a record of the package's own (an
// aquarium's water test, a probe's calibration). The package registers it
// (apiPlugins.ts `registerAiAction`); ai/tools.ts serves it as a tool of the
// given access level (Config / Control) - in the assistant and over MCP - and
// ai/proposals.ts applies it on Accept (or at once on Auto) as the operation
// "dnp": payload {action, data}. Kept apart from tools.ts so proposals.ts can
// look an action up without importing the tool registry.

export interface DnpActionProcess {
  id: number;
  name: string;
  kind: string;
  nodeId: number | null;
}

export interface DnpAction {
  // the tool's name - "<package>.<what>.propose"
  name: string;
  description: string;
  access: "config" | "control";
  // the action's own fields (JSON Schema properties); processId and reason are added
  properties: Record<string, unknown>;
  required?: string[];
  // the process kinds it applies to (another kind - refused before proposing)
  kinds: string[];
  // checks the input now; the proposal's one-line summary and the data `apply` gets
  prepare(input: Record<string, unknown>, process: DnpActionProcess): Promise<{ summary: string; data: Record<string, unknown> }>;
  // applies the data as the deciding person (or ai-agent); its result is kept with the proposal
  apply(data: Record<string, unknown>, process: DnpActionProcess, userId: number): Promise<unknown>;
}

const actions = new Map<string, DnpAction>();

export const addDnpAction = (action: DnpAction) => actions.set(action.name, action);
export const dnpActionOf = (name: string) => actions.get(name);
