import { beforeAll, describe, expect, it } from "vitest";

let createBatcher: typeof import("./batcher.js").createBatcher;

beforeAll(async () => {
  process.env.SERVICE_API_TOKEN = "test";
  ({ createBatcher } = await import("./batcher.js"));
});

describe("batcher", () => {
  it("sends the window's items together and answers each by its own outcome", async () => {
    const sent: number[][] = [];
    const call = createBatcher<number, number>(async (items) => {
      sent.push(items);
      return items.map((n) => (n < 0 ? { ok: false as const, error: new Error(`bad ${n}`) } : { ok: true as const, value: n * 2 }));
    }, 5);
    const results = await Promise.allSettled([call(1), call(-2), call(3)]);
    expect(sent).toEqual([[1, -2, 3]]);
    expect(results.map((r) => (r.status === "fulfilled" ? r.value : (r.reason as Error).message))).toEqual([2, "bad -2", 6]);
  });

  it("fails every item when the request fails, and sends alone with a zero window", async () => {
    const failing = createBatcher<number, number>(async () => {
      throw new Error("down");
    }, 5);
    await expect(Promise.all([failing(1), failing(2)])).rejects.toThrow("down");
    const sent: number[][] = [];
    const alone = createBatcher<number, number>(async (items) => {
      sent.push(items);
      return items.map((n) => ({ ok: true as const, value: n }));
    }, 0);
    await Promise.all([alone(1), alone(2)]);
    expect(sent).toEqual([[1], [2]]);
  });
});
