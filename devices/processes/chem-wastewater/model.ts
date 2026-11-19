/**
 * chem-wastewater - a metal shop's chemistry and wastewater models (pure; iot AGENTS_TO_DO.md 2026-11-19, the
 * "Chemistry and wastewater" zone):
 *  - the chemical tanks (the concentrates - acid, caustic, degreaser, dye, sealing additive): each one's level, the
 *    litres dosed out of it today, the days it lasts at the recent rate, a delivery under its reorder level;
 *  - the baths' dosing: each bar's drag-out takes its bath's solution out (the concentration falls - the bath topped
 *    up with water), the dosing pump adds the concentrate below the band's bottom until its middle;
 *  - the wastewater: the rinses' overflow and the drag-outs into the collection tank, the transfer pump over its
 *    start level (down to its stop level) through the neutralization (the caustic pump below the pH band, the acid
 *    one above it), the flocculant with the flow, the settler's sludge, the filter press's cycle over its start
 *    level (its cloth's pressure drop growing per cycle, reset by a cloth change), the discharge.
 */

export interface TankSpec {
  key: string;
  name: string;
  capacityL: number;
  reorderPct: number; // a delivery due under this (a warning)
  criticalPct: number; // the dosing stops soon (a critical message)
  lotL: number; // a delivery's litres
}

export interface Tank {
  levelL: number;
  todayL: number; // dosed out today
  rateLDay: number; // the recent rate (an exponential average of the days)
}

export interface DosingSpec {
  bath: string; // the line's bath (by its name)
  tank: string; // the concentrate's tank (TankSpec.key)
  volumeL: number; // the bath's volume
  targetGl: number; // the band's middle
  bandGl: number; // its half-width
  concentrateGl: number; // the concentrate's strength
  pumpLMin: number; // the dosing pump's flow
  dragOutL: number; // one bar's drag-out
}

export interface Dosing {
  gl: number; // the bath's concentration now
  pump: boolean;
}

/** One bath over `seconds` with `bars` lifted out of it: the drag-out dilutes, the pump doses; the litres it took. */
export function dosingStep(s: DosingSpec, d: Dosing, tank: Tank, bars: number, seconds: number): number {
  // a drag-out takes the solution out, the level topped up with water - the concentration falls by its share
  d.gl *= Math.max(0, 1 - (bars * s.dragOutL) / s.volumeL);
  if (d.gl < s.targetGl - s.bandGl) d.pump = true;
  if (d.gl >= s.targetGl) d.pump = false;
  if (!d.pump || tank.levelL <= 0) {
    d.pump = d.pump && tank.levelL > 0;
    return 0;
  }
  const litres = Math.min(tank.levelL, s.pumpLMin * (seconds / 60));
  d.gl += (litres * (s.concentrateGl - d.gl)) / s.volumeL;
  tank.levelL -= litres;
  tank.todayL += litres;
  return litres;
}

/** The days the tank lasts at its recent rate (null - nothing used lately). */
export const daysLeft = (t: Tank) => (t.rateLDay > 0.01 ? t.levelL / t.rateLDay : null);

/** A new day: today's litres into the recent rate (a 7-day average), today back to 0. */
export function tankNewDay(t: Tank) {
  t.rateLDay = t.rateLDay > 0 ? t.rateLDay + (t.todayL - t.rateLDay) / 7 : t.todayL;
  t.todayL = 0;
}

/** A delivery under the reorder level (the simulation - the next morning's truck): the level up by a lot. */
export function deliver(s: TankSpec, t: Tank): boolean {
  if ((t.levelL / s.capacityL) * 100 >= s.reorderPct) return false;
  t.levelL = Math.min(s.capacityL, t.levelL + s.lotL);
  return true;
}

