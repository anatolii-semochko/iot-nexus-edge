import { describe, expect, it } from "vitest";
import { inspect, pallets, type QcSpec } from "./model.ts";

const spec: QcSpec = { minUm: 17, targetUm: 20, points: 5, inspectMin: 6, partsPerBar: 40, perPallet: 160 };

describe("QC and packing's model", () => {
  it("a batch always measures the same", () => {
    expect(inspect(spec, "L-0007", 20, 0)).toEqual(inspect(spec, "L-0007", 20, 0));
  });

  it("a good coating passes with few rejects, a thin one is to check", () => {
    const good = inspect(spec, "L-0001", 20.4, 0);
    expect(good.verdict).toBe("passed");
    expect(good.rejected).toBeLessThanOrEqual(1);
    const thin = inspect(spec, "L-0002", 15, 0);
    expect(thin.verdict).toBe("check");
    expect(thin.rejected).toBeGreaterThanOrEqual(2);
  });

  it("packs the parts onto pallets", () => {
    expect(pallets(spec, 390)).toEqual({ full: 2, filling: 70 });
  });
});
