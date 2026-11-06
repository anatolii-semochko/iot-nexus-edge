import { beforeAll, describe, expect, it } from "vitest";

let mod: typeof import("./shared.js");
let changes: typeof import("./changeEvents.js");

beforeAll(async () => {
  process.env.SERVICE_API_TOKEN = "test";
  mod = await import("./shared.js");
  changes = await import("./changeEvents.js");
});

describe("tickShared", () => {
  it("asks once for callers within the tick, again in the next tick", async () => {
    let calls = 0;
    const fn = async () => ++calls;
    mod.beginTick();
    const [a, b] = await Promise.all([mod.tickShared("k1", fn), mod.tickShared("k1", fn)]);
    expect([a, b, calls]).toEqual([1, 1, 1]);
    expect(await mod.tickShared("k1", fn)).toBe(1);
    mod.beginTick();
    expect(await mod.tickShared("k1", fn)).toBe(2);
  });

  it("does not keep a failed read", async () => {
    let calls = 0;
    await expect(mod.tickShared("k2", async () => { calls++; throw new Error("x"); })).rejects.toThrow();
    await new Promise((r) => setTimeout(r, 0));
    expect(await mod.tickShared("k2", async () => ++calls)).toBe(2);
  });
});

describe("cachedRead", () => {
  it("keeps the value until its table changes", async () => {
    let calls = 0;
    const fn = async () => ++calls;
    expect(await mod.cachedRead("levels", ["message_levels"], fn)).toBe(1);
    expect(await mod.cachedRead("levels", ["message_levels"], fn)).toBe(1);
    changes.emitEntityChange({ table: "nodes", id: 1, op: "update" });
    expect(await mod.cachedRead("levels", ["message_levels"], fn)).toBe(1);
    changes.emitEntityChange({ table: "message_levels", id: 2, op: "update" });
    expect(await mod.cachedRead("levels", ["message_levels"], fn)).toBe(2);
    changes.emitEntityChange({ table: "all", id: null, op: "resync" });
    expect(await mod.cachedRead("levels", ["message_levels"], fn)).toBe(3);
  });
});

describe("cachedRead's expiry", () => {
  it("drops expired entries on a miss", async () => {
    const { config } = await import("./config.js");
    const saved = config.referenceCacheMs;
    config.referenceCacheMs = 5;
    let calls = 0;
    await mod.cachedRead("old-day", ["light_plan_test"], async () => ++calls);
    await new Promise((r) => setTimeout(r, 10));
    await mod.cachedRead("new-day", ["light_plan_test"], async () => ++calls);
    // the old key was swept: asking it again reads again
    config.referenceCacheMs = 60_000;
    expect(await mod.cachedRead("old-day", ["light_plan_test"], async () => ++calls)).toBe(3);
    config.referenceCacheMs = saved;
  });
});
