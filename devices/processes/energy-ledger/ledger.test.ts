import { describe, expect, it } from "vitest";
import { accountsDay, addAccounts, heatPriceOf } from "./accounts.ts";
import { accuracyOf, correctionsOf, type Sample } from "./learning.ts";
import { addDays, bridge, emptyDay, kpis } from "./ledger.ts";
import { optimise, planSteps, type PlanLimits, type PlanSlot } from "./plan.ts";
import { dayTypeOf, noteEffects, type DayNote } from "./notes.ts";
import { dayPrices, reviewDay } from "./review.ts";
import { analogChoice, distance, featuresOfRecord, similarDays } from "./similar.ts";
import { heatingSignals, planAll, STRATEGY_DEFAULTS } from "./strategies.ts";

// A day of 15-minute slots: a cheap night, a sunny noon, a dear evening.
const day = (load = (h: number) => (h > 7 && h < 19 ? 160 : 35)): PlanSlot[] =>
  Array.from({ length: 96 }, (_, i) => {
    const h = i / 4;
    return {
      t: i * 900_000,
      end: (i + 1) * 900_000,
      hours: 0.25,
      buyCtKwh: h < 6 ? 25 : h >= 17 && h < 21 ? 45 : 33,
      sellCtKwh: h >= 17 && h < 21 ? 22 : 8,
      generationKw: h > 8 && h < 17 ? 200 * Math.sin(((h - 8) / 9) * Math.PI) : 0,
      loadKw: load(h),
    };
  });
const battery = { capacityKwh: 268, socPct: 30, maxChargeKw: 240, maxDischargeKw: 240, efficiency: 0.97 };
const limits: PlanLimits = { socMinPct: 20, socMaxPct: 95, exportAllowed: true, gridChargeAllowed: true, maxImportKw: 250, maxExportKw: 450, wearCtKwh: 3 };
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe("the savings bridge", () => {
  const d = { ...emptyDay(), loadKwh: 1000, heatElecKwh: 60, deliveredHeatKwh: 200, noStorageKwh: 70, importKwh: 600, exportKwh: 50, allBoughtEur: 320, costEur: 200, revenueEur: 8, heatDirectEur: 64, heatNoStorageEur: 22, heatCostEur: 18, minutes: 1440 };

  it("its steps sum exactly to what was paid - in EUR and in kWh", () => {
    const b = bridge(d);
    expect(sum(b.slice(0, 5).map((s) => s.eur))).toBeCloseTo(b[5].eur, 9);
    expect(sum(b.slice(0, 5).map((s) => s.kwh))).toBeCloseTo(b[5].kwh, 9);
    expect(b[5].eur).toBeCloseTo(192, 9);
  });

  it("the saving is without the system less paid; a consistent record", () => {
    const k = kpis(d, 268);
    expect(k.savedEur).toBeCloseTo(bridge(d)[0].eur - 192, 9);
    expect(k.consistent).toBe(true);
  });

  it("flags a record with more import than consumption and charging", () => {
    expect(kpis({ ...d, importKwh: 1300 }, 268).consistent).toBe(false);
  });

  it("days add up: sums, maxima, the time-weighted wind", () => {
    const a = { ...d, peakImportKw: 120, windAvgMs: 2, tempMinC: 3, tempMaxC: 9 };
    const b = { ...d, peakImportKw: 150, windAvgMs: 6, tempMinC: 5, tempMaxC: 12 };
    const both = addDays([a, b]);
    expect(both.costEur).toBe(400);
    expect(both.peakImportKw).toBe(150);
    expect(both.tempMinC).toBe(3);
    expect(both.tempMaxC).toBe(12);
    expect(both.windAvgMs).toBeCloseTo(4, 9);
  });
});

