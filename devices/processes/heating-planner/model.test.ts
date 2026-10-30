import { describe, expect, it } from "vitest";
import { needKw, planHeating, type PlannerSlot, type PlannerSystem } from "./model.ts";

const pump = { ratedHeatKw: 12, ratedCoolKw: 10, nominalFlowLpm: 34, fanRatedRpm: 650 };
const room = { spec: { uaKwK: 0.1, capacityKwhK: 3, gainsKw: 1 }, setpointC: 21 };
const T0 = Date.UTC(2026, 9, 31, 0, 0); // a Saturday - no working-hours gains

const slots = (prices: number[], extra: Partial<PlannerSlot> = {}): PlannerSlot[] =>
  prices.map((buyCtKwh, i) => ({
    t: T0 + i * 900_000,
    end: T0 + (i + 1) * 900_000,
    hours: 0.25,
    buyCtKwh,
    sellCtKwh: 5,
    cheapKw: 0,
    signal: 2,
    outdoorC: 0,
    minute: (i * 15) % 1440,
    weekday: 6,
    ...extra,
  }));

const system = (over: Partial<PlannerSystem> = {}): PlannerSystem => ({
  mode: "heating",
  pumps: [pump, pump, pump],
  rooms: [room, room, room, room],
  tankPerK: (1600 * 1.163) / 1000,
  tankAvgC: 40,
  store: { minC: 35, maxC: 55 },
  comfortK: 0.5,
  comfortModulation: 0.6,
  startPenaltyEur: 0.2,
  unitHourEur: 0.01,
  holdOffCtKwh: 10,
  boostCtKwh: 5,
  comfortCtKwhH: 1,
  ...over,
});

describe("the need", () => {
  it("the rooms' loss less their gains; colder - more", () => {
    expect(needKw("heating", [room], 0, 600, 6)).toBeCloseTo(0.1 * 21 - 0.15, 6);
    expect(needKw("heating", [room], -10, 600, 6)).toBeGreaterThan(needKw("heating", [room], 0, 600, 6));
    expect(needKw("heating", [room], 25, 600, 6)).toBe(0);
    expect(needKw("cooling", [room], 30, 600, 2)).toBeCloseTo(0.1 * 9 + 1, 6);
    // a closed room set back 4 K - less to heat
    expect(needKw("heating", [room], 0, 600, 6, [4])).toBeCloseTo(0.1 * 17 - 0.15, 6);
    // a holiday (weekday 0) - no working-hours gains on a Monday's working hour
    expect(needKw("heating", [room], 0, 600, 0)).toBeGreaterThan(needKw("heating", [room], 0, 600, 1));
  });
});

describe("the plan", () => {
  const dearThenCheap = [...Array(16).fill(40), ...Array(16).fill(10)];

  it("makes the heat in the cheap slots and covers the need", () => {
    const plan = planHeating(system(), slots(dearThenCheap));
    const dear = plan.slots.slice(0, 16).reduce((a, s) => a + s.heatKw, 0);
    const cheap = plan.slots.slice(16).reduce((a, s) => a + s.heatKw, 0);
    expect(cheap).toBeGreaterThan(dear);
    expect(plan.slots.every((s) => s.storeKwh >= 0)).toBe(true);
    expect(plan.savingEur).toBeGreaterThan(0);
  });

  it("fewer units at the comfort modulation rather than all at full power", () => {
    const plan = planHeating(system({ tankAvgC: 36 }), slots(Array(32).fill(20)));
    const running = plan.slots.filter((s) => s.units > 0);
    expect(running.length).toBeGreaterThan(0);
    expect(running.every((s) => s.modulation < 1)).toBe(true);
    expect(Math.max(...running.map((s) => s.units))).toBeLessThan(3);
  });

  it("few starts: the units run in blocks, not slot on, slot off", () => {
    const plan = planHeating(system({ tankAvgC: 36 }), slots(Array(48).fill(20)));
    const starts = plan.slots.filter((s, i) => s.units > (i ? plan.slots[i - 1].units : 0)).length;
    expect(starts).toBeLessThanOrEqual(4);
  });

  it("holds off under the Ledger's signal 1", () => {
    const sig = slots(Array(32).fill(20)).map((s, i) => ({ ...s, signal: (i < 8 ? 1 : 2) as 1 | 2 }));
    const plan = planHeating(system({ tankAvgC: 45 }), sig);
    expect(plan.slots.slice(0, 8).every((s) => s.units === 0)).toBe(true);
  });

  it("the sun's surplus is used - the heat made while the Ledger would export", () => {
    const sun = slots(Array(32).fill(30)).map((s, i) => ({ ...s, cheapKw: i >= 16 && i < 24 ? 20 : 0 }));
    const plan = planHeating(system(), sun);
    const inSun = plan.slots.slice(16, 24).reduce((a, s) => a + s.heatKw, 0) / 8;
    const before = plan.slots.slice(0, 16).reduce((a, s) => a + s.heatKw, 0) / 16;
    expect(inSun).toBeGreaterThan(before);
  });

  it("the comfort margin unused at flat prices - the rooms at their setpoint", () => {
    const plan = planHeating(system({ tankAvgC: 40 }), slots(Array(48).fill(30)));
    expect(Math.max(...plan.slots.map((s) => s.roomOffsetK))).toBeLessThan(0.05);
  });

  it("the comfort margin: an empty store and a dear peak - the rooms dip a little, within the margin", () => {
    const peak = [...Array(8).fill(80), ...Array(24).fill(15)];
    const plan = planHeating(system({ tankAvgC: 35 }), slots(peak));
    const dip = Math.max(...plan.slots.map((s) => s.roomOffsetK));
    expect(dip).toBeGreaterThan(0);
    expect(dip).toBeLessThanOrEqual(0.5 + 1e-9);
    const noMargin = planHeating(system({ tankAvgC: 35, comfortK: 0 }), slots(peak));
    expect(noMargin.slots.every((s) => s.roomOffsetK === 0)).toBe(true);
    expect(plan.energyEur).toBeLessThanOrEqual(noMargin.energyEur + 1e-9);
  });
});
