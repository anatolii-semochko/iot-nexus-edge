import { describe, expect, it } from "vitest";
import { alertsOf } from "./alerts.ts";

describe("the critical states", () => {
  const base = { gridKw: 80, loadKw: 120, plan: { gridKw: 70, loadKw: 110 }, maxImportKw: 250, peakLimitKw: null, pv: [], wind: [], batteries: [] };

  it("is quiet near the plan", () => {
    expect(alertsOf(base)).toEqual({ grid: null, load: null, units: {} });
  });

  it("flags the import at the limit, over the peak, well over the plan; the consumption over the plan", () => {
    expect(alertsOf({ ...base, gridKw: 250 }).grid).toMatchObject({ level: "critical", text: expect.stringMatching(/limit/) });
    expect(alertsOf({ ...base, peakLimitKw: 60 }).grid).toMatchObject({ level: "critical", text: expect.stringMatching(/peak/) });
    expect(alertsOf({ ...base, gridKw: 130 }).grid).toMatchObject({ level: "warning", text: expect.stringMatching(/plan expected/) });
    expect(alertsOf({ ...base, loadKw: 170 }).load).toMatchObject({ level: "warning" });
  });

  it("flags a unit over its rating", () => {
    const a = alertsOf({ ...base, pv: [{ nodeId: 1, kw: 10.5, acKw: 10 }], batteries: [{ nodeId: 2, kw: -70, maxChargeKw: 60, maxDischargeKw: 60 }, { nodeId: 3, kw: 59, maxChargeKw: 60, maxDischargeKw: 60 }] });
    expect(Object.keys(a.units)).toEqual(["1", "2"]);
  });
});
