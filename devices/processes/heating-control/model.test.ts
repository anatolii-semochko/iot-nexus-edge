import { describe, expect, it } from "vitest";
import { fanControl, heatPumpRun, performance, pumpOrder, stagePumps, stageUnits } from "./model.ts";

const pump = { ratedHeatKw: 12, ratedCoolKw: 10, nominalFlowLpm: 34, fanRatedRpm: 650 };

describe("the heat pumps", () => {
  it("a COP from the weather - higher when milder", () => {
    expect(performance(pump, "heating", 7, 35)).toBeGreaterThan(performance(pump, "heating", -10, 45));
    expect(performance(pump, "heating", 7, 35)).toBeLessThanOrEqual(7);
  });

  it("a running unit's heat is its electricity times its COP", () => {
    const r = heatPumpRun(pump, "heating", 1, 7, 40);
    expect(r.heatKw / r.electricKw).toBeCloseTo(r.cop!, 6);
    expect(heatPumpRun(pump, "heating", 0, 7, 40).running).toBe(false);
  });

  it("staged: a small need runs one unit - the least run one; a large need, more", () => {
    const outputs = [12, 12, 12, 12];
    const small = stagePumps(0.2, outputs, [2, 0, 1, 3]);
    expect(small.filter((d) => d > 0)).toHaveLength(1);
    expect(small[2]).toBeGreaterThan(0); // the lead
    const large = stagePumps(0.8, outputs, [0, 1, 2, 3]);
    expect(large.filter((d) => d > 0)).toHaveLength(4);
    const half = stagePumps(0.5, outputs, [0, 1, 2, 3]);
    expect(half.filter((d) => d > 0)).toHaveLength(2);
    expect(stagePumps(0, outputs, [0, 1, 2, 3]).every((d) => d === 0)).toBe(true);
  });
});

describe("the heat pumps' order", () => {
  const hours = [5, 1, 3, 0];
  const prio = [2, 1, undefined, 3];
  it("auto - the least run lead; the running ones stay first (no swap mid-run)", () => {
    expect(pumpOrder([0, 1, 2, 3], () => false, "auto", (i) => hours[i], (i) => prio[i])).toEqual([3, 1, 2, 0]);
    expect(pumpOrder([0, 1, 2, 3], (i) => i === 0, "auto", (i) => hours[i], (i) => prio[i])).toEqual([0, 3, 1, 2]);
  });
  it("priority - the user's numbers, the unnumbered last", () => {
    expect(pumpOrder([0, 1, 2, 3], () => false, "priority", (i) => hours[i], (i) => prio[i])).toEqual([1, 0, 3, 2]);
    expect(pumpOrder([0, 1, 2, 3], (i) => i === 2, "priority", (i) => hours[i], (i) => prio[i])).toEqual([2, 1, 0, 3]);
  });
});

describe("the heat pumps as the plan says", () => {
  it("the first units of the order, sharing the planned power", () => {
    const d = stageUnits(2, 12, [10, 10, 10], [2, 0, 1]);
    expect(d).toEqual([0.6, 0, 0.6]);
    expect(stageUnits(1, 2, [10, 10], [1, 0])).toEqual([0, 0.3]); // at least the lowest modulation
    expect(stageUnits(0, 10, [10, 10], [0, 1])).toEqual([0, 0]);
    expect(stageUnits(5, 100, [10, 10], [0, 1])).toEqual([1, 1]);
  });
});

describe("the fan coil's thermostat", () => {
  it("idle at its setpoint, works when the room is short of it, stops when reached", () => {
    expect(fanControl("heating", 21.1, 21, false)).toEqual({ working: false, fan: 0 });
    expect(fanControl("heating", 20.9, 21, false).working).toBe(false); // within the start band
    const start = fanControl("heating", 20.6, 21, false);
    expect(start.working).toBe(true);
    expect(start.fan).toBeGreaterThan(0);
    expect(fanControl("heating", 20.9, 21, true).working).toBe(true); // keeps working until reached
    expect(fanControl("heating", 21.0, 21, true).working).toBe(false);
    expect(fanControl("cooling", 24.5, 24, false).working).toBe(true);
  });
});
