import { describe, expect, it } from "vitest";

import { phaseOf, stepDue } from "./schedule.js";

describe("schedule", () => {
  it("spreads neighbouring processes over the interval", () => {
    const phases = [45, 46, 48, 51, 52].map((id) => phaseOf(id, 30_000));
    for (const p of phases) expect(p >= 0 && p < 30_000).toBe(true);
    expect(new Set(phases.map((p) => Math.floor(p / 1000))).size).toBe(5); // all in different seconds
  });

  it("is due once per interval, at the process's own place in it", () => {
    const id = 46;
    const interval = 30_000;
    const start = 1_800_000_000_000;
    let last: number | null = null;
    const runs: number[] = [];
    for (let t = start; t < start + 120_000; t += 1000) {
      if (stepDue(id, interval, last, t)) {
        runs.push(t);
        last = t;
      }
    }
    // the first at once, then one per interval
    expect(runs[0]).toBe(start);
    const gaps = runs.slice(2).map((t, i) => t - runs[i + 1]);
    expect(gaps.every((g) => g === interval)).toBe(true);
    // the steady steps at the same place of the interval: (t + phase) on a slot's boundary
    for (const t of runs.slice(1)) expect((t + phaseOf(id, interval)) % interval).toBeLessThan(1000);
  });

  it("does not miss a slot when the ticks around its start were skipped", () => {
    const interval = 30_000;
    const phase = phaseOf(7, interval);
    const boundary = Math.ceil((1_800_000_000_000 + phase) / interval) * interval - phase;
    expect(stepDue(7, interval, boundary - 5000, boundary + 4000)).toBe(true);
    expect(stepDue(7, interval, boundary + 4000, boundary + 9000)).toBe(false);
  });

  it("runs every time without an interval, and when never run", () => {
    expect(stepDue(1, 0, 123, 124)).toBe(true);
    expect(stepDue(1, 30_000, null)).toBe(true);
  });
});
