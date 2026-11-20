/**
 * anodizing-line - the line's models (pure; the metal shop, iot AGENTS_TO_DO.md 2026-11-18, step 3):
 *  - a bath's heat balance: its heater, its cooling coil (the chiller), the losses of an open surface (a
 *    hot bath evaporates), the anodize current's heat;
 *  - a bath's level: evaporation, the drag-out of every bar lifted out, the automatic top-up;
 *  - the anodic coating: its growth from the current density and the time (sulfuric acid anodizing - the
 *    rule of thumb "about 0.3 µm per A·min/dm²"), the bath's voltage from the density and the temperature;
 *  - the hoist and the bars: the bars run through the recipe one bath after another, one bar a bath; the
 *    hoist carries the bar that has waited longest for its next bath (its time there done, the next bath
 *    free), loads a new one when the first bath is free and the load interval is over, unloads the
 *    finished ones; its travel and its lift take their time.
 */

export type BathRole = "degrease" | "etch" | "desmut" | "anodize" | "dye" | "seal" | "rinse";

export interface BathSpec {
  nodeId: number;
  name: string;
  role: BathRole;
  volumeL: number;
  setpointC: number | null; // null - not held (a rinse)
  tolC: number; // the thermostat's band - on below set - tol / 2, off above set + tol / 2
  heaterKw: number;
  coolerKw: number; // 0 - no cooling coil
}

export interface RecipeStep {
  bath: number; // the bath's index in the line
  minutes: number;
}

export interface LineSpec {
  baths: BathSpec[];
  recipe: RecipeStep[];
  pitchMm: number; // the distance between two stations (the load station, the baths, the unload station)
  speedMmS: number; // the hoist's travel speed
  liftS: number; // a lift up or down
  dripS: number; // a bar drips over the bath it left
  leadS: number; // the hoist stands over a bar's bath this long before its time there ends (when free)
  loadEveryMin: number; // a new bar no more often than this
  barAreaDm2: number; // the parts' surface of one bar
  partsPerBar: number;
  densityAdm2: number; // the anodize current density
  ambientC: number;
}

/** A bath's heat capacity, kWh/K (water). */
export const capacityKwhK = (volumeL: number) => (volumeL * 4.186) / 3600;

/** A bath's losses to the room, kW/K: the walls, plus the open surface - more for a hot (evaporating) bath. */
export const lossKwK = (b: BathSpec, tempC: number) => 0.012 + (b.volumeL / 1000) * 0.02 + (tempC > 50 ? 0.04 : 0);

/** The thermostat: the heater and the cooler by the bath's set point and band (held last state in the band). */
// the electricity's price now for the baths' heat (2026-11-20, the factory's energy): "cheap" - the bath stores heat
// (a cooled one - cold) up to its band's edge, "dear" - it rides its band's other edge, "normal" - as set
export type PriceMode = "cheap" | "normal" | "dear";

/** The price's mode from its rank among the day's prices (0 - the cheapest, 1 - the dearest; null - none known). */
export const priceMode = (rank: number | null, cheapRank = 0.3, dearRank = 0.7): PriceMode =>
  rank === null ? "normal" : rank <= cheapRank ? "cheap" : rank >= dearRank ? "dear" : "normal";

/**
 * The thermostat: the heater on under the band's bottom, off at the set point (held last state in between); the
 * cooler the other way. By the price (`mode`) the same band is used differently - never left: cheap - heated to
 * its top (cooled to its bottom), the heat stored; dear - held just over its bottom (under its top), the heater
 * (the cooler) on as little as the band allows.
 */
export function thermostat(b: BathSpec, tempC: number, was: { heating: boolean; cooling: boolean }, mode: PriceMode = "normal") {
  if (b.setpointC === null) return { heating: false, cooling: false };
  const lo = b.setpointC - b.tolC / 2;
  const hi = b.setpointC + b.tolC / 2;
  const edge = b.tolC * 0.15;
  const [hOn, hOff] = mode === "cheap" ? [b.setpointC, hi] : mode === "dear" ? [lo, lo + edge] : [lo, b.setpointC];
  const [cOn, cOff] = mode === "cheap" ? [b.setpointC, lo] : mode === "dear" ? [hi, hi - edge] : [hi, b.setpointC];
  const heating = b.heaterKw > 0 && (tempC < hOn || (was.heating && tempC < hOff));
  const cooling = b.coolerKw > 0 && (tempC > cOn || (was.cooling && tempC > cOff));
  return { heating, cooling };
}

/** A bath's temperature after `hours`: heater + current's heat - cooler - losses, over its capacity. */
export function bathStep(b: BathSpec, tempC: number, hours: number, heating: boolean, cooling: boolean, jouleKw: number, ambientC: number): number {
  const netKw = (heating ? b.heaterKw : 0) + jouleKw - (cooling ? b.coolerKw : 0) - lossKwK(b, tempC) * (tempC - ambientC);
  return tempC + (netKw * hours) / capacityKwhK(b.volumeL);
}

