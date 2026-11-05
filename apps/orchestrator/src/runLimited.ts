// Runs `fn` over `items`, at most `limit` at a time, started in the items'
// order (the tick's process runners - server.ts). `fn` handles its own
// errors; one that throws stops only its own worker's turn, not the others.

export async function runLimited<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const item = items[next++];
      try {
        await fn(item);
      } catch {
        // the caller's fn logs its own failures
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(0, Math.min(limit, items.length)) }, worker));
}
