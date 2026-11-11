import { describe, expect, it } from "vitest";

import { computeRights, mappingProblems, rightsProblem, withLower } from "./rights.js";

describe("rights", () => {
  it("maps every catalog action once", () => {
    expect(mappingProblems()).toEqual([]);
  });

  it("a level brings the lower ones", () => {
    expect([...withLower(["config"])]).toEqual(["view", "control", "config"]);
    expect([...withLower([])]).toEqual([]);
  });

  it("the '*' row everywhere, an object's row replaces it (down too)", () => {
    const units = ["node:1", "node:2", "process:3"];
    const c = computeRights({ "*": ["control"], "node:2": ["view"], "section:dashboard": ["view"] }, units);
    expect(c.global.has("processes.view")).toBe(true);
    expect(c.global.has("processes.control")).toBe(false);
    expect([...(c.scoped.get("processes.control") ?? [])].sort()).toEqual(["node:1", "process:3"]);
    expect(c.global.has("dashboard.view")).toBe(true);
    expect(c.global.has("processes.config")).toBe(false);
  });

  it("an object up from the '*' row - only there", () => {
    const c = computeRights({ "*": ["view"], "node:1": ["config"] }, ["node:1", "node:2"]);
    expect(c.global.has("devices.view")).toBe(true);
    expect([...(c.scoped.get("devices.simulate") ?? [])]).toEqual(["node:1"]);
  });

  it("the AI and logs - gated by their section, on the objects viewed", () => {
    const units = ["node:1", "node:2"];
    const none = computeRights({ "node:1": ["view"] }, units);
    expect(none.scoped.has("ai.use")).toBe(false);
    const some = computeRights({ "node:1": ["view"], "section:ai": ["view"], "section:logs": ["view"] }, units);
    expect([...(some.scoped.get("ai.use") ?? [])]).toEqual(["node:1"]);
    expect([...(some.scoped.get("logs.view") ?? [])]).toEqual(["node:1"]);
    const all = computeRights({ "*": ["view"], "section:ai": ["view"] }, units);
    expect(all.global.has("ai.use")).toBe(true);
  });

  it("the simulation - by its section, on the objects viewed; not by configuring", () => {
    const units = ["node:1", "node:2"];
    expect(computeRights({ "*": ["config"] }, units).global.has("simulation.view")).toBe(false);
    const c = computeRights({ "node:1": ["view"], "section:simulation": ["view"] }, units);
    expect([...(c.scoped.get("simulation.view") ?? [])]).toEqual(["node:1"]);
  });

  it("a process's row covers the installations it uses; their own rows and other processes' stay", () => {
    const units = ["process:1", "node:10", "node:11", "node:12", "process:2"];
    // House heating (process:1) uses its pumps and rooms (node:10, node:11)
    const covers = new Map([["node:10", ["process:1"]], ["node:11", ["process:1"]]]);
    const c = computeRights({ "process:1": ["control"], "node:11": ["view"] }, units, covers);
    expect([...(c.scoped.get("devices.write") ?? [])].sort()).toEqual(["node:10", "process:1"]);
    expect([...(c.scoped.get("nodes.view") ?? [])].sort()).toEqual(["node:10", "node:11", "process:1"]);
    // not used by it - nothing
    expect(c.scoped.get("nodes.view")?.has("node:12")).toBe(false);
    // a covering row before "*": the "*" row's View doesn't lower the covered pump's Control
    const d = computeRights({ "*": ["view"], "process:1": ["control"] }, units, covers);
    expect(d.scoped.get("devices.write")?.has("node:10")).toBe(true);
    expect(d.global.has("nodes.view")).toBe(true);
  });

  it("checks a form's rights", () => {
    const units = new Set(["node:1"]);
    expect(rightsProblem({ "node:9": ["view"] }, units)).toMatch(/unknown object/);
    expect(rightsProblem({ "node:1": ["write"] }, units)).toMatch(/no level/);
    // a section keeps only the levels it offers
    expect(rightsProblem({ "section:users": ["config"], "section:logs": ["config"], "section:service": ["config"] }, units)).toEqual({ "section:users": ["view", "config"], "section:logs": ["view", "config"], "section:service": ["view", "control", "config"] });
    expect(rightsProblem({ "node:1": ["config"] }, units)).toEqual({ "node:1": ["view", "control", "config"] });
  });
});