/** The level after `hours`: evaporation (hot baths), the drag-out of `barsOut` bars; topped up under 85 %. */
export function levelStep(b: BathSpec, levelPct: number, tempC: number, hours: number, barsOut: number): number {
  const evap = tempC > 50 ? 0.25 * hours : 0.02 * hours;
  const next = levelPct - evap - barsOut * 0.08;
  return next < 85 ? 95 : next;
}

/** The coating's growth in µm over `minutes` at the current density (A/dm²). */
export const coatingUm = (densityAdm2: number, minutes: number) => (densityAdm2 * minutes) / 3.3;

/** The anodize bath's voltage: grows with the density, the colder the bath the higher. */
export const anodizeVolts = (densityAdm2: number, tempC: number) => (densityAdm2 > 0 ? 11 + 2.4 * densityAdm2 + Math.max(0, 20 - tempC) * 0.25 : 0);

// ---- the hoist and the bars ----------------------------------------------------------------------------

export interface Bar {
  id: string;
  step: number; // the recipe's step it is in (or waiting after, once its time there is done)
  inSince: number; // ms - when it went into its bath
  coatingUm: number;
  ah: number; // the charge it took in the anodize bath
}

// "wait" - over the bar's bath, the bar's time there not done yet (it came `leadS` ahead)
export type HoistState = "idle" | "to-pick" | "wait" | "lift-up" | "carry" | "drip" | "lift-down";

export interface Hoist {
  posMm: number;
  state: HoistState;
  // the move: the bar (null - a new one from the load station), from / to stations, the time left in the phase
  move: { bar: string | null; from: number; to: number } | null;
  phaseLeftS: number;
  carrying: string | null;
}

export interface Line {
  bars: Bar[];
  hoist: Hoist;
  lastLoad: number;
  serial: number;
  done: { bars: number; parts: number };
}

/** The station of a bath (0 - the load station, 1..n - the baths, n + 1 - the unload station). */
export const stationOf = (bathIndex: number) => bathIndex + 1;

export const emptyLine = (): Line => ({
  bars: [],
  hoist: { posMm: 0, state: "idle", move: null, phaseLeftS: 0, carrying: null },
  lastLoad: 0,
  serial: 0,
  done: { bars: 0, parts: 0 },
});

/** The bar's bath now (the station), or null while it is carried. */
const stationOfBar = (spec: LineSpec, b: Bar) => stationOf(spec.recipe[b.step].bath);

/** When the bar's time in its bath ends (ms). */
export const doneAt = (spec: LineSpec, b: Bar) => b.inSince + spec.recipe[b.step].minutes * 60_000;

/**
 * The next move: the bar waiting longest whose next station is free - or the one due soonest, if the hoist
 * gets to it no earlier than `leadS` before its time ends (it comes ahead and waits over the bath); else a new
 * bar into the first bath.
 */
export function nextMove(spec: LineSpec, line: Line, now: number): Hoist["move"] {
  const occupied = new Set(line.bars.filter((b) => b.id !== line.hoist.carrying).map((b) => stationOfBar(spec, b)));
  const unload = spec.baths.length + 1;
  const ahead = (b: Bar) => (travelS(spec, line.hoist.posMm, stationOfBar(spec, b) * spec.pitchMm) + spec.leadS) * 1000;
  const waiting = line.bars
    .filter((b) => b.id !== line.hoist.carrying)
    .map((b) => ({ b, overMs: now - doneAt(spec, b) }))
    .filter((x) => x.overMs >= -ahead(x.b))
    .sort((a, z) => z.overMs - a.overMs);
  for (const { b } of waiting) {
    const from = stationOfBar(spec, b);
    const to = b.step + 1 < spec.recipe.length ? stationOf(spec.recipe[b.step + 1].bath) : unload;
    if (to === unload || !occupied.has(to)) return { bar: b.id, from, to };
  }
  const first = stationOf(spec.recipe[0].bath);
  if (!occupied.has(first) && now - line.lastLoad >= spec.loadEveryMin * 60_000) return { bar: null, from: 0, to: first };
  return null;
}

const travelS = (spec: LineSpec, fromMm: number, toMm: number) => Math.abs(toMm - fromMm) / spec.speedMmS;

/**
 * The line over `seconds`: the hoist runs its phases (to the bar, the lift up, the drip, the carry, the lift
 * down), a bar lowered into its bath starts its time there; `onBarOut(station)` - a bar lifted out of a bath
 * (its drag-out). Returns the finished bars.
 */
