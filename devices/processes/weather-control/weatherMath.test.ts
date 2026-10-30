import { describe, expect, it } from "vitest";
// @ts-expect-error - the UI's plain JS module, no types
import { apparentC, beaufortOf, compassOf, degreeDays, dewPointC, pressureTrend, weatherText } from "./ui/weatherMath.js";

// The weather scene's figures (2026-10-30) against the standard tables' values.
describe("weather scene math", () => {
  it("dew point (Magnus): 20 °C at 50 % - about 9.3 °C", () => {
    expect(dewPointC(20, 50)).toBeCloseTo(9.3, 1);
    expect(dewPointC(6.2, 98)).toBeCloseTo(5.9, 1);
  });
  it("apparent temperature (Steadman): wind cools, humidity warms", () => {
    expect(apparentC(20, 50, 0)).toBeCloseTo(19.85, 1);
    expect(apparentC(5, 80, 10)!).toBeLessThan(apparentC(5, 80, 0)!);
  });
  it("Beaufort and the compass", () => {
    expect(beaufortOf(0.2)).toEqual({ force: 0, name: "Calm" });
    expect(beaufortOf(17.2)?.force).toBe(8);
    expect(compassOf(0)).toBe("N");
    expect(compassOf(350)).toBe("N");
    expect(compassOf(225)).toBe("SW");
  });
  it("pressure tendency over 3 hours", () => {
    const h = 3_600_000;
    const rows = [0, 1, 2, 3].map((i) => ({ t: i * h, pressureHpa: 1010 - i * 0.8 }));
    expect(pressureTrend(rows, 3 * h)).toMatchObject({ word: "falling" });
    expect(pressureTrend(rows.map((r) => ({ ...r, pressureHpa: 1010 })), 3 * h)).toMatchObject({ word: "steady" });
  });
  it("degree-days and the WMO words", () => {
    expect(degreeDays([{ temperatureC: 8 }, { temperatureC: 20 }], 18)).toBe(5);
    expect(weatherText(45)).toBe("Fog");
    expect(weatherText(63)).toBe("Rain");
  });
});
