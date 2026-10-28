/**
 * The Energy Field's models - pure functions (process.ts runs them; tests
 * call them directly): what a PV block, a wind turbine and the site's
 * consumption make of the weather and the time, and how the battery array
 * is dispatched (the rules of the modes - the coming energy-ledger planner
 * will set the targets the Auto mode follows).
 *
 * Sign conventions: generation and consumption >= 0 kW; the battery array
 * `batteryKw` + discharge (to the site) / - charge; the grid `gridKw` +
 * import / - export (the grid meter's own convention, energy-grid).
 */

// --- PV ----------------------------------------------------------------------

export interface PvBlockSpec {
  kWp: number; // the block's modules
  acKw: number; // its inverter's AC rating (SMA STP 10.0 - 10)
  // the block's yield relative to an ideal field (orientation, shading, a roof) - 1 by default
  yieldFactor?: number;
}

// performance ratio (wiring, mismatch, soiling, inverter) and the modules'
// power temperature coefficient (crystalline silicon)
const PV_PR = 0.86;
const PV_TEMP_COEFF = -0.004; // per C over 25 C
// the cells warm over the air with the sun (NOCT-like: +25 C at 800 W/m2)
const cellTemperature = (airC: number, radiationWm2: number) => airC + (radiationWm2 / 800) * 25;

/** A PV block's AC power, kW, from the solar radiation on the plane (W/m2) and the air temperature. */
export function pvPower(spec: PvBlockSpec, radiationWm2: number, airC: number): number {
  if (radiationWm2 <= 0) return 0;
  const dc = spec.kWp * (radiationWm2 / 1000) * PV_PR * (1 + PV_TEMP_COEFF * (cellTemperature(airC, radiationWm2) - 25)) * (spec.yieldFactor ?? 1);
  return Math.max(0, Math.min(spec.acKw, dc * 0.98));
}

// --- wind --------------------------------------------------------------------

export interface TurbineSpec {
  ratedKw: number;
  cutInMs: number;
  ratedMs: number; // the wind at which it reaches the rated power
  cutOutMs: number; // above it - braked (storm protection)
  ratedRpm: number;
  hubHeightM: number;
}

// wind shear - the power law with the open-terrain exponent; the forecast's
// wind is at 10 m
const SHEAR_EXPONENT = 0.2;
export const windAtHub = (wind10m: number, hubHeightM: number) => wind10m * Math.pow(hubHeightM / 10, SHEAR_EXPONENT);

/** A turbine's power (kW), rotor speed (rpm) and state at a wind speed at its hub. */
export function turbinePower(spec: TurbineSpec, windMs: number): { kw: number; rpm: number; state: "idle" | "running" | "storm" } {
  if (windMs >= spec.cutOutMs) return { kw: 0, rpm: 0, state: "storm" };
  if (windMs < spec.cutInMs) return { kw: 0, rpm: windMs > 0.5 ? (spec.ratedRpm * windMs) / spec.ratedMs / 3 : 0, state: "idle" };
  const share = windMs >= spec.ratedMs ? 1 : (windMs ** 3 - spec.cutInMs ** 3) / (spec.ratedMs ** 3 - spec.cutInMs ** 3);
  return { kw: spec.ratedKw * share, rpm: spec.ratedRpm * Math.min(1, windMs / spec.ratedMs), state: "running" };
}

// --- consumption -------------------------------------------------------------

export interface LoadProfile {
  baseKw: number; // nights, closed days
  weekdayPeakKw: number; // working hours on a working day
  weekendPeakKw: number; // daytime on a weekend
  workFrom: string; // "HH:MM"
  workTo: string;
}

const minuteOf = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
};

/** The site's consumption, kW, at a local minute of the day on a weekday (0 Sunday .. 6 Saturday). */
export function loadAt(p: LoadProfile, minuteOfDay: number, weekday: number): number {
  const weekend = weekday === 0 || weekday === 6;
  const from = minuteOf(p.workFrom);
  const to = minuteOf(p.workTo);
  const peak = weekend ? p.weekendPeakKw : p.weekdayPeakKw;
  // an hour's ramp at each end; a dip at lunch on working days
  const ramp = 60;
  let share = 0;
  if (minuteOfDay >= from - ramp && minuteOfDay < from) share = (minuteOfDay - (from - ramp)) / ramp;
  else if (minuteOfDay >= from && minuteOfDay < to) share = 1;
  else if (minuteOfDay >= to && minuteOfDay < to + ramp) share = 1 - (minuteOfDay - to) / ramp;
  if (!weekend && minuteOfDay >= 12 * 60 && minuteOfDay < 13 * 60) share *= 0.8;
  return p.baseKw + (peak - p.baseKw) * share;
}

