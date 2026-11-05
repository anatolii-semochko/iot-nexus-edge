// Periodic steps (iot PERF_PROD_2026-11-05.md): a process kind's own
// interval (processRegistry `intervalMs` - server.ts) or a periodic part
// of a runner (a simulation's step - `ctx.stepDue` for the plugins) is due
// once per interval, at the process's own place in it: the slots are
// shifted by a phase from the process id, so processes with the same
// interval don't all step in the same tick. A slot is missed by no tick -
// the first tick in a new slot runs the step, a skipped tick included.

// Knuth's multiplicative hash - neighbouring ids land far apart in the interval
const PHASE_MULTIPLIER = 2654435761;

/** The process's place in an interval, ms (0 <= phase < intervalMs). */
export function phaseOf(processId: number, intervalMs: number): number {
  if (intervalMs <= 0) return 0;
  return Number((BigInt(processId) * BigInt(PHASE_MULTIPLIER)) % BigInt(intervalMs));
}

/**
 * Whether a periodic step is due at `now`: never run (`lastAt` null) - yes;
 * else once the interval's slot changed since `lastAt` (the slots shifted
 * by the process's phase). `intervalMs` <= 0 - every time.
 */
export function stepDue(processId: number, intervalMs: number, lastAt: number | null | undefined, now: number = Date.now()): boolean {
  if (lastAt === null || lastAt === undefined || intervalMs <= 0) return true;
  const phase = phaseOf(processId, intervalMs);
  const slot = (t: number) => Math.floor((t + phase) / intervalMs);
  return slot(now) !== slot(lastAt);
}