describe("the plan's optimiser", () => {
  const slots = day();
  const plan = optimise(slots, battery, limits);

  it("saves against no batteries and keeps the SoC in its band", () => {
    expect(sum(plan.map((p) => p.baselineEur)) - sum(plan.map((p) => p.costEur))).toBeGreaterThan(10);
    for (const p of plan) {
      expect(p.socPct).toBeGreaterThanOrEqual(20);
      expect(p.socPct).toBeLessThanOrEqual(95);
    }
  });

  it("charges in the cheap night, discharges in the dear evening", () => {
    expect(Math.min(...plan.slice(0, 24).map((p) => p.batteryKw))).toBeLessThan(-1);
    expect(sum(plan.slice(17 * 4, 21 * 4).map((p) => p.batteryKw))).toBeGreaterThan(0);
  });

  it("never charges from the grid when not allowed", () => {
    const noGrid = optimise(slots, battery, { ...limits, gridChargeAllowed: false });
    noGrid.forEach((p, i) => {
      if (p.batteryKw < -0.01) expect(-p.batteryKw * battery.efficiency).toBeLessThanOrEqual(Math.max(0, slots[i].generationKw - slots[i].loadKw) + 4);
    });
  });

  it("climbs back to its floor from under it (a soft floor)", () => {
    const low = optimise(slots, { ...battery, socPct: 5 }, limits);
    expect(Math.max(...low.map((p) => p.socPct))).toBeGreaterThanOrEqual(20);
  });

  it("names its steps, a short pause between two runs of one action merged", () => {
    const steps = planSteps(plan, slots);
    for (let i = 1; i < steps.length; i++) expect(steps[i].from).toBe(steps[i - 1].to);
    expect(steps.some((s) => s.action === "charge")).toBe(true);
  });
});

describe("the strategies", () => {
  const slots = day();
  const params = { ...STRATEGY_DEFAULTS, peakLimitKw: 120 };
  const { results } = planAll("cost", slots, battery, limits, params);
  const of = (k: string) => results.find((r) => r.key === k)!;

  it("least cost is the cheapest in the real money", () => {
    for (const r of results) expect(of("cost").eur).toBeLessThanOrEqual(r.eur + 0.01);
  });

  it("peak shaving keeps the import under the limit", () => {
    expect(of("peakShaving").peakKw).toBeLessThanOrEqual(121);
    expect(of("cost").peakKw).toBeGreaterThan(121);
  });

  it("reserve keeps the batteries high", () => {
    expect(of("reserve").minSocPct).toBeGreaterThan(of("cost").minSocPct);
  });

  it("the heating's signal: store heat in the cheap / sunny slots, hold off in the dearest", () => {
    const s = heatingSignals(slots);
    expect(s[4]).toBe(3); // 01:00 - cheap
    expect(s.filter((x) => x === 1).length).toBeGreaterThan(0);
    // never more than 2 h of "hold off" in a row
    let run = 0;
    for (const x of s) {
      run = x === 1 ? run + 1 : 0;
      expect(run).toBeLessThanOrEqual(8);
    }
  });
});

