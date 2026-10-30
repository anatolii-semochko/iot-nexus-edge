/**
 * energy-ledger - the plan's optimiser, pure (no I/O): the battery array's
 * power for every slot ahead (15 minutes - the day-ahead market's), the
 * least money over the horizon - the purchases, less the sales, plus the
 * batteries' wear. Dynamic programming over the array's state of charge
 * (1 % steps): deterministic, fast (a day and a half - ~200 slots x 101
 * states x a few transitions), no external solver.
 */

export interface PlanSlot {
  t: number; // the slot's start, ms
  end: number; // its end, ms (15 minutes - or an hour from an hourly price source)
  hours: number; // its length (the first one - from now to its end)
  buyCtKwh: number;
  sellCtKwh: number;
  generationKw: number; // the forecast - PV and wind
  pvKw?: number; // its parts (the learning compares each with the actual)
  windKw?: number;
  loadKw: number; // the forecast - the site's consumption (the heating included)
  heatKw?: number; // its heating part (the heating planner's plan, else the degree-hour model)
  gridOff?: boolean; // an outage (the day's notes): no import, no export - the batteries carry the site
  batteryFactor?: number; // the batteries' power share left (units in maintenance), 1 - all
}

export interface PlanBattery {
  capacityKwh: number; // the enabled units together
  socPct: number; // now
  maxChargeKw: number;
  maxDischargeKw: number;
  efficiency: number; // one way
}

export interface PlanLimits {
  socMinPct: number; // the lowest the plan goes (the reserve included)
  socMaxPct: number;
  exportAllowed: boolean;
  gridChargeAllowed: boolean;
  maxImportKw: number | null;
  maxExportKw: number | null;
  wearCtKwh: number; // the batteries' wear per kWh discharged
  // peak shaving: the import over this limit costs `peakPenaltyCtKwh` more per kWh (a business's capacity charge)
  peakLimitKw?: number | null;
  peakPenaltyCtKwh?: number;
  // below socMinPct now (an outage used the reserve, a higher reserve just set) - each kWh missing under
  // it costs this much per hour, so the plan climbs back when that is cheaper than staying low
  belowFloorCtKwhH?: number;
  // the lowest the array may go in an outage (the field's socMinPct) - the reserve is for that
  hardMinPct?: number;
}

export interface PlannedSlot {
  t: number;
  batteryKw: number; // + discharge / - charge
  gridKw: number; // + import / - export
  curtailedKw: number;
  socPct: number; // at the slot's end
  costEur: number; // the slot's purchases - sales + wear
  baselineEur: number; // the same slot without the batteries
}

const TERMINAL_DISCOUNT = 0.85;
const DEFAULT_BELOW_FLOOR_CT = 2; // per kWh and hour under the floor
const OVER_LIMIT_EUR = 1000; // per kWh over the connection's import limit - never chosen when anything else is possible
const SHED_EUR = 10; // per kWh not supplied in an outage (the value of lost load) - over any price, under the limit's

/** One slot's money and grid at a given battery power. */
export function slotMoney(s: PlanSlot, batteryKw: number, l: PlanLimits) {
  const net = s.loadKw - s.generationKw - batteryKw; // + import
  if (s.gridOff) {
    // an outage: what the site lacks is shed, a surplus held back; the batteries' wear as always
    const wear = batteryKw > 0 ? (batteryKw * s.hours * l.wearCtKwh) / 100 : 0;
    return net > 0 ? { eur: net * s.hours * SHED_EUR + wear, grid: 0, curtailed: 0 } : { eur: wear, grid: 0, curtailed: -net };
  }
  let grid = net;
  let curtailed = 0;
  let eur = 0;
  if (net > 0) {
    eur += (net * s.hours * s.buyCtKwh) / 100;
    if (l.maxImportKw !== null && net > l.maxImportKw) eur += (net - l.maxImportKw) * s.hours * OVER_LIMIT_EUR;
    if (l.peakLimitKw != null && net > l.peakLimitKw) eur += ((net - l.peakLimitKw) * s.hours * (l.peakPenaltyCtKwh ?? 0)) / 100;
  } else {
    // a negative sale price - exporting would cost: the generation is held back instead
    const maxExport = l.exportAllowed && s.sellCtKwh >= 0 ? (l.maxExportKw ?? Infinity) : 0;
    const exported = Math.min(-net, maxExport);
    curtailed = -net - exported;
    grid = -exported;
    eur -= (exported * s.hours * s.sellCtKwh) / 100;
  }
  if (batteryKw > 0) eur += (batteryKw * s.hours * l.wearCtKwh) / 100;
  return { eur, grid, curtailed };
}

