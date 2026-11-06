import { describe, expect, it } from "vitest";

import { awaitWithin, rotate } from "./turns.js";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("awaitWithin", () => {
  it("returns the value when it settles in time", async () => {
    expect(await awaitWithin(sleep(5).then(() => 7), 200)).toEqual({ done: true, value: 7 });
  });

  it("stops waiting at the limit, the promise going on", async () => {
    let finished = false;
    const p = sleep(60).then(() => {
      finished = true;
    });
    expect(await awaitWithin(p, 10)).toEqual({ done: false });
    expect(finished).toBe(false);
    await p;
    expect(finished).toBe(true);
  });

  it("does not wait at all with no time left", async () => {
    expect(await awaitWithin(sleep(5), 0)).toEqual({ done: false });
  });
});

describe("rotate", () => {
  it("starts from the k-th item, around", () => {
    expect(rotate([1, 2, 3, 4], 1)).toEqual([2, 3, 4, 1]);
    expect(rotate([1, 2, 3, 4], 6)).toEqual([3, 4, 1, 2]);
    expect(rotate([], 3)).toEqual([]);
  });
});