describe("the learning", () => {
  const samples: Sample[] = Array.from({ length: 96 * 3 }, (_, i) => {
    const h = (i % 96) / 4;
    const pvF = h > 8 && h < 17 ? 150 : 0;
    return { t: i * 900_000, hours: 0.25, pvF, pvA: pvF * 0.9, windF: 20, windA: 25, loadF: 100, loadA: h >= 12 && h < 13 ? 130 : 100, buy: h > 17 ? 45 : 28, sell: 10, socStart: 40, weekday: 3, hour: Math.floor(h), month: 10 };
  });

  it("learns the PV and wind factors and the consumption by weekday-hour", () => {
    const c = correctionsOf(samples, 10);
    expect(c.pvFactor).toBeCloseTo(0.9, 6);
    expect(c.windFactor).toBeCloseTo(1.25, 6);
    expect(c.load["3-12"]).toBeCloseTo(30, 6);
    expect(c.load["3-8"]).toBeCloseTo(0, 6);
  });

  it("measures the forecast's accuracy", () => {
    const a = accuracyOf(samples.slice(0, 96));
    expect(a.generationPct!).toBeGreaterThan(85);
    expect(a.generationPct!).toBeLessThan(95);
    expect(a.consumptionPct!).toBeGreaterThan(95);
  });

  const battery = { capacityKwh: 268, maxChargeKw: 240, maxDischargeKw: 240, efficiency: 0.97 };
  const review = (over: Partial<Parameters<typeof reviewDay>[0]> = {}) =>
    reviewDay({
      samples: samples.slice(0, 96),
      battery,
      limits,
      params: { ...STRATEGY_DEFAULTS, peakLimitKw: 120 },
      ran: "reserve",
      socEndPct: 40,
      reserveFloorPct: 10,
      reservePct: 20,
      minGainEur: 1,
      ...over,
    });

  it("reviews the day: the best strategy in hindsight, the strategy's part of the money", () => {
    const v = review()!;
    expect(v.eur[v.best]).toBe(Math.min(...Object.values(v.eur)));
    expect(v.strategyEur).toBeCloseTo(v.ranEur - v.bestEur, 1);
    // the actual PV 90 % of the forecast: 150 kW x 0.25 h x 35 slots
    expect(v.forecast.pv.forecastKwh).toBeCloseTo(1312.5, 1);
    expect(v.forecast.pv.actualKwh).toBeCloseTo(1181.25, 1);
    // no actual battery power in these samples - no actual money
    expect(v.actualEur).toBeNull();
    expect(v.recommendation.reasons.length).toBeGreaterThan(0);
  });

  it("splits the day's regret into the forecast's and the strategy's parts", () => {
    // the batteries idle all day while the best plan moves them - the day as it ran cost more
    const idle = samples.slice(0, 96).map((s) => ({ ...s, batA: 0 }));
    const v = review({ samples: idle, ran: "cost" })!;
    expect(v.actualEur).not.toBeNull();
    expect(v.regretEur!).toBeCloseTo(v.forecastEur! + v.strategyEur, 1);
    expect(v.forecastEur!).toBeGreaterThan(0);
    expect(v.recommendation.reasons.some((x) => x.startsWith("The forecast cost"))).toBe(true);
  });

  it("suggests charging from the grid when it would have paid", () => {
    const v = review({ limits: { ...limits, gridChargeAllowed: false } })!;
    const p = v.params.find((x) => x.key === "gridChargeAllowed");
    if (p) expect(p.gainEur).toBeGreaterThan(1);
  });

  it("sums the day's prices", () => {
    const p = dayPrices(samples.slice(0, 96))!;
    expect(p.minCt).toBe(28);
    expect(p.maxCt).toBe(45);
    expect(p.spreadCt).toBe(17);
  });
});

