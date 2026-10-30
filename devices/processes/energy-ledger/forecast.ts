/**
 * energy-ledger - the plan's forecast, pure (no I/O): the slots ahead with
 * their prices, the generation (the energy field's own models on the
 * weather forecast) and the consumption (the field's profile plus the
 * heating's electricity - proportional to how cold it is outside, the
 * factor learnt from the recorded days); the learnt corrections (L4 -
 * learning.ts) applied: the PV's and the wind's factors, the consumption's
 * by weekday and hour; the operational days' notes (notes.ts): a holiday /
 * a working weekend's profile, units in maintenance, an outage's island.
 * The heating's part - the heating planner's planned electricity of the slot
 * when there is one (2026-10-29), else the degree-hour model; each slot's
 * `heatKw` says which it took.
 */
import { loadAt, pvPower, turbinePower, windAtHub, type LoadProfile, type PvBlockSpec, type TurbineSpec } from "../energy-field/model.ts";
import { NO_CORRECTIONS, type Corrections } from "./learning.ts";
import { NO_EFFECTS, type NoteEffects } from "./notes.ts";
import type { PlanSlot } from "./plan.ts";

export interface FieldForPlan {
  pvBlocks: (PvBlockSpec & { nodeId: number })[];
  turbines: (TurbineSpec & { nodeId: number })[];
  profile: LoadProfile | null;
  disabled: Set<number>;
}

export interface PriceSlot {
  t: number;
  minutes: number;
  buyCtKwh: number | null;
  sellCtKwh: number | null;
}

/** The heating's electricity, kW, per kelvin under `baseC` outside (a degree-hour model). */
export interface HeatingModel {
  kwPerK: number;
  baseC: number;
}

const valueAt = (rows: Record<string, number | null>[], at: number, key: string): number | null => {
  const after = rows.findIndex((x) => (x.t as number) > at);
  if (after <= 0) return null;
  const a = rows[after - 1];
  const b = rows[after];
  const x = a[key];
  const y = b[key];
  if (x === null || x === undefined || y === null || y === undefined) return x ?? y ?? null;
  return x + ((y - x) * (at - (a.t as number))) / ((b.t as number) - (a.t as number));
};

const localParts = (ms: number, timeZone: string) => {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", weekday: "short", hourCycle: "h23" }).formatToParts(new Date(ms));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { hour: Number(get("hour")), minute: Number(get("hour")) * 60 + Number(get("minute")), weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday")) };
};

/**
 * The slots from now to the last priced one: each slot's middle sets its
 * weather and consumption; the first slot runs from now to its end.
 */
export function forecastSlots(
  now: number,
  prices: PriceSlot[],
  weather: Record<string, number | null>[],
  field: FieldForPlan,
  heating: HeatingModel | null,
  timeZone: string,
  corrections: Corrections = NO_CORRECTIONS,
  effects: NoteEffects = NO_EFFECTS,
  heatingPlan: Map<number, number> | null = null,
): PlanSlot[] {
  const out: PlanSlot[] = [];
  for (const p of prices) {
    const end = p.t + p.minutes * 60_000;
    if (end <= now || p.buyCtKwh === null) continue;
    const from = Math.max(p.t, now);
    const mid = (from + end) / 2;
    const radiation = valueAt(weather, mid, "radiationWm2") ?? 0;
    const temperature = valueAt(weather, mid, "temperatureC") ?? 10;
    const wind = valueAt(weather, mid, "windSpeedMs") ?? 0;
    const pvRaw = field.pvBlocks.filter((b) => !field.disabled.has(b.nodeId) && !effects.unitOff(b.nodeId, mid)).reduce((a, b) => a + pvPower(b, radiation, temperature), 0);
    const wtRaw = field.turbines.filter((t) => !field.disabled.has(t.nodeId) && !effects.unitOff(t.nodeId, mid)).reduce((a, t) => a + turbinePower(t, windAtHub(wind, t.hubHeightM)).kw, 0);
    const local = localParts(mid, timeZone);
    const weekday = effects.profileWeekday(mid, local.weekday);
    const base = field.profile ? loadAt(field.profile, local.minute, weekday) : 0;
    const heat = heatingPlan?.has(p.t) ? heatingPlan.get(p.t)! : heating ? heating.kwPerK * Math.max(0, heating.baseC - temperature) * effects.heatingFactor(mid) : 0;
    const pv = pvRaw * corrections.pvFactor;
    const wt = wtRaw * corrections.windFactor;
    const loadFix = corrections.load[`${weekday}-${local.hour}`] ?? 0;
    const batteryFactor = effects.batteryFactor(mid);
    out.push({
      t: p.t,
      end,
      hours: (end - from) / 3_600_000,
      buyCtKwh: p.buyCtKwh,
      sellCtKwh: p.sellCtKwh ?? 0,
      generationKw: pv + wt,
      pvKw: pv,
      windKw: wt,
      loadKw: Math.max(0, base + heat + loadFix),
      heatKw: heat,
      ...(effects.gridOff(mid) ? { gridOff: true } : {}),
      ...(batteryFactor < 1 ? { batteryFactor } : {}),
    });
  }
  return out;
}

/**
 * The heating's factor from the recorded days: their heating electricity
 * over their degree-hours under `baseC` (by each day's mean temperature).
 * Null - nothing to learn from yet.
 */
export function heatingModelOf(days: { heatElecKwh: number; minutes: number; tempMinC: number | null; tempMaxC: number | null }[], baseC = 18): HeatingModel | null {
  let kwh = 0;
  let degreeHours = 0;
  for (const d of days) {
    if (d.tempMinC === null || d.tempMaxC === null || d.minutes < 60) continue;
    const mean = (d.tempMinC + d.tempMaxC) / 2;
    kwh += d.heatElecKwh;
    degreeHours += Math.max(0, baseC - mean) * (d.minutes / 60);
  }
  return degreeHours > 1 ? { kwPerK: kwh / degreeHours, baseC } : null;
}
