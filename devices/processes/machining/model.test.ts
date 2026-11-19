import { describe, expect, it } from "vitest";
import { deliver, machineStep, oee, sawStep, type Job, type Machine, type Material, type Saw, type ShopSpec } from "./model.ts";

const spec: ShopSpec = { cutS: 45, kerfMm: 3, bufferMax: 12, toolLifeMin: 240, toolChangeMin: 8, performance: 0.95 };
const jobs: Job[] = [
  { program: "A-12", part: "Housing", material: "6061-60", blankMm: 85, qty: 4, cycleS: 380, setupMin: 25 },
  { program: "K-7", part: "Bracket", material: "6082-60x10", blankMm: 120, qty: 6, cycleS: 130, setupMin: 15 },
];
const machine = (name: string, job: number): Machine => ({
  name,
  state: "idle",
  job,
  done: 0,
  blanks: 0,
  cycleLeftS: 0,
  setupLeftS: 0,
  alarmLeftS: 0,
  toolLeftMin: 240,
  runS: 0,
  plannedS: 0,
  parts: 0,
});

describe("the machining's model", () => {
  it("the saw feeds the machines, they finish their jobs and change over", () => {
    const stock: Material[] = [
      { key: "6061-60", name: "6061 Ø60", stockM: 10, minM: 5, lotM: 30 },
      { key: "6082-60x10", name: "6082 60x10", stockM: 10, minM: 5, lotM: 30 },
    ];
    const saw: Saw = { cutting: null, cutLeftS: 0, cuts: 0 };
    const ms = [machine("CNC 1", 0), machine("CNC 2", 1)];
    let parts = 0;
    for (let k = 0; k < 360 * 3; k++) {
      sawStep(spec, saw, ms, jobs, stock, 10, true);
      for (const m of ms) parts += machineStep(spec, m, jobs, 10, true);
    }
    expect(parts).toBeGreaterThan(10);
    expect(saw.cuts).toBeGreaterThanOrEqual(parts);
    // CNC 1 went past its 4 housings onto the brackets (the jobs in turn)
    expect(ms[0].parts).toBeGreaterThan(4);
    expect(stock[0].stockM).toBeLessThan(10);
    expect(oee(spec, ms[0], 1)).toBeGreaterThan(0.2);
  });

  it("off the shift everything stops; the low stock is delivered", () => {
    const m = machine("CNC 1", 0);
    m.blanks = 3;
    expect(machineStep(spec, m, jobs, 10, false)).toBe(0);
    expect(m.state).toBe("off");
    const stock: Material[] = [{ key: "a", name: "a", stockM: 2, minM: 5, lotM: 30 }];
    expect(deliver(stock)).toEqual(["a"]);
    expect(stock[0].stockM).toBe(32);
  });
});
