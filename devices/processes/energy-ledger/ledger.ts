/**
 * energy-ledger - the day's record and the savings bridge, pure functions
 * (no I/O): what a day row holds, how two rows add up (a month, a year),
 * and the bridge from "without the system" to what was really paid, step
 * by step - each step in EUR and kWh, the steps summing exactly.
 */

export interface LedgerDay {
  // energy, kWh
  loadKwh: number; // the site's whole consumption (the heating's electricity included)
  heatElecKwh: number; // the heating's electricity (heat pumps, fans)
  deliveredHeatKwh: number; // the heat (or cold) the rooms got
  noStorageKwh: number; // the electricity heat pumps without tanks would take
  pvKwh: number;
  windKwh: number;
  importKwh: number;
  exportKwh: number;
  chargeKwh: number;
  dischargeKwh: number;
  curtailedKwh: number;
  // money, EUR
  allBoughtEur: number; // the whole consumption at the slots' purchase prices
  costEur: number; // what the grid bill says - the import
  revenueEur: number; // the export sold
  heatDirectEur: number; // the rooms' heat by direct electric heating
  heatNoStorageEur: number; // by heat pumps without tanks
  heatCostEur: number; // the heating's real electricity at the slots' prices
  // the day's maxima / weather
  peakImportKw: number;
  sunKwhM2: number;
  windAvgMs: number;
  windMaxMs: number;
  tempMinC: number | null;
  tempMaxC: number | null;
  minutes: number; // how long it was recorded
}

export const emptyDay = (): LedgerDay => ({
  loadKwh: 0,
  heatElecKwh: 0,
  deliveredHeatKwh: 0,
  noStorageKwh: 0,
  pvKwh: 0,
  windKwh: 0,
  importKwh: 0,
  exportKwh: 0,
  chargeKwh: 0,
  dischargeKwh: 0,
  curtailedKwh: 0,
  allBoughtEur: 0,
  costEur: 0,
  revenueEur: 0,
  heatDirectEur: 0,
  heatNoStorageEur: 0,
  heatCostEur: 0,
  peakImportKw: 0,
  sunKwhM2: 0,
  windAvgMs: 0,
  windMaxMs: 0,
  tempMinC: null,
  tempMaxC: null,
  minutes: 0,
});

const MAXIMA = new Set(["peakImportKw", "windMaxMs", "tempMaxC"]);
const MINIMA = new Set(["tempMinC"]);

/** Several days added up (a month, a year): sums, the maxima / minima kept, the average wind weighted by time. */
export function addDays(days: Partial<LedgerDay>[]): LedgerDay {
  const out = emptyDay();
  let windWeighted = 0;
  for (const d of days) {
    for (const [k, v] of Object.entries(d) as [keyof LedgerDay, number | null][]) {
      if (typeof v !== "number" || !(k in out)) continue;
      if (MAXIMA.has(k)) out[k] = out[k] === null ? v : Math.max(out[k] as number, v);
      else if (MINIMA.has(k)) out[k] = out[k] === null ? v : Math.min(out[k] as number, v);
      else if (k === "windAvgMs") windWeighted += v * (d.minutes ?? 0);
      else (out[k] as number) += v;
    }
  }
  out.windAvgMs = out.minutes > 0 ? windWeighted / out.minutes : 0;
  return out;
}

export interface BridgeStep {
  key: "without" | "heatPumps" | "storage" | "ownEnergy" | "sales" | "actual";
  label: string;
  eur: number;
  kwh: number;
  hint: string;
}

/**
 * The savings bridge: without the system (the consumption bought at the
 * slots' prices, the rooms' heat by direct electric heating) - the heat
 * pumps' COP - the heat shifted by the tanks - the own energy (PV, wind,
 * batteries) - the sales = what was really paid (the grid's cost less the
 * sales). The EUR steps sum exactly; the kWh steps - the energy each one
 * took off the grid (the sales - what went out).
 */
export function bridge(d: LedgerDay): BridgeStep[] {
  const otherEur = d.allBoughtEur - d.heatCostEur; // the consumption without the heating
  const otherKwh = d.loadKwh - d.heatElecKwh;
  const withoutEur = otherEur + d.heatDirectEur;
  const withoutKwh = otherKwh + d.deliveredHeatKwh;
  const ownKwh = Math.max(0, d.loadKwh - d.importKwh);
  return [
    { key: "without", label: "Without the system", eur: withoutEur, kwh: withoutKwh, hint: "All the consumption bought from the grid at each slot's price, the rooms' heat by direct electric heating" },
    { key: "heatPumps", label: "Heat pumps", eur: -(d.heatDirectEur - d.heatNoStorageEur), kwh: -(d.deliveredHeatKwh - d.noStorageKwh), hint: "The heat pumps give several kWh of heat per kWh of electricity (COP)" },
    { key: "storage", label: "Heat storage", eur: -(d.heatNoStorageEur - d.heatCostEur), kwh: -(d.noStorageKwh - d.heatElecKwh), hint: "The tanks let the heat pumps run when the electricity is cheaper or the weather better" },
    { key: "ownEnergy", label: "Own energy", eur: -(d.allBoughtEur - d.costEur), kwh: -ownKwh, hint: "PV, wind and the batteries covered this part of the consumption - not bought" },
    { key: "sales", label: "Sales", eur: -d.revenueEur, kwh: -d.exportKwh, hint: "The surplus sold to the grid" },
    { key: "actual", label: "Paid", eur: d.costEur - d.revenueEur, kwh: d.importKwh - d.exportKwh, hint: "The grid bill less the sales" },
  ];
}

const CONSISTENCY_SLACK_KWH = 1;
const CONSISTENCY_SLACK_SHARE = 0.03; // the sources' different clocks

/** The day's key figures. */
export function kpis(d: LedgerDay, batteryKwh: number) {
  const generation = d.pvKwh + d.windKwh;
  const without = bridge(d)[0].eur;
  const actual = d.costEur - d.revenueEur;
  return {
    savedEur: without - actual,
    savedPct: without > 0 ? ((without - actual) / without) * 100 : null,
    selfSufficiencyPct: d.loadKwh > 0 ? Math.max(0, Math.min(100, (1 - d.importKwh / d.loadKwh) * 100)) : null,
    ownUsePct: generation > 0 ? Math.max(0, Math.min(100, ((generation - d.exportKwh - d.curtailedKwh) / generation) * 100)) : null,
    batteryCycles: batteryKwh > 0 ? d.dischargeKwh / batteryKwh : null,
    avgBuyCtKwh: d.importKwh > 0 ? (d.costEur / d.importKwh) * 100 : null,
    netEur: -actual,
    // the grid can't bring more than the site used and stored - else the record is faulty (a counter counted twice)
    consistent: d.importKwh <= d.loadKwh + d.chargeKwh + CONSISTENCY_SLACK_KWH + d.loadKwh * CONSISTENCY_SLACK_SHARE,
  };
}
