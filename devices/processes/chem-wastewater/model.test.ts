import { describe, expect, it } from "vitest";
import { daysLeft, deliver, dosingStep, minutesToFull, tankNewDay, wastewaterStep, type DosingSpec, type Tank, type TankSpec, type Wastewater, type WastewaterSpec } from "./model.ts";

const anodize: DosingSpec = { bath: "Anodize", tank: "acid", volumeL: 3000, targetGl: 180, bandGl: 10, concentrateGl: 1800, pumpLMin: 2, dragOutL: 3 };
const tankSpec: TankSpec = { key: "acid", name: "Sulphuric acid", capacityL: 1000, reorderPct: 25, criticalPct: 10, lotL: 800 };

const ww: WastewaterSpec = {
  collectionL: 4000, startPct: 60, stopPct: 20, highPct: 90, pumpLMin: 40, inflowPh: 3.5, neutralL: 1500, lowPh: 6.8, highPh: 8.6,
  dosePhMin: 0.3, sludgePerM3L: 8, settlerSludgeL: 400, pressAtPct: 80, pressMin: 45, dpPerCycleBar: 0.15, dpLimitBar: 3, flocMlPerM3: 50, causticLMin: 0.15,
};
const fresh = (): Wastewater => ({ collectionL: 1000, pump: false, ph: 7.4, naoh: false, acid: false, sludgeL: 0, press: false, pressLeftS: 0, dpBar: 1, pressCycles: 0, treatedL: 0, causticL: 0, flocL: 0 });

describe("the chemistry and wastewater models", () => {
  it("the drag-outs dilute a bath, the pump brings it back into its band from its tank", () => {
    const d = { gl: 180, pump: false };
    const tank: Tank = { levelL: 900, todayL: 0, rateLDay: 0 };
    // 60 bars (3 l each out of 3000 l) - the concentration 6 % down, under the band
    dosingStep(anodize, d, tank, 60, 1);
    expect(d.gl).toBeLessThan(anodize.targetGl - anodize.bandGl);
    expect(d.pump).toBe(true);
    for (let k = 0; k < 120; k++) dosingStep(anodize, d, tank, 0, 10);
    expect(d.gl).toBeGreaterThanOrEqual(anodize.targetGl - anodize.bandGl);
    expect(d.gl).toBeLessThan(anodize.targetGl + anodize.bandGl);
    expect(tank.todayL).toBeGreaterThan(0);
    expect(tank.levelL).toBeCloseTo(900 - tank.todayL, 6);
  });

  it("an empty tank stops the dosing", () => {
    const d = { gl: 100, pump: false };
    const tank: Tank = { levelL: 0, todayL: 0, rateLDay: 0 };
    expect(dosingStep(anodize, d, tank, 0, 60)).toBe(0);
    expect(d.pump).toBe(false);
  });

  it("the days left follow the recent rate; a delivery under the reorder level", () => {
    const t: Tank = { levelL: 600, todayL: 30, rateLDay: 0 };
    tankNewDay(t);
    expect(daysLeft(t)).toBeCloseTo(20, 6);
    expect(deliver(tankSpec, t)).toBe(false);
    t.levelL = 200;
    expect(deliver(tankSpec, t)).toBe(true);
    expect(t.levelL).toBe(1000);
  });

  it("the transfer pump runs between its levels; the pH held in the band; the press empties the settler", () => {
    const w = fresh();
    const small = { ...ww, settlerSludgeL: 60 };
    let pumped = false;
    for (let k = 0; k < 6 * 60 * 6; k++) {
      wastewaterStep(small, w, 30, k % 60 === 0 ? 3 : 0, 10);
      pumped ||= w.pump;
      if (k > 600) {
        expect(w.ph).toBeGreaterThan(5.5);
        expect(w.ph).toBeLessThan(9.5);
      }
    }
    expect(pumped).toBe(true);
    expect(w.collectionL).toBeLessThan(ww.collectionL);
    expect(w.treatedL).toBeGreaterThan(0);
    expect(w.pressCycles).toBeGreaterThan(0);
    expect(w.dpBar).toBeCloseTo(1 + w.pressCycles * ww.dpPerCycleBar, 6);
  });

  it("the collection tank's time to full - only when the inflow beats the pump", () => {
    const w = fresh();
    expect(minutesToFull(ww, w, 30)).toBeCloseTo(100, 6);
    w.pump = true;
    expect(minutesToFull(ww, w, 30)).toBeNull();
  });
});