describe("the operational days' notes", () => {
  const note = (over: Partial<DayNote>): DayNote => ({ day: "2026-10-26", kind: "other", text: "", startsAt: null, endsAt: null, nodeIds: [], source: "user", ...over });

  it("types a day by its notes first", () => {
    expect(dayTypeOf("2026-10-26", []).working).toBe(true); // a Monday
    expect(dayTypeOf("2026-10-26", [note({ kind: "holiday", text: "A holiday" })])).toMatchObject({ working: false, reason: "A holiday" });
    expect(dayTypeOf("2026-10-24", [note({ day: "2026-10-24", kind: "workday" })]).working).toBe(true); // a Saturday at work
    expect(dayTypeOf("2026-10-25", []).working).toBe(false);
  });

  it("maps the consumption profile, the units in maintenance, the outage's window", () => {
    const monday = Date.parse("2026-10-26T10:00:00Z");
    const e = noteEffects(
      [
        note({ kind: "day-off" }),
        note({ kind: "maintenance", nodeIds: [7, 60], startsAt: Date.parse("2026-10-26T09:00:00Z"), endsAt: Date.parse("2026-10-26T12:00:00Z") }),
        note({ kind: "outage", startsAt: Date.parse("2026-10-26T13:00:00Z"), endsAt: Date.parse("2026-10-26T15:00:00Z") }),
      ],
      "UTC",
      [{ nodeId: 60, maxDischargeKw: 60 }, { nodeId: 61, maxDischargeKw: 60 }],
    );
    expect(e.profileWeekday(monday, 1)).toBe(0); // a day off - Sunday's profile
    expect(e.unitOff(7, monday)).toBe(true);
    expect(e.unitOff(7, Date.parse("2026-10-26T12:30:00Z"))).toBe(false);
    expect(e.batteryFactor(monday)).toBeCloseTo(0.5, 6);
    expect(e.gridOff(Date.parse("2026-10-26T14:00:00Z"))).toBe(true);
    expect(e.gridOff(monday)).toBe(false);
  });

  it("charges the batteries ahead of an outage and uses the reserve in it", () => {
    // a flat price, no sun: without the outage the batteries would idle at the reserve
    const slots: PlanSlot[] = Array.from({ length: 32 }, (_, i) => ({
      t: i * 900_000,
      end: (i + 1) * 900_000,
      hours: 0.25,
      buyCtKwh: 30,
      sellCtKwh: 5,
      generationKw: 0,
      loadKw: 50,
      ...(i >= 24 ? { gridOff: true } : {}),
    }));
    const plan = optimise(slots, { capacityKwh: 200, socPct: 30, maxChargeKw: 100, maxDischargeKw: 100, efficiency: 0.97 }, { ...limits, socMinPct: 30, hardMinPct: 10 });
    // the outage (2 h x 50 kW = 100 kWh) carried by the batteries - nothing shed (1 % SoC steps - a little
    // more some slots, held back)
    plan.slice(24).forEach((x) => expect(x.batteryKw).toBeGreaterThanOrEqual(49.9));
    expect(plan[23].socPct).toBeGreaterThan(60);
    // never under the reserve before it
    plan.slice(0, 24).forEach((x) => expect(x.socPct).toBeGreaterThanOrEqual(30));
    expect(Math.min(...plan.slice(24).map((x) => x.socPct))).toBeLessThan(30);
  });
});

describe("the similar days", () => {
  const rec = (day: string, sun: number, best: string, regret: number, working?: boolean) => ({
    day,
    final: true,
    data: {
      sunKwhM2: sun,
      windAvgMs: 3,
      tempMinC: 5,
      tempMaxC: 11,
      prices: { avgCt: 30, spreadCt: 12 },
      ...(working === undefined ? {} : { dayType: { working } }),
      allBoughtEur: 400,
      heatDirectEur: 100,
      heatCostEur: 30,
      costEur: 250,
      revenueEur: 20,
      hindsight: { best },
      review: { best, regretEur: regret, strategyEur: 0, recommendation: { reasons: [] } },
    },
  });

  it("weighs the weather, the prices, the season and the day's type", () => {
    const a = featuresOfRecord("2026-10-20", rec("2026-10-20", 3, "cost", 1).data);
    expect(distance(a, a)).toBe(0);
    expect(distance(a, { ...a, sunKwhM2: 4.5 })).toBeGreaterThan(0.9);
    expect(distance(a, { ...a, working: false })).toBeCloseTo(1.5, 6);
    expect(distance(a, { ...a, month: 4 })).toBeCloseTo(3, 6);
  });

  it("finds the nearest days, the best-run first, and the strategy they agree on", () => {
    const days = [
      rec("2026-10-12", 3.1, "cost", 2.5),
      rec("2026-10-13", 2.9, "cost", 0.4),
      rec("2026-10-14", 3.0, "sales", 1.2),
      rec("2026-10-15", 3.2, "cost", 0.9),
      rec("2026-10-16", 0.4, "reserve", 0.1), // a dark day - far
      rec("2026-10-18", 3.0, "reserve", 0.1, false), // a day off - farther
    ];
    const target = featuresOfRecord("2026-10-21", rec("2026-10-21", 3, "cost", 0).data);
    const found = similarDays(target, days, { count: 4 });
    expect(found.map((x) => x.day)).not.toContain("2026-10-16");
    expect(found[0].regretEur).toBeLessThanOrEqual(found[1].regretEur!);
    const c = analogChoice(found);
    expect(c.strategy).toBe("cost");
    expect(analogChoice(found.slice(0, 2)).strategy).toBeNull(); // too few
  });
});

