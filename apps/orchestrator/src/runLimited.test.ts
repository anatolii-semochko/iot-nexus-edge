import { describe, expect, it } from "vitest";

import { runLimited } from "./runLimited.js";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("runLimited", () => {
  it("runs every item, never more than the limit at once", async () => {
    let running = 0;
    let peak = 0;
    const done: number[] = [];
    await runLimited([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      running++;
      peak = Math.max(peak, running);
      await wait(5);
      done.push(n);
      running--;
    });
    expect(done.sort()).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(peak).toBe(3);
  });

  it("starts the items in order and survives a failing one", async () => {
    const started: number[] = [];
    await runLimited([1, 2, 3, 4], 2, async (n) => {
      started.push(n);
      if (n === 2) throw new Error("boom");
    });
    expect(started).toEqual([1, 2, 3, 4]);
  });

  it("handles an empty list", async () => {
    await expect(runLimited([], 4, async () => {})).resolves.toBeUndefined();
  });
});