/**
 * The plan: for each slot the array's power, the grid, the SoC at its end,
 * the money - and the same slot's money without the batteries. The energy
 * left at the horizon's end is valued at the horizon's median purchase
 * price through the inverter, less the wear, discounted (else the plan would
 * empty the array just before the end - or hoard it).
 */
export function optimise(slots: PlanSlot[], b: PlanBattery, l: PlanLimits): PlannedSlot[] {
  if (!slots.length) return [];
  const STEPS = 100;
  // the array below the plan's floor now - the hard floor is where it is (never lower), the band's floor
  // a soft one (belowFloorCtKwhH per missing kWh and hour)
  const floor = Math.max(0, Math.ceil(l.socMinPct));
  // an outage ahead (the day's notes) - the array may go down to the hard minimum in it (the reserve is for
  // that), never under the floor before it, back up softly after it
  const firstOff = slots.findIndex((s) => s.gridOff);
  const hardMin = firstOff >= 0 ? Math.max(0, Math.min(floor, Math.ceil(l.hardMinPct ?? floor))) : floor;
  const lo = Math.min(hardMin, Math.max(0, Math.round(b.socPct)));
  const belowEurPerKwhH = (l.belowFloorCtKwhH ?? DEFAULT_BELOW_FLOOR_CT) / 100;
  const hi = Math.min(STEPS, Math.floor(l.socMaxPct));
  const perStep = b.capacityKwh / STEPS; // kWh in the cells per 1 %
  const start = Math.max(lo, Math.min(hi, Math.round(b.socPct)));
  const n = slots.length;
  const buys = slots.map((s) => s.buyCtKwh).sort((a, c) => a - c);
  // EUR per kWh left in the cells at the end: what it would save later (the median price, out through the
  // inverter, less the wear) - discounted for the uncertain future, so the plan uses its energy rather than hoards it
  const terminal = Math.max(0, ((buys[Math.floor(buys.length / 2)] * b.efficiency - l.wearCtKwh) / 100) * TERMINAL_DISCOUNT);

  // value[i][soc] - the least money from slot i on, starting it at soc
  const value: Float64Array[] = Array.from({ length: n + 1 }, () => new Float64Array(STEPS + 1).fill(Infinity));
  const choice: Int16Array[] = Array.from({ length: n }, () => new Int16Array(STEPS + 1));
  for (let soc = lo; soc <= hi; soc++) value[n][soc] = -soc * perStep * terminal;
  for (let i = n - 1; i >= 0; i--) {
    const s = slots[i];
    const share = s.batteryFactor ?? 1;
    const maxUp = Math.floor((b.maxChargeKw * share * s.hours * b.efficiency) / perStep);
    const maxDown = Math.floor((b.maxDischargeKw * share * s.hours) / b.efficiency / perStep);
    // charging from the grid not allowed (or no grid) - only the forecast surplus may go in
    const surplusUp = Math.floor((Math.max(0, s.generationKw - s.loadKw) * s.hours * b.efficiency) / perStep);
    const up = l.gridChargeAllowed && !s.gridOff ? maxUp : Math.min(maxUp, surplusUp);
    for (let soc = lo; soc <= hi; soc++) {
      let best = Infinity;
      let bestNext = soc;
      for (let next = Math.max(lo, soc - maxDown); next <= Math.min(hi, soc + up); next++) {
        const stored = (next - soc) * perStep; // + into the cells
        const kw = stored >= 0 ? -(stored / b.efficiency) / s.hours : (-stored * b.efficiency) / s.hours;
        // under the floor: never before an outage (from above it), free in one, soft otherwise
        if (next < floor && next < soc && firstOff >= 0 && i < firstOff) continue;
        const short = next < floor && !s.gridOff ? (floor - next) * perStep * s.hours * belowEurPerKwhH : 0;
        const total = slotMoney(s, kw, l).eur + short + value[i + 1][next];
        if (total < best - 1e-9) {
          best = total;
          bestNext = next;
        }
      }
      value[i][soc] = best;
      choice[i][soc] = bestNext;
    }
  }

  const out: PlannedSlot[] = [];
  let soc = start;
  for (let i = 0; i < n; i++) {
    const s = slots[i];
    const next = choice[i][soc];
    const stored = (next - soc) * perStep;
    const kw = stored >= 0 ? -(stored / b.efficiency) / s.hours : (-stored * b.efficiency) / s.hours;
    const m = slotMoney(s, kw, l);
    out.push({
      t: s.t,
      batteryKw: kw,
      gridKw: m.grid,
      curtailedKw: m.curtailed,
      socPct: next,
      costEur: m.eur,
      baselineEur: slotMoney(s, 0, l).eur,
    });
    soc = next;
  }
  return out;
}