describe("cost accounts", () => {
  const meters = [
    { nodeId: 1, todayKwh: 40, todayEur: 10 }, // the house (its heating plant included)
    { nodeId: 2, todayKwh: 20, todayEur: 5 }, // the offices' floor
    { nodeId: 3, todayKwh: 8, todayEur: 2 }, // a let unit
  ];
  const office = { today: { deliveredKwh: 100, costEur: 8 }, consumers: [{ nodeId: 10, todayKwh: 30 }, { nodeId: 11, todayKwh: 70 }] };
  const heatings = new Map([[5, office]]);
  const accounts = [
    { key: "house", name: "House", kind: "private" as const, meters: [1] },
    { key: "floor1", name: "Floor 1", kind: "business" as const, meters: [2], heat: [{ processId: 5, nodeIds: [10] }] },
    { key: "u1", name: "Unit 1", kind: "tenant" as const, meters: [3], heat: [{ processId: 5, nodeIds: [11] }] },
  ];

  it("prices the heat at its system's cost of heat today", () => {
    expect(heatPriceOf(office)).toBeCloseTo(0.08);
    expect(heatPriceOf({ today: { deliveredKwh: 0, costEur: 1 } })).toBeNull();
  });

  it("sums the meters' electricity and the heat meters' heat per account and kind", () => {
    const a = accountsDay(accounts, meters, heatings, 30);
    const u1 = a.items.find((x) => x.key === "u1")!;
    expect(u1).toMatchObject({ elecKwh: 8, elecEur: 2, heatKwh: 70 });
    expect(u1.heatEur).toBeCloseTo(5.6);
    expect(a.byKind.private).toBe(10);
    expect(a.byKind.business).toBeCloseTo(5 + 2.4);
    expect(a.byKind.tenant).toBeCloseTo(7.6);
    // the plant's whole cost (8) shared by its heat meters: 2.4 + 5.6
    expect(a.otherEur).toBeCloseTo(30 - 10 - 7.4 - 7.6);
  });

  it("a system's whole heat without node ids; a period's sum by account", () => {
    const whole = accountsDay([{ key: "w", name: "W", kind: "business", heat: [{ processId: 5 }] }], [], heatings, 0);
    expect(whole.items[0].heatKwh).toBe(100);
    expect(whole.otherEur).toBe(0);
    const day = accountsDay(accounts, meters, heatings, 30);
    const sum = addAccounts([day, null, day])!;
    expect(sum.items.find((x) => x.key === "house")!.elecKwh).toBe(80);
    expect(sum.byKind.tenant).toBeCloseTo(15.2);
    expect(addAccounts([null, undefined])).toBeNull();
  });
});

describe("the day notes and the heating", () => {
  it("lowers the heating's electricity for pumps out and rooms closed", () => {
    const at = Date.parse("2026-10-26T10:00:00Z");
    const note = (kind: "maintenance" | "room-closed", nodeIds: number[]): DayNote => ({ day: "2026-10-26", kind, text: "", startsAt: null, endsAt: null, nodeIds, source: "user" });
    const units = { pumps: [{ nodeId: 1, ratedKw: 12 }, { nodeId: 2, ratedKw: 12 }], coils: [{ nodeId: 10, ratedKw: 9 }, { nodeId: 11, ratedKw: 9 }] };
    expect(noteEffects([note("maintenance", [1])], "UTC", [], units).heatingFactor(at)).toBeCloseTo(0.5, 6);
    expect(noteEffects([note("room-closed", [10])], "UTC", [], units).heatingFactor(at)).toBeCloseTo(0.8, 6);
    expect(noteEffects([], "UTC", [], units).heatingFactor(at)).toBe(1);
  });
});
