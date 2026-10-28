import { describe, expect, it } from "vitest";
import { fanControl, heatPumpRun, performance, stagePumps } from "./model.ts";

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
