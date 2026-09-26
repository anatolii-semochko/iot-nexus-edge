import { describe, expect, it } from "vitest";

import { runExclusive } from "./processLock.js";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("runExclusive", () => {
  it("never overlaps runs of the same process, keeps call order", async () => {
    const log: string[] = [];
    const job = (name: string, ms: number) => async () => {
      log.push(`${name}:start`);
      await sleep(ms);
      log.push(`${name}:end`);
    };
    await Promise.all([runExclusive(1, job("tick", 20)), runExclusive(1, job("event", 1))]);
    expect(log).toEqual(["tick:start", "tick:end", "event:start", "event:end"]);
  });

  it("runs different processes in parallel", async () => {
    const log: string[] = [];
    await Promise.all([
      runExclusive(1, async () => {
        log.push("a:start");
        await sleep(20);
        log.push("a:end");
      }),
      runExclusive(2, async () => {
        log.push("b:start");
        log.push("b:end");
      }),
    ]);
    expect(log.indexOf("b:end")).toBeLessThan(log.indexOf("a:end"));
  });

  it("a failed run does not block the next one", async () => {
    await expect(
      runExclusive(3, async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    let ran = false;
    await runExclusive(3, async () => {
      ran = true;
    });
    expect(ran).toBe(true);
  });
});
