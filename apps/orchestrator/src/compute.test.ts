import { afterAll, beforeAll, describe, expect, it } from "vitest";

let compute: typeof import("./compute.js").compute;
let stopCompute: typeof import("./compute.js").stopCompute;
const fixture = new URL("./__fixtures__/computeFixture.ts", import.meta.url).href;

beforeAll(async () => {
  process.env.SERVICE_API_TOKEN = "test";
  ({ compute, stopCompute } = await import("./compute.js"));
});
afterAll(() => stopCompute());

describe("compute", () => {
  it("runs a module's export in the worker and answers each job by itself", async () => {
    const [a, b] = await Promise.all([
      compute<{ n: number; sum: number }>(fixture, "sumSquares", [3]),
      compute<{ n: number; sum: number }>(fixture, "sumSquares", [10]),
    ]);
    expect(a).toEqual({ n: 3, sum: 14 });
    expect(b).toEqual({ n: 10, sum: 385 });
  });

  it("passes a thrown error and a missing export back", async () => {
    await expect(compute(fixture, "fails", [])).rejects.toThrow("as planned");
    await expect(compute(fixture, "nope", [])).rejects.toThrow('no function export "nope"');
  });

  it("starts a new worker after the old one is gone", async () => {
    await stopCompute();
    expect(await compute<{ sum: number }>(fixture, "sumSquares", [2])).toEqual({ n: 2, sum: 5 });
  });
});
