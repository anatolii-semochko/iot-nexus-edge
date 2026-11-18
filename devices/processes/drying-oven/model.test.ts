import { describe, expect, it } from "vitest";
import { ovenTick, type Oven, type OvenSpec } from "./model.ts";

const spec: OvenSpec = {
  setpointC: 82,
  tolC: 4,
  heaterKw: 18,
  capacityKwhK: 0.12,
  lossKwK: 0.09,
  doorLossKwh: 0.6,
  partsKwh: 1.2,
  dryMin: 20,
  capacity: 2,
  readyBelowK: 6,
  ambientC: 18,
};

describe("the drying oven's model", () => {
  it("heats up and holds its band", () => {
    const o: Oven = { tempC: 18, heating: false, drying: [], queue: [] };
    for (let k = 0; k < 360; k++) ovenTick(spec, o, k * 10_000, 10);
    expect(o.tempC).toBeGreaterThan(78);
    expect(o.tempC).toBeLessThan(86);
  });

  it("dries the queued batches, two at a time", () => {
    const o: Oven = { tempC: 82, heating: false, drying: [], queue: ["L-0001", "L-0002", "L-0003"] };
    const done: string[] = [];
    for (let k = 0; k < 6 * 60 * 6; k++) done.push(...ovenTick(spec, o, k * 10_000, 10).map((b) => b.id));
    expect(done).toEqual(["L-0001", "L-0002", "L-0003"]);
    expect(o.drying.length).toBe(0);
  });
});
