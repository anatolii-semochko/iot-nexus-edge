// Per-process mutual exclusion (AGENTS.md section 80): a process's tick
// runner and its event hooks (processRegistry.ts, ProcessHooks) never run
// concurrently for the same process, so a plugin's in-memory state - most
// plugins keep Maps keyed by process id - is only ever touched by one of
// them at a time. Different processes still run in parallel.

const tails = new Map<number, Promise<void>>();

export function runExclusive(processId: number, fn: () => Promise<void>): Promise<void> {
  const previous = tails.get(processId) ?? Promise.resolve();
  // Chained on the previous run's settlement either way - a failed run must
  // not block the next one.
  const current = previous.then(fn, fn);
  const tail = current.catch(() => {});
  tails.set(processId, tail);
  void tail.then(() => {
    if (tails.get(processId) === tail) tails.delete(processId);
  });
  return current;
}