export interface WastewaterSpec {
  collectionL: number; // the collection tank
  startPct: number; // the transfer pump on over
  stopPct: number; // and off under
  highPct: number; // a warning over
  pumpLMin: number; // the transfer (treatment) flow
  inflowPh: number; // the raw water's pH
  neutralL: number; // the neutralization tank
  lowPh: number; // the caustic pump on below
  highPh: number; // the acid pump on above
  dosePhMin: number; // one pump's lift per minute
  sludgePerM3L: number; // the settler's sludge per m³ treated
  settlerSludgeL: number; // the settler's sludge capacity
  pressAtPct: number; // the filter press starts over this share of it
  pressMin: number; // a press cycle
  dpPerCycleBar: number; // the cloth's pressure drop growth per cycle
  dpLimitBar: number; // a cloth change due over it (a warning)
  flocMlPerM3: number; // the flocculant per m³ treated
  causticLMin: number; // the caustic pump's dose (l of NaOH 25 % per minute)
}

export interface Wastewater {
  collectionL: number;
  pump: boolean;
  ph: number;
  naoh: boolean;
  acid: boolean;
  sludgeL: number;
  press: boolean;
  pressLeftS: number;
  dpBar: number;
  pressCycles: number; // today
  treatedL: number; // today
  causticL: number; // today
  flocL: number; // today
}

/**
 * The wastewater over `seconds`: `inflowLMin` of rinse water and `dragOutL` of drag-out into the collection tank;
 * the transfer pump by its levels; the treated flow mixes the neutralization tank towards the raw pH, the pumps
 * by their band; the sludge into the settler; the press by its level. Returns the discharge's flow (l/min).
 */
export function wastewaterStep(s: WastewaterSpec, w: Wastewater, inflowLMin: number, dragOutL: number, seconds: number): number {
  const min = seconds / 60;
  w.collectionL = Math.min(s.collectionL, w.collectionL + inflowLMin * min + dragOutL);
  const pct = (w.collectionL / s.collectionL) * 100;
  if (pct >= s.startPct) w.pump = true;
  if (pct <= s.stopPct) w.pump = false;
  const moved = w.pump ? Math.min(w.collectionL, s.pumpLMin * min) : 0;
  w.collectionL -= moved;
  // the neutralization: the raw water pulls the pH towards its own, the pumps by the band (held to its middle)
  const mix = Math.min(1, moved / s.neutralL);
  w.ph += (s.inflowPh - w.ph) * mix;
  const mid = (s.lowPh + s.highPh) / 2;
  w.naoh = w.ph < s.lowPh || (w.naoh && w.ph < mid);
  w.acid = w.ph > s.highPh || (w.acid && w.ph > mid);
  w.ph = Math.min(14, Math.max(0, w.ph + ((w.naoh ? 1 : 0) - (w.acid ? 1 : 0)) * s.dosePhMin * min));
  if (w.naoh) w.causticL += s.causticLMin * min;
  // the flocculant with the flow, the sludge settling
  w.treatedL += moved;
  w.flocL += (moved / 1000) * (s.flocMlPerM3 / 1000);
  w.sludgeL = Math.min(s.settlerSludgeL, w.sludgeL + (moved / 1000) * s.sludgePerM3L);
  // the filter press: a cycle over its level empties the settler's sludge into cakes
  if (w.press) {
    w.pressLeftS -= seconds;
    if (w.pressLeftS <= 0) {
      w.press = false;
      w.pressLeftS = 0;
      w.sludgeL = 0;
      w.dpBar += s.dpPerCycleBar;
      w.pressCycles += 1;
    }
  } else if ((w.sludgeL / s.settlerSludgeL) * 100 >= s.pressAtPct) {
    w.press = true;
    w.pressLeftS = s.pressMin * 60;
  }
  return moved / Math.max(min, 1e-9);
}

/** The minutes until the collection tank is full at this inflow with the pump's flow (null - it does not fill). */
export function minutesToFull(s: WastewaterSpec, w: Wastewater, inflowLMin: number): number | null {
  const net = inflowLMin - (w.pump ? s.pumpLMin : 0);
  return net > 0.01 ? (s.collectionL - w.collectionL) / net : null;
}
