/**
 * energy-ledger - the strategies (L3), pure: each one shapes what the
 * optimiser sees (plan.ts) - its prices, its SoC band, its penalties - and
 * every strategy's plan is then valued in the real money (the real prices,
 * no penalties), so they compare fairly: the forecast EUR, the import, the
 * self-sufficiency, the peak import.
 */
import { optimise, slotMoney, type PlanBattery, type PlanLimits, type PlannedSlot, type PlanSlot } from "./plan.ts";

export type StrategyKey = "cost" | "selfSufficiency" | "reserve" | "peakShaving" | "sales";

export interface StrategyParams {
  reserveHighPct: number; // "reserve": the SoC kept (e.g. before a storm)
  peakLimitKw: number | null; // "peakShaving": the import above it avoided
  peakPenaltyCtKwh: number; // what a kWh over the limit counts as
  sellThresholdCt: number; // "sales": the batteries sell only above this price
}

export const STRATEGY_DEFAULTS: StrategyParams = { reserveHighPct: 80, peakLimitKw: null, peakPenaltyCtKwh: 200, sellThresholdCt: 15 };

export const STRATEGIES: { key: StrategyKey; name: string; text: string }[] = [
  { key: "cost", name: "Least cost", text: "The batteries charge when energy is cheap or free and give it back when it is dear - the least money" },
  { key: "selfSufficiency", name: "Self-sufficiency", text: "As little from the grid as possible - the own generation stored, no charging from the grid" },
  { key: "reserve", name: "Reserve", text: "The batteries kept high (e.g. before a storm) - ready for an outage" },
  { key: "peakShaving", name: "Peak shaving", text: "The import kept under the peak limit - a business's capacity charge (Leistungspreis)" },
  { key: "sales", name: "Sales", text: "The stored energy sold only above the price threshold - never cheap" },
];

/** What the optimiser sees under a strategy. */
export function shape(key: StrategyKey, slots: PlanSlot[], limits: PlanLimits, p: StrategyParams): { slots: PlanSlot[]; limits: PlanLimits } {
  switch (key) {
    case "selfSufficiency":
      // every kWh from the grid equally dear, the sales worth nothing - the own energy kept on site
      return { slots: slots.map((s) => ({ ...s, buyCtKwh: 100, sellCtKwh: 0 })), limits: { ...limits, gridChargeAllowed: false } };
    case "reserve":
      // the reserve is the point - being under it weighs (per kWh and hour) more than any price gap
      return { slots, limits: { ...limits, socMinPct: Math.max(limits.socMinPct, p.reserveHighPct), belowFloorCtKwhH: 50 } };
    case "peakShaving":
      return { slots, limits: { ...limits, peakLimitKw: p.peakLimitKw, peakPenaltyCtKwh: p.peakPenaltyCtKwh } };
    case "sales":
      // below the threshold a sale is worth nothing - the batteries never sell cheap
      return { slots: slots.map((s) => ({ ...s, sellCtKwh: s.sellCtKwh >= p.sellThresholdCt ? s.sellCtKwh : 0 })), limits };
    default:
      return { slots, limits };
  }
}

export interface StrategyResult {
  key: StrategyKey;
  eur: number; // the real money over the horizon (purchases - sales + wear)
  importKwh: number;
  peakKw: number;
  selfSufficiencyPct: number | null;
  minSocPct: number;
}

/** A plan valued in the real money and energy. */
export function evaluate(key: StrategyKey, slots: PlanSlot[], planned: PlannedSlot[], limits: PlanLimits): StrategyResult {
  let eur = 0;
  let importKwh = 0;
  let loadKwh = 0;
  let peakKw = 0;
  slots.forEach((s, i) => {
    // the real money - the import limit's and the peak's penalties only steer the optimiser
    const m = slotMoney(s, planned[i].batteryKw, { ...limits, peakLimitKw: null, maxImportKw: null });
    eur += m.eur;
    if (m.grid > 0) importKwh += m.grid * s.hours;
    peakKw = Math.max(peakKw, m.grid);
    loadKwh += s.loadKw * s.hours;
  });
  return {
    key,
    eur,
    importKwh,
    peakKw,
    selfSufficiencyPct: loadKwh > 0 ? Math.max(0, Math.min(100, (1 - importKwh / loadKwh) * 100)) : null,
    minSocPct: Math.min(...planned.map((x) => x.socPct)),
  };
}

/** Every strategy planned and valued; the chosen one's plan returned too. */
export function planAll(chosen: StrategyKey, slots: PlanSlot[], battery: PlanBattery, limits: PlanLimits, p: StrategyParams) {
  const results: StrategyResult[] = [];
  let plan: PlannedSlot[] = [];
  for (const s of STRATEGIES) {
    // peak shaving without a limit set - nothing to shave
    if (s.key === "peakShaving" && p.peakLimitKw === null) continue;
    const shaped = shape(s.key, slots, limits, p);
    const planned = optimise(shaped.slots, battery, shaped.limits);
    results.push(evaluate(s.key, slots, planned, limits));
    if (s.key === chosen) plan = planned;
  }
  if (!plan.length) plan = optimise(slots, battery, limits);
  // the chosen plan's money in the real prices (its own shaped ones only steered it)
  plan = plan.map((x, i) => {
    const money = { ...limits, peakLimitKw: null, maxImportKw: null };
    const m = slotMoney(slots[i], x.batteryKw, money);
    return { ...x, costEur: m.eur, baselineEur: slotMoney(slots[i], 0, money).eur, gridKw: m.grid, curtailedKw: m.curtailed };
  });
  return { plan, results };
}

/**
 * The heating's signal per slot (SG-Ready, the German heat pumps' standard
 * input): 3 - "run more" (a cheap quarter of the next 24 h, or the forecast
 * generation over the consumption - store heat now), 1 - "hold off" (the
 * dearest tenth - the tanks carry it, never longer than `maxBlockSlots` in
 * a row), 2 - normal.
 */
export function heatingSignals(slots: PlanSlot[], maxBlockSlots = 8): (1 | 2 | 3)[] {
  const out: (1 | 2 | 3)[] = [];
  let blocked = 0;
  slots.forEach((s, i) => {
    const day = slots.slice(i, i + 96).map((x) => x.buyCtKwh).sort((a, b) => a - b);
    const rank = day.length > 1 ? day.filter((b) => b < s.buyCtKwh).length / (day.length - 1) : 0.5;
    let signal: 1 | 2 | 3 = 2;
    if (s.generationKw > s.loadKw || rank <= 0.25) signal = 3;
    else if (rank >= 0.9 && blocked < maxBlockSlots) signal = 1;
    blocked = signal === 1 ? blocked + 1 : 0;
    out.push(signal);
  });
  return out;
}
