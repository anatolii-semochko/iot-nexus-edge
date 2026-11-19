import { describe, expect, it } from "vitest";
import { chiller, compressorStep, diStep, type Compressor, type Di } from "./model.ts";

const comp = { loadBar: 6.5, unloadBar: 7.5, fadM3Min: 1.8, loadedKw: 11, unloadedKw: 3.5, idleMin: 5, receiverM3: 1 };

describe("the shop's utilities", () => {
  it("the compressor holds its band under demand and stops when idle", () => {
    const c: Compressor = { bar: 7, state: "off", idleS: 0 };
    let min = 99;
    let max = 0;
    for (let k = 0; k < 360; k++) {
      compressorStep(comp, c, 1.1, 10);
      min = Math.min(min, c.bar);
      max = Math.max(max, c.bar);
    }
    expect(min).toBeGreaterThan(6.2);
    expect(max).toBeLessThan(7.8);
    for (let k = 0; k < 120; k++) compressorStep(comp, c, 0, 10);
    expect(c.state).toBe("off");
  });

  it("the chiller's return rises with its load", () => {
    const s = { supplyC: 9, flowLs: 3, cop: 3.2, auxKw: 1.2 };
    expect(chiller(s, 60, true).returnC).toBeGreaterThan(13);
    expect(chiller(s, 60, true).powerKw).toBeCloseTo(60 / 3.2 + 1.2, 3);
  });

  it("the DI column switches over its limit", () => {
    const d: Di = { uScm: 9.9, column: "A", regenLeftS: 0 };
    diStep({ limitUScm: 10, freshUScm: 0.8, perM3: 0.5, regenMin: 60 }, d, 1, 10);
    expect(d.column).toBe("B");
    expect(d.uScm).toBe(0.8);
  });
});
