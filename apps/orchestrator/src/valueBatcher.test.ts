import { beforeAll, describe, expect, it } from "vitest";

let createValueBatcher: typeof import("./valueBatcher.js").createValueBatcher;

beforeAll(async () => {
  process.env.SERVICE_API_TOKEN = "test";
  ({ createValueBatcher } = await import("./valueBatcher.js"));
});

const fake = () => {
  const calls: { ids: number[]; maxAgeMs?: number }[] = [];
  const fetch = async (ids: number[], maxAgeMs?: number) => {
    calls.push({ ids: [...ids].sort((a, b) => a - b), maxAgeMs });
    return { values: Object.fromEntries(ids.map((id) => [id, { value: id * 10, at: null, source: "cache" }])) };
  };
  return { calls, fetch };
};

describe("valueBatcher", () => {
  it("merges the asks within the window, each caller gets its own ids", async () => {
    const { calls, fetch } = fake();
    const get = createValueBatcher(fetch, 5);
    const [a, b] = await Promise.all([get([1, 2]), get([2, 3])]);
    expect(calls).toEqual([{ ids: [1, 2, 3], maxAgeMs: undefined }]);
    expect(Object.keys(a.values)).toEqual(["1", "2"]);
    expect(b.values[3].value).toBe(30);
  });

  it("keeps different maxAgeMs apart and passes a failure to every waiter", async () => {
    const { calls, fetch } = fake();
    const get = createValueBatcher(fetch, 5);
    await Promise.all([get([1], 100), get([2], 200)]);
    expect(calls.length).toBe(2);
    const failing = createValueBatcher(async () => {
      throw new Error("down");
    }, 5);
    await expect(Promise.all([failing([1]), failing([2])])).rejects.toThrow("down");
  });

  it("calls straight through with a zero window", async () => {
    const { calls, fetch } = fake();
    await createValueBatcher(fetch, 0)([7]);
    expect(calls).toEqual([{ ids: [7], maxAgeMs: undefined }]);
  });
});