const MERGE_HOLD_MS = 30 * 60_000;

/** The plan's steps for people: where the battery's direction changes - "charge 14:00-16:30 at 40 kW (cheap / sunny)". */
export function planSteps(plan: PlannedSlot[], slots: PlanSlot[]) {
  const kind = (kw: number) => (kw < -0.5 ? "charge" : kw > 0.5 ? "discharge" : "hold");
  const steps: { from: number; to: number; action: string; avgKw: number; avgBuyCtKwh: number; savingEur: number }[] = [];
  plan.forEach((p, i) => {
    const s = slots[i];
    const a = kind(p.batteryKw);
    const last = steps[steps.length - 1];
    const end = s.end;
    if (last && last.action === a) {
      const k = (last.to - last.from) / 3_600_000;
      last.avgKw = (last.avgKw * k + p.batteryKw * s.hours) / (k + s.hours);
      last.avgBuyCtKwh = (last.avgBuyCtKwh * k + s.buyCtKwh * s.hours) / (k + s.hours);
      last.to = end;
      last.savingEur += p.baselineEur - p.costEur;
    } else steps.push({ from: s.t, to: end, action: a, avgKw: p.batteryKw, avgBuyCtKwh: s.buyCtKwh, savingEur: p.baselineEur - p.costEur });
  });
  // a short pause between two runs of the same action is part of it - "charge 03:45-05:30", not three pieces
  const merged: typeof steps = [];
  for (const step of steps) {
    const prev = merged[merged.length - 1];
    const before = merged[merged.length - 2];
    if (prev?.action === "hold" && before && before.action === step.action && prev.to - prev.from <= MERGE_HOLD_MS) {
      const hours = (x: { from: number; to: number }) => (x.to - x.from) / 3_600_000;
      const all = hours(before) + hours(prev) + hours(step);
      before.avgKw = (before.avgKw * hours(before) + step.avgKw * hours(step)) / all;
      before.avgBuyCtKwh = (before.avgBuyCtKwh * hours(before) + prev.avgBuyCtKwh * hours(prev) + step.avgBuyCtKwh * hours(step)) / all;
      before.savingEur += prev.savingEur + step.savingEur;
      before.to = step.to;
      merged.pop();
    } else merged.push(step);
  }
  return merged;
}
