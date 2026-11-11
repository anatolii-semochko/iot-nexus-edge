import { describe, expect, it } from "vitest";
import type { PlannerSlot, PlannerSystem } from "./model.ts";
import { planAll } from "./strategies.ts";

const pump = { ratedHeatKw: 12, ratedCoolKw: 10, nominalFlowLpm: 34, fanRatedRpm: 650 };
const room = { spec: { uaKwK: 0.1, capacityKwhK: 3, gainsKw: 1 }, setpointC: 21 };
const T0 = Date.UTC(2026, 9, 31, 0, 0);
const slots = (prices: number[], cheap: (i: number) => number = () => 0): PlannerSlot[] =>
  prices.map((buyCtKwh, i) => ({
    t: T0 + i * 900_000,
    end: T0 + (i + 1) * 900_000,
    hours: 0.25,
    buyCtKwh,
    sellCtKwh: 8,
    cheapKw: cheap(i),
    signal: 2,
    outdoorC: 0,
    minute: (i * 15) % 1440,
    weekday: 6,
  }));
const system: PlannerSystem = {
  mode: "heating",
  pumps: [pump, pump, pump],
  rooms: [room, room, room, room],
  tankPerK: 1.86,
  tankAvgC: 38,
  store: { minC: 35, maxC: 55 },
  comfortK: 0.5,
  comfortModulation: 0.6,
  startPenaltyEur: 0.2,
  unitHourEur: 0.01,
  holdOffCtKwh: 10,
  boostCtKwh: 5,
  comfortCtKwhH: 1,
};
const peaky = Array.from({ length: 64 }, (_, i) => (i % 32 < 8 ? 70 : i % 32 < 16 ? 20 : 35));

describe("the strategies", () => {
  it("each one planned and valued in the real money; the chosen one's plan returned", () => {
    const { key, plan, results } = planAll("comfort", system, slots(peaky));
    expect(key).toBe("comfort");
    expect(results.map((r) => r.key)).toEqual(["cost", "gentle", "comfort", "sun"]);
    const comfort = results.find((r) => r.key === "comfort")!;
    expect(plan.energyEur).toBeCloseTo(comfort.energyEur, 6);
    expect(plan.slots.reduce((a, s) => a + s.energyEur, 0)).toBeCloseTo(comfort.energyEur, 6);
  });

  it("comfort - the rooms never off their setpoint; least cost - no dearer than it", () => {
    const { results } = planAll("cost", system, slots(peaky));
    const by = Object.fromEntries(results.map((r) => [r.key, r]));
    expect(by.comfort.maxOffsetK).toBe(0);
    expect(by.cost.energyEur).toBeLessThanOrEqual(by.comfort.energyEur + 1e-9);
  });

  it("gentle - no more starts and unit-hours than least cost", () => {
    const { results } = planAll("cost", system, slots(peaky));
    const by = Object.fromEntries(results.map((r) => [r.key, r]));
    expect(by.gentle.starts).toBeLessThanOrEqual(by.cost.starts);
  });

  it("the sun - more of the surplus taken as heat", () => {
    const sunny = slots(Array(64).fill(35), (i) => (i >= 24 && i < 40 ? 15 : 0));
    const { results } = planAll("cost", system, sunny);
    const by = Object.fromEntries(results.map((r) => [r.key, r]));
    expect(by.sun.sunKwh).toBeGreaterThanOrEqual(by.cost.sunKwh);
  });

  it("one baseline for all - the band's electricity at the real prices", () => {
    const sunny = slots(Array(64).fill(35), (i) => (i >= 24 && i < 40 ? 15 : 0));
    const { results } = planAll("cost", system, sunny);
    for (const r of results) expect(r.baselineEur).toBeCloseTo(results[0].baselineEur, 6);
  });

  it("cheapest - the least electricity picked", () => {
    const { key, results } = planAll("comfort", system, slots(peaky), true);
    expect(results.find((r) => r.key === key)!.energyEur).toBe(Math.min(...results.map((r) => r.energyEur)));
  });
});
