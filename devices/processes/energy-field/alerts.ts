/**
 * energy-field - the critical states of the flows (iot AGENTS_TO_DO.md 2026-10-25), pure: what the scene
 * shows red - beyond the three colours of the flows (orange - against us, green - for us, grey - none):
 * - the grid: the import over the connection's limit, over the Energy Ledger's peak limit (a business's
 *   capacity charge), or well over what the plan expected for the slot now;
 * - the consumption well over what the plan expected;
 * - a unit over its rating (the model's): a PV inverter over its AC power, a turbine over its rated power,
 *   a battery's power over its recommended charge / discharge.
 * Each - the reason in words (the scene's tooltip, the AI) and its level (the user, 2026-10-25: red - an
 * error): critical (red) - the connection's limit, the peak limit, a unit over its rating; warning (yellow)
 * - well over what the plan expected.
 */

export interface AlertConfig {
  overPlanPct: number; // the import / the consumption counts as over the plan beyond this share of it...
  overPlanMinKw: number; // ...and beyond this many kW (small figures don't alarm)
  overRatedPct: number; // a unit over its rating beyond this share (the measurement's noise below)
}

export const ALERT_DEFAULTS: AlertConfig = { overPlanPct: 30, overPlanMinKw: 20, overRatedPct: 2 };

export interface Alert {
  level: "warning" | "critical";
  text: string;
}

export interface FieldAlerts {
  grid: Alert | null;
  load: Alert | null;
  units: Record<string, string>; // nodeId -> why (critical)
}

const over = (actual: number, expected: number, c: AlertConfig) => actual - expected > Math.max(c.overPlanMinKw, (expected * c.overPlanPct) / 100);
const kw = (x: number) => `${x.toFixed(x < 100 ? 1 : 0)} kW`;

export function alertsOf(input: {
  gridKw: number; // + import
  loadKw: number;
  plan: { gridKw?: number | null; loadKw?: number | null } | null; // the ledger's slot now
  maxImportKw: number | null;
  peakLimitKw: number | null;
  pv: { nodeId: number; kw: number; acKw: number }[];
  wind: { nodeId: number; kw: number; ratedKw: number }[];
  batteries: { nodeId: number; kw: number; maxChargeKw: number; maxDischargeKw: number }[];
  config?: Partial<AlertConfig>;
}): FieldAlerts {
  const c = { ...ALERT_DEFAULTS, ...(input.config ?? {}) };
  const rated = (value: number, limit: number) => limit > 0 && value > limit * (1 + c.overRatedPct / 100);
  let grid: Alert | null = null;
  const imp = input.gridKw;
  if (imp > 0 && input.maxImportKw !== null && imp >= input.maxImportKw) grid = { level: "critical", text: `The import ${kw(imp)} at the connection's limit ${kw(input.maxImportKw)}` };
  else if (imp > 0 && input.peakLimitKw !== null && imp > input.peakLimitKw) grid = { level: "critical", text: `The import ${kw(imp)} over the peak limit ${kw(input.peakLimitKw)}` };
  else if (imp > 0 && Number.isFinite(input.plan?.gridKw) && over(imp, Math.max(0, input.plan!.gridKw as number), c))
    grid = { level: "warning", text: `The import ${kw(imp)} - the plan expected ${kw(Math.max(0, input.plan!.gridKw as number))}` };
  const load: Alert | null =
    Number.isFinite(input.plan?.loadKw) && over(input.loadKw, input.plan!.loadKw as number, c)
      ? { level: "warning", text: `The consumption ${kw(input.loadKw)} - the plan expected ${kw(input.plan!.loadKw as number)}` }
      : null;
  const units: Record<string, string> = {};
  for (const p of input.pv) if (rated(p.kw, p.acKw)) units[p.nodeId] = `${kw(p.kw)} over the inverter's ${kw(p.acKw)}`;
  for (const t of input.wind) if (rated(t.kw, t.ratedKw)) units[t.nodeId] = `${kw(t.kw)} over the rated ${kw(t.ratedKw)}`;
  for (const b of input.batteries) {
    const limit = b.kw < 0 ? b.maxChargeKw : b.maxDischargeKw;
    if (rated(Math.abs(b.kw), limit)) units[b.nodeId] = `${kw(Math.abs(b.kw))} ${b.kw < 0 ? "charge" : "discharge"} over the recommended ${kw(limit)}`;
  }
  return { grid, load, units };
}
