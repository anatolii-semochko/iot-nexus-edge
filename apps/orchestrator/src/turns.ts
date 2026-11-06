// The tick's turns (iot PERF_PROD_2026-11-05.md): a tick waits for its
// process runners no longer than its budget - a run still going then
// finishes in the background (the next tick skips that process, not every
// process), and the processes not started within the budget get their turn
// next tick, the start order rotating so it is never the same ones.

/** Waits for `promise` at most `ms`: {done: true, value} - it settled in time; {done: false} - it is still going. */
export async function awaitWithin<T>(promise: Promise<T>, ms: number): Promise<{ done: true; value: T } | { done: false }> {
  if (ms <= 0) return { done: false };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<{ done: false }>((resolve) => {
    timer = setTimeout(() => resolve({ done: false }), ms);
  });
  try {
    return await Promise.race([promise.then((value) => ({ done: true as const, value })), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** `items` started from position `k` (mod length) and around. */
export function rotate<T>(items: T[], k: number): T[] {
  if (items.length === 0) return items;
  const i = ((k % items.length) + items.length) % items.length;
  return [...items.slice(i), ...items.slice(0, i)];
}