export function lineStep(spec: LineSpec, line: Line, now: number, seconds: number, onBarOut: (station: number) => void): Bar[] {
  const finished: Bar[] = [];
  const h = line.hoist;
  let left = seconds;
  let t = now - seconds * 1000;
  for (let guard = 0; left > 0 && guard < 20; guard++) {
    if (h.state === "idle") {
      h.move = nextMove(spec, line, t);
      if (!h.move) break;
      h.state = "to-pick";
      h.phaseLeftS = travelS(spec, h.posMm, h.move.from * spec.pitchMm);
    }
    const used = Math.min(left, h.phaseLeftS);
    // the carriage's position while it travels
    if ((h.state === "to-pick" || h.state === "carry") && h.move) {
      const target = (h.state === "to-pick" ? h.move.from : h.move.to) * spec.pitchMm;
      const dir = Math.sign(target - h.posMm);
      h.posMm = dir === 0 ? target : dir > 0 ? Math.min(target, h.posMm + used * spec.speedMmS) : Math.max(target, h.posMm - used * spec.speedMmS);
    }
    h.phaseLeftS -= used;
    left -= used;
    t += used * 1000;
    if (h.phaseLeftS > 1e-6) break;
    const m = h.move!;
    switch (h.state) {
      case "to-pick": {
        // came ahead - waits over the bath for the bar's time to end
        const bar = m.bar === null ? undefined : line.bars.find((b) => b.id === m.bar);
        const waitS = bar ? (doneAt(spec, bar) - t) / 1000 : 0;
        h.state = waitS > 1e-3 ? "wait" : "lift-up";
        h.phaseLeftS = waitS > 1e-3 ? waitS : spec.liftS;
        break;
      }
      case "wait":
        h.state = "lift-up";
        h.phaseLeftS = spec.liftS;
        break;
      case "lift-up":
        if (m.bar === null) {
          line.serial += 1;
          const bar: Bar = { id: `L-${String(line.serial).padStart(4, "0")}`, step: -1, inSince: t, coatingUm: 0, ah: 0 };
          line.bars.push(bar);
          m.bar = bar.id;
          line.lastLoad = t;
        } else onBarOut(m.from);
        h.carrying = m.bar;
        h.state = m.from === 0 ? "carry" : "drip";
        h.phaseLeftS = m.from === 0 ? travelS(spec, h.posMm, m.to * spec.pitchMm) : spec.dripS;
        break;
      case "drip":
        h.state = "carry";
        h.phaseLeftS = travelS(spec, h.posMm, m.to * spec.pitchMm);
        break;
      case "carry":
        h.state = "lift-down";
        h.phaseLeftS = spec.liftS;
        break;
      case "lift-down": {
        const bar = line.bars.find((b) => b.id === h.carrying)!;
        if (m.to === spec.baths.length + 1) {
          line.bars = line.bars.filter((b) => b.id !== bar.id);
          line.done.bars += 1;
          line.done.parts += spec.partsPerBar;
          finished.push(bar);
        } else {
          bar.step += 1;
          bar.inSince = t;
        }
        h.carrying = null;
        h.move = null;
        h.state = "idle";
        break;
      }
      default:
        h.state = "idle";
    }
  }
  return finished;
}

export interface HoistPhase {
  state: HoistState;
  endAt: number; // ms
  fromMm: number; // the carriage at the phase's start and end
  toMm: number;
}

/**
 * The hoist's current move as a timeline from `now`: this phase (what is left of it) and the ones after, each
 * with its end and the carriage's travel - the panel plays it on its own clock, so no phase is skipped between
 * two updates. Empty while idle.
 */
export function hoistPlan(spec: LineSpec, line: Line, now: number): HoistPhase[] {
  const h = line.hoist;
  const m = h.move;
  if (!m || h.state === "idle") return [];
  const fromMm = m.from * spec.pitchMm;
  const toMm = m.to * spec.pitchMm;
  const order: HoistState[] = ["to-pick", "wait", "lift-up", "drip", "carry", "lift-down"];
  const out: HoistPhase[] = [];
  let t = now;
  let at = h.posMm;
  const bar = m.bar === null ? undefined : line.bars.find((b) => b.id === m.bar);
  for (const state of order.slice(order.indexOf(h.state))) {
    const current = state === h.state;
    let secs: number;
    let end = at;
    if (state === "to-pick") {
      secs = h.phaseLeftS;
      end = fromMm;
    } else if (state === "wait") {
      secs = current ? h.phaseLeftS : bar ? Math.max(0, (doneAt(spec, bar) - t) / 1000) : 0;
    } else if (state === "drip") {
      secs = m.from === 0 ? 0 : current ? h.phaseLeftS : spec.dripS;
    } else if (state === "carry") {
      secs = current ? h.phaseLeftS : travelS(spec, at, toMm);
      end = toMm;
    } else secs = current ? h.phaseLeftS : spec.liftS;
    if (secs <= 1e-3 && !current) continue;
    t += secs * 1000;
    out.push({ state, endAt: Math.round(t), fromMm: Math.round(at), toMm: Math.round(end) });
    at = end;
  }
  return out;
}

/** The bar in the anodize bath now (lowered, not carried), with its time there so far. */
export function barInAnodize(spec: LineSpec, line: Line): Bar | null {
  const idx = spec.baths.findIndex((b) => b.role === "anodize");
  if (idx < 0) return null;
  return line.bars.find((b) => b.id !== line.hoist.carrying && b.step >= 0 && spec.recipe[b.step].bath === idx) ?? null;
}