// --- dispatch ----------------------------------------------------------------

export interface BatteryState {
  capacityKwh: number;
  socPct: number;
  maxChargeKw: number;
  maxDischargeKw: number;
  enabled: boolean;
}

export interface Strategy {
  mode: "auto" | "manual" | "island";
  socMinPct: number; // never below (the cells' protection)
  socMaxPct: number; // never above
  reservePct: number; // kept for a grid outage - Auto discharges only above it
  exportAllowed: boolean;
  gridChargeAllowed: boolean; // Auto charges from the grid when the price is cheap
  manualBatteryKw: number; // Manual: + discharge / - charge
  maxImportKw: number | null;
  maxExportKw: number | null;
}

export interface Prices {
  buyNow: number | null;
  sellNow: number | null;
  // the buy price's place among the next 24 h: 0 the cheapest .. 1 the dearest
  rankNow: number | null;
}

// Auto: the cheapest / dearest quarter of the day ahead
const CHEAP_RANK = 0.25;
const DEAR_RANK = 0.75;

export interface Dispatch {
  batteryKw: number; // + discharge / - charge, the whole array
  gridKw: number; // + import / - export
  curtailedKw: number; // generation held back (no room, no export)
  shedKw: number; // consumption not covered (island)
  decision: string; // why - for people and the AI
}

/** The array's energy-limited power over `hours`: what it can still give / take within its SoC bounds. */
function arrayLimits(batteries: BatteryState[], s: Strategy, floorPct: number, hours: number) {
  let discharge = 0;
  let charge = 0;
  for (const b of batteries) {
    if (!b.enabled) continue;
    discharge += Math.max(0, Math.min(b.maxDischargeKw, ((b.socPct - floorPct) / 100) * b.capacityKwh / hours));
    charge += Math.max(0, Math.min(b.maxChargeKw, ((s.socMaxPct - b.socPct) / 100) * b.capacityKwh / hours));
  }
  return { discharge, charge };
}

/**
 * The array's power and the grid's for the next interval: generation and
 * consumption (kW), the batteries, the strategy, the prices; `hours` - the
 * interval (the SoC bounds hold over it); `planKw` - Auto follows the
 * Energy Ledger's plan for the slot now (null - the rules on the prices);
 * `planFloorPct` - the plan's floor for that slot (the ledger's reserve, an
 * outage's - lower: the reserve is for it), never under `socMinPct`.
 */
