import { Ajv, type ValidateFunction } from "ajv";

// Process config schemas (nexus-edge-aquarium AGENTS_TO_DO.md 2026-10-16,
// tech debt 5): a process kind's config described ONCE - a JSON Schema the
// kind's plugin registers (ApiPluginContext.registerConfigSchema), built
// from the same module its process and UI read the defaults from. Here it
// - checks a config edit (PATCH /processes/:id/config - the sections
//   sent; a stored config older than its schema doesn't block other edits);
// - is served (GET /process-kinds/:kind/config-schema) - for a UI and the
//   coming AI assistant that configures DNPs.
// A kind without a schema is not checked (as before).

const ajv = new Ajv({ allErrors: true, strict: false });
const schemas = new Map<string, { schema: object; validate: ValidateFunction }>();

export function registerConfigSchema(kind: string, schema: object): void {
  schemas.set(kind, { schema, validate: ajv.compile(schema) });
}

export function configSchemaOf(kind: string): object | null {
  return schemas.get(kind)?.schema ?? null;
}

export function configSchemaKinds(): string[] {
  return [...schemas.keys()].sort();
}

/** What is wrong with `config` (the sections being written) for `kind` - empty: fine (or no schema). */
export function configProblems(kind: string, config: unknown): string[] {
  const entry = schemas.get(kind);
  if (!entry || entry.validate(config)) return [];
  return (entry.validate.errors ?? []).map((e) => `${e.instancePath || "/"} ${e.message ?? "is invalid"}`);
}
