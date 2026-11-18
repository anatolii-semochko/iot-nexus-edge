/**
 * drying-oven - the oven's models (pure; the metal shop, iot AGENTS_TO_DO.md 2026-11-18, step 4):
 *  - the chamber's heat balance: its heaters, its losses through the walls, the door opened for a load (a
 *    burst of the hot air out), the cold parts taking their heat;
 *  - the batches: the line's finished bars queue at the oven, `capacity` of them dry together; a batch's
 *    drying time counts only while the chamber is within `readyBelowK` of its set point.
 */

export interface OvenSpec {
  setpointC: number;
  tolC: number;
  heaterKw: number;
  capacityKwhK: number; // the chamber with its racks
  lossKwK: number;
  doorLossKwh: number; // one load - the door open, the hot air out
  partsKwh: number; // one bar's parts warmed to the set point (aluminium)
  dryMin: number;
  capacity: number; // batches drying at once
  readyBelowK: number; // the drying counts from set - this
  ambientC: number;
}

export interface Batch {
  id: string;
  dryS: number; // the drying counted so far
  inSince: number;
}

export interface Oven {
  tempC: number;
  heating: boolean;
  drying: Batch[];
  queue: string[];
}

/** The heater by the band: on below set - tol / 2, off above set + tol / 2, held between. */
export const heaterOn = (s: OvenSpec, tempC: number, was: boolean) =>
  tempC < s.setpointC - s.tolC / 2 || (was && tempC < s.setpointC + s.tolC / 2);

/** The chamber's temperature after `hours` (`extraKwh` - the door and the cold parts this step). */
export function ovenStep(s: OvenSpec, tempC: number, hours: number, heating: boolean, extraKwh: number): number {
  const netKwh = ((heating ? s.heaterKw : 0) - s.lossKwK * (tempC - s.ambientC)) * hours - extraKwh;
  return Math.max(s.ambientC, tempC + netKwh / s.capacityKwhK);
}

/**
 * The oven over `seconds`: the queue loaded while there is room (each load - the door's and the parts' heat),
 * the drying counted while hot, the dried batches out. Returns the dried ones.
 */
export function ovenTick(s: OvenSpec, o: Oven, now: number, seconds: number): Batch[] {
  let extraKwh = 0;
  while (o.queue.length && o.drying.length < s.capacity) {
    o.drying.push({ id: o.queue.shift()!, dryS: 0, inSince: now });
    extraKwh += s.doorLossKwh + s.partsKwh;
  }
  o.heating = heaterOn(s, o.tempC, o.heating);
  o.tempC = ovenStep(s, o.tempC, seconds / 3600, o.heating, extraKwh);
  if (o.tempC >= s.setpointC - s.readyBelowK) for (const b of o.drying) b.dryS += seconds;
  const done = o.drying.filter((b) => b.dryS >= s.dryMin * 60);
  if (done.length) {
    o.drying = o.drying.filter((b) => b.dryS < s.dryMin * 60);
    // the door opened to take them out
    o.tempC = ovenStep(s, o.tempC, 0, false, s.doorLossKwh);
  }
  return done;
}