export function dispatch(generationKw: number, loadKw: number, batteries: BatteryState[], s: Strategy, prices: Prices, hours: number, planKw: number | null = null, planFloorPct: number | null = null): Dispatch {
  const surplus = generationKw - loadKw;
  const lim = arrayLimits(batteries, s, s.socMinPct, hours);
  const floor = planKw !== null && planFloorPct !== null ? Math.max(s.socMinPct, planFloorPct) : Math.max(s.socMinPct, s.reservePct);
  const aboveReserve = arrayLimits(batteries, s, floor, hours).discharge;
  let battery = 0;
  let decision: string;

  if (s.mode === "island") {
    // no grid: the batteries balance everything they can
    battery = surplus >= 0 ? -Math.min(surplus, lim.charge) : Math.min(-surplus, lim.discharge);
    const rest = surplus + battery; // > 0 - curtailed, < 0 - shed
    return {
      batteryKw: battery,
      gridKw: 0,
      curtailedKw: Math.max(0, rest),
      shedKw: Math.max(0, -rest),
      decision: rest < -0.01 ? "Island: the batteries can't cover the consumption - load shed" : "Island: generation and batteries cover the site",
    };
  }

  if (s.mode === "manual") {
    battery = s.manualBatteryKw >= 0 ? Math.min(s.manualBatteryKw, lim.discharge) : -Math.min(-s.manualBatteryKw, lim.charge);
    decision = `Manual: ${battery >= 0 ? "discharge" : "charge"} ${Math.abs(battery).toFixed(1)} kW`;
  } else if (planKw !== null) {
    // Auto on the Energy Ledger's plan: its slot's power, within what the array can do (discharge above the plan's floor)
    battery = planKw >= 0 ? Math.min(planKw, aboveReserve) : -Math.min(-planKw, lim.charge);
    decision =
      Math.abs(battery) < 0.05
        ? "Plan: holding the batteries"
        : `Plan: ${battery > 0 ? "discharging" : "charging"} ${Math.abs(battery).toFixed(1)} kW`;
  } else {
    const cheap = prices.rankNow !== null && prices.rankNow <= CHEAP_RANK;
    const dear = prices.rankNow !== null && prices.rankNow >= DEAR_RANK;
    if (surplus >= 0) {
      // own generation first into the batteries; the rest sold
      battery = -Math.min(surplus, lim.charge);
      decision = battery < -0.01 ? "Storing the surplus" : "Batteries full - the surplus goes to the grid";
      if (dear && s.exportAllowed && prices.sellNow !== null && prices.sellNow > 0) {
        // a dear hour: sell the surplus now, and the stored energy above the reserve too
        battery = Math.min(aboveReserve, lim.discharge);
        decision = "Dear hour - selling the surplus and the stored energy above the reserve";
      }
    } else if (cheap) {
      // a cheap hour: buy for the site, keep the stored energy; charge from the grid if allowed
      battery = s.gridChargeAllowed ? -lim.charge : 0;
      decision = s.gridChargeAllowed && lim.charge > 0.01 ? "Cheap hour - charging from the grid" : "Cheap hour - buying for the site, keeping the batteries";
    } else {
      // cover the deficit from the batteries above the reserve
      battery = Math.min(-surplus, aboveReserve);
      if (dear && s.exportAllowed && prices.sellNow !== null && prices.sellNow > 0) {
        battery = aboveReserve;
        decision = "Dear hour - covering the site from the batteries and selling the rest";
      } else decision = battery > 0.01 ? "Covering the site from the batteries" : "Batteries at the reserve - buying from the grid";
    }
  }

  // the grid takes the rest - within the connection's limits and the export permission
  let grid = loadKw - generationKw - battery;
  let curtailed = 0;
  const maxExport = s.exportAllowed ? (s.maxExportKw ?? Infinity) : 0;
  if (grid < -maxExport) {
    // too much out: less discharge, then more charge, then the generation held back
    let over = -maxExport - grid;
    const lessDischarge = Math.min(over, Math.max(0, battery));
    battery -= lessDischarge;
    over -= lessDischarge;
    const moreCharge = Math.min(over, Math.max(0, lim.charge - Math.max(0, -battery)));
    battery -= moreCharge;
    over -= moreCharge;
    curtailed = over;
    grid = -maxExport;
  }
  if (s.maxImportKw !== null && grid > s.maxImportKw) {
    // too much in: more from the batteries
    const more = Math.min(grid - s.maxImportKw, lim.discharge - Math.max(0, battery));
    if (more > 0) {
      battery += more;
      grid -= more;
    }
  }
  return { batteryKw: battery, gridKw: grid, curtailedKw: curtailed, shedKw: 0, decision };
}

/** Splits the array's power between its enabled batteries - by their headroom in that direction. */
export function splitBattery(batteries: BatteryState[], arrayKw: number, s: Strategy, hours: number): number[] {
  const room = batteries.map((b) =>
    !b.enabled
      ? 0
      : arrayKw >= 0
        ? Math.max(0, Math.min(b.maxDischargeKw, ((b.socPct - s.socMinPct) / 100) * b.capacityKwh / hours))
        : Math.max(0, Math.min(b.maxChargeKw, ((s.socMaxPct - b.socPct) / 100) * b.capacityKwh / hours)),
  );
  const total = room.reduce((a, b) => a + b, 0);
  return room.map((r) => (total > 0 ? (arrayKw * r) / total : 0));
}

/** A battery's SoC after `hours` at `kw` (+ discharge / - charge) with its one-way efficiency. */
export function nextSoc(b: BatteryState, kw: number, hours: number, efficiency = 0.97): number {
  const kwh = kw >= 0 ? (kw * hours) / efficiency : kw * hours * efficiency;
  return Math.max(0, Math.min(100, b.socPct - (kwh / b.capacityKwh) * 100));
}
