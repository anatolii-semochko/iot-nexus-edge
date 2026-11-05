import { beforeAll, describe, expect, it } from "vitest";

let mod: typeof import("./shared.js");
let changes: typeof import("./changeEvents.js");

beforeAll(async () => {
  process.env.SERVICE_API_TOKEN = "test";
  mod = await import("./shared.js");
  changes = await import("./changeEvents.js");
});

describe("tickShared", () => {
  it("asks once for callers within the tick", async () => {
    let calls = 0;
    const fn = async () => ++calls;
    const [a, b] = await Promise.all([mod.tickShared("k1", fn), mod.tickShared("k1", fn)]);
    expect([a, b, calls]).toEqual([1, 1, 1]);
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
