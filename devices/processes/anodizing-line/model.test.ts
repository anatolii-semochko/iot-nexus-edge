import { describe, expect, it } from "vitest";
import { bathStep, coatingUm, doneAt, emptyLine, hoistPlan, lineStep, priceMode, thermostat, type BathSpec, type LineSpec } from "./model.ts";

const bath = (role: BathSpec["role"], setpointC: number | null, heaterKw = 6, coolerKw = 0): BathSpec => ({
  nodeId: 1,
  name: role,
  role,
  volumeL: 800,
  setpointC,
  tolC: 2,
  heaterKw,
  coolerKw,
});

const spec: LineSpec = {
  baths: [bath("degrease", 60), bath("rinse", null, 0), bath("anodize", 20, 0, 25), bath("rinse", null, 0), bath("seal", 97)],
  recipe: [
    { bath: 0, minutes: 5 },
    { bath: 1, minutes: 1 },
    { bath: 2, minutes: 45 },
    { bath: 3, minutes: 1 },
    { bath: 4, minutes: 30 },
  ],
  pitchMm: 900,
  speedMmS: 250,
  liftS: 20,
  dripS: 10,
  leadS: 10,
  loadEveryMin: 12,
  barAreaDm2: 2000,
  partsPerBar: 40,
  densityAdm2: 1.5,
  ambientC: 18,
};

describe("the anodizing line's model", () => {
  it("the thermostat heats below its band and holds in it", () => {
    const b = bath("degrease", 60);
    expect(thermostat(b, 57, { heating: false, cooling: false }).heating).toBe(true);
    expect(thermostat(b, 59.5, { heating: true, cooling: false }).heating).toBe(true);
    expect(thermostat(b, 60.5, { heating: true, cooling: false }).heating).toBe(false);
  });

  it("a heated bath warms, a cooled one with the current's heat stays near its set point", () => {
    const hot = bathStep(bath("degrease", 60), 50, 1, true, false, 0, 18);
    expect(hot).toBeGreaterThan(50);
    let t = 20;
    const anodize = { ...bath("anodize", 20, 0, 60), volumeL: 3000 };
    let st = { heating: false, cooling: false };
    for (let k = 0; k < 600; k++) {
      st = thermostat(anodize, t, st);
      t = bathStep(anodize, t, 10 / 3600, st.heating, st.cooling, 40, 18);
    }
    expect(Math.abs(t - 20)).toBeLessThan(2);
  });

  it("the coating grows about 20 µm in 45 min at 1.5 A/dm²", () => {
    expect(coatingUm(1.5, 45)).toBeGreaterThan(18);
    expect(coatingUm(1.5, 45)).toBeLessThan(23);
  });

  it("the bars run through the recipe to the unload station", () => {
    const line = emptyLine();
    let now = 1_000_000_000_000;
    let finished = 0;
    for (let k = 0; k < 6 * 360; k++) {
      now += 10_000;
      finished += lineStep(spec, line, now, 10, () => {}).length;
    }
    // six hours - a bar every 12 min at most, each ~85 min through
    expect(finished).toBeGreaterThan(5);
    expect(line.done.parts).toBe(finished * 40);
    // never two bars in one bath
    const stations = line.bars.filter((b) => b.id !== line.hoist.carrying && b.step >= 0).map((b) => spec.recipe[b.step].bath);
    expect(new Set(stations).size).toBe(stations.length);
  });
  it("the hoist comes to a bar ahead of its time, waits over the bath, lifts it when the time is done", () => {
    const line = emptyLine();
    const t0 = 1_000_000_000;
    // one bar in the degrease bath (station 1), 5 min there; the hoist idle at the load station
    line.bars.push({ id: "L-0001", step: 0, inSince: t0, coatingUm: 0, ah: 0 });
    line.lastLoad = t0;
    let now = t0 + 5 * 60_000 - 20_000; // 20 s before the end: travel 3.6 s + lead 10 s not yet reached
    lineStep(spec, line, now, 1, () => {});
    expect(line.hoist.state).toBe("idle");
    now = t0 + 5 * 60_000 - 12_000; // within travel + lead - it goes
    lineStep(spec, line, now, 1, () => {});
    expect(line.hoist.state).toBe("to-pick");
    now += 5_000;
    lineStep(spec, line, now, 5, () => {});
    expect(line.hoist.state).toBe("wait");
    const plan = hoistPlan(spec, line, now);
    expect(plan.map((p) => p.state)).toEqual(["wait", "lift-up", "drip", "carry", "lift-down"]);
    expect(plan[0].endAt).toBe(doneAt(spec, line.bars[0]));
    // the carriage stands while it lifts, travels only in the carry
    expect(plan[1].fromMm).toBe(plan[1].toMm);
    expect(plan[3].toMm).toBe(2 * spec.pitchMm);
    now = doneAt(spec, line.bars[0]) + 1_000;
    lineStep(spec, line, now, 9, () => {});
    expect(line.hoist.state).toBe("lift-up");
  });
  it("by the price the band is used differently, never left: cheap - stored to its top, dear - its bottom", () => {
    expect(priceMode(0.1)).toBe("cheap");
    expect(priceMode(0.5)).toBe("normal");
    expect(priceMode(0.9)).toBe("dear");
    expect(priceMode(null)).toBe("normal");
    const b = bath("degrease", 60); // tolC 2 - the band 59..61
    for (const mode of ["cheap", "normal", "dear"] as const) {
      let t = 59.5;
      let st = { heating: false, cooling: false };
      let max = -Infinity;
      let min = Infinity;
      for (let k = 0; k < 2000; k++) {
        st = thermostat(b, t, st, mode);
        t = bathStep(b, t, 10 / 3600, st.heating, st.cooling, 0, 18);
        if (k > 200) {
          max = Math.max(max, t);
          min = Math.min(min, t);
        }
      }
      expect(min).toBeGreaterThan(58.8);
      expect(max).toBeLessThan(61.3);
      if (mode === "cheap") expect(max).toBeGreaterThan(60.6);
      if (mode === "dear") expect(max).toBeLessThan(59.6);
    }
  });
});
