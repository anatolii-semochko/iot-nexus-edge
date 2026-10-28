import { AsyncLocalStorage } from "node:async_hooks";

// What a request carries to the code deep below its handler (2026-10-28): the roles the person acts in -
// the command log's "As" (commandLog.ts), without passing it through every write's call. The access
// guard opens the store for each request and fills it once the principal is known.

export interface RequestContext {
  actedAs?: string | null;
}

const storage = new AsyncLocalStorage<RequestContext>();

/** Runs `next` with a fresh request context (the guard's first hook). */
export const withRequestContext = (next: () => void) => storage.run({}, next);

/** The current request's context (none - not inside a request, e.g. the orchestrator's tick). */
export const requestContext = (): RequestContext | undefined => storage.getStore();
