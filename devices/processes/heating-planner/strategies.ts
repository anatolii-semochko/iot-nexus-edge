/**
 * heating-planner - the strategies (P3 - iot AGENTS_TO_DO.md 2026-10-29), pure: each one shapes what the
 * plan's model sees (its weights, its comfort margin, its store, its prices) - and every strategy's plan
 * is then valued in the real money (the real prices, no penalties), so they compare fairly: the
 * electricity, the starts, the unit-hours, the rooms off their setpoint, the sun's heat.
 */
import { planHeating, type HeatPlan, type PlannerSlot, type PlannerSystem } from "./model.ts";

export type HeatStrategyKey = "cost" | "gentle" | "comfort" | "sun";

export const HEAT_STRATEGIES: { key: HeatStrategyKey; name: string; text: string }[] = [
  { key: "cost", name: "Least cost", text: "The heat made when the energy is cheapest, the rooms' comfort margin used in the dear hours - the least money" },
  { key: "gentle", name: "Gentle", text: "As few starts and as low a power as possible - the heat pumps' wear and the peaks spared, a little dearer" },
  { key: "comfort", name: "Comfort", text: "The rooms always at their setpoint - no comfort margin, the tanks alone carry the dear hours" },
  { key: "sun", name: "The sun", text: "The sun's surplus stored as heat - worth nothing on the grid, the tanks filled higher while it shines" },
];

// "gentle": a start, a unit-hour and the power over the comfort modulation weigh this much more
const GENTLE = { start: 5, unitHour: 3, boost: 4 };
// "sun": the tanks may go this much hotter (colder when cooling) while storing the sun's heat
const SUN_STORE_K = 8;

/** What the model sees under a strategy. */
export function shape(key: HeatStrategyKey, sys: PlannerSystem, slots: PlannerSlot[]): { sys: PlannerSystem; slots: PlannerSlot[] } {
  switch (key) {
    case "gentle":
      return {
        sys: { ...sys, startPenaltyEur: sys.startPenaltyEur * GENTLE.start, unitHourEur: sys.unitHourEur * GENTLE.unitHour, boostCtKwh: sys.boostCtKwh * GENTLE.boost },
        slots,
      };
    case "comfort":
      return { sys: { ...sys, comfortK: 0 }, slots };
    case "sun": {
      const store = sys.mode === "heating" ? { ...sys.store, maxC: sys.store.maxC + SUN_STORE_K } : { ...sys.store, minC: Math.max(4, sys.store.minC - SUN_STORE_K / 2) };
      return { sys: { ...sys, store }, slots: slots.map((s) => ({ ...s, sellCtKwh: 0 })) };
    }
    default:
      return { sys, slots };
  }
}

export interface HeatStrategyResult {
  key: HeatStrategyKey;
  energyEur: number; // the electricity at the real prices (the sun's surplus at the sale price)
  baselineEur: number;
  savingEur: number;
  starts: number; // the heat pumps' starts (each unit counted)
  unitHours: number;
  comfortKh: number; // the rooms off their setpoint, kelvin-hours
  maxOffsetK: number;
  sunKwh: number; // the electricity taken from the sun's surplus
}

/** The electricity's money of one slot at the real prices: the surplus first at the sale price. */
const realEur = (s: PlannerSlot, kw: number) => {
  const cheap = Math.min(kw, Math.max(0, s.cheapKw));
  return { eur: ((cheap * s.sellCtKwh + (kw - cheap) * s.buyCtKwh) * s.hours) / 100, sunKwh: cheap * s.hours };
};

/** A plan valued in the real money (its slots' energyEur re-valued too) and its figures. */
export function evaluate(key: HeatStrategyKey, plan: HeatPlan, slots: PlannerSlot[]): { plan: HeatPlan; result: HeatStrategyResult } {
  let energyEur = 0;
  let sunKwh = 0;
  let starts = 0;
  let unitHours = 0;
  let comfortKh = 0;
  let maxOffsetK = 0;
  let before = 0;
  let baselineEur = 0;
  const out = plan.slots.map((p, i) => {
    const s = slots[i];
    const m = realEur(s, p.electricKw);
    const base = realEur(s, p.baselineKw).eur;
    baselineEur += base;
    energyEur += m.eur;
    sunKwh += m.sunKwh;
    starts += Math.max(0, p.units - before);
    before = p.units;
    unitHours += p.units * s.hours;
    comfortKh += p.roomOffsetK * s.hours;
    maxOffsetK = Math.max(maxOffsetK, p.roomOffsetK);
    return { ...p, energyEur: m.eur, baselineEur: base };
  });
  const valued = { ...plan, slots: out, energyEur, baselineEur, savingEur: baselineEur - energyEur };
  return {
    plan: valued,
    result: { key, energyEur, baselineEur, savingEur: baselineEur - energyEur, starts, unitHours, comfortKh, maxOffsetK, sunKwh },
  };
}

/** Every strategy planned and valued; the chosen one's plan (or, by `cheapest`, the least electricity's). */
export function planAll(chosen: HeatStrategyKey, sys: PlannerSystem, slots: PlannerSlot[], cheapest = false) {
  const results: HeatStrategyResult[] = [];
  const plans = new Map<HeatStrategyKey, HeatPlan>();
  // one baseline for all: the band control's tanks at the real store's middle
  const base = { ...sys, baselineTankC: sys.baselineTankC ?? (sys.store.minC + sys.store.maxC) / 2 };
  for (const st of HEAT_STRATEGIES) {
    const shaped = shape(st.key, base, slots);
    const { plan, result } = evaluate(st.key, planHeating(shaped.sys, shaped.slots), slots);
    results.push(result);
    plans.set(st.key, plan);
  }
  const key = cheapest ? results.reduce((a, r) => (r.energyEur < a.energyEur ? r : a)).key : chosen;
  return { key, plan: plans.get(key) ?? plans.get("cost")!, results };
}
