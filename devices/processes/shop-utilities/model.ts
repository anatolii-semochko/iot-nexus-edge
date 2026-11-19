/**
 * shop-utilities - the metal shop's utilities' models (pure; iot AGENTS_TO_DO.md 2026-11-19, step 6):
 *  - the compressor and its receiver: loaded below the band's bottom, unloaded above its top, an idle
 *    run-on, then off; the receiver filled by its free air delivery, emptied by the shop's demand;
 *  - the chiller: the heat the baths' cooling coils take (the anodize bath), its supply / return and COP;
 *  - the wastewater neutralization: the rinses' acid inflow (and each bar's drag-out) pulls the tank's pH
 *    down, the caustic dosing pump lifts it, the acid one brings an overshoot back;
 *  - the DI water: its conductivity grows with the water drawn, the column regenerated over the limit (the
 *    second column takes over meanwhile).
 */

export interface CompressorSpec {
  loadBar: number;
  unloadBar: number;
  fadM3Min: number; // free air delivery, loaded
  loadedKw: number;
  unloadedKw: number;
  idleMin: number; // unloaded this long - off
  receiverM3: number;
}

export interface Compressor {
  bar: number;
  state: "loaded" | "unloaded" | "off";
  idleS: number;
}

/** The receiver and the compressor over `seconds` with the shop's demand (m³/min of free air). */
export function compressorStep(s: CompressorSpec, c: Compressor, demandM3Min: number, seconds: number): number {
  if (c.bar <= s.loadBar) {
    c.state = "loaded";
    c.idleS = 0;
  } else if (c.bar >= s.unloadBar && c.state === "loaded") c.state = "unloaded";
  if (c.state === "unloaded") {
    c.idleS += seconds;
    if (c.idleS >= s.idleMin * 60) c.state = "off";
  }
  const inflow = c.state === "loaded" ? s.fadM3Min : 0;
  c.bar = Math.max(0, c.bar + ((inflow - demandM3Min) * 1.013 * (seconds / 60)) / s.receiverM3);
  return c.state === "loaded" ? s.loadedKw : c.state === "unloaded" ? s.unloadedKw : 0;
}

export interface ChillerSpec {
  supplyC: number;
  flowLs: number;
  cop: number;
  auxKw: number; // the pumps and the fans while it runs
}

/** The chiller with `loadKw` of heat to take away (0 - it idles on its pumps while the shift runs). */
export function chiller(s: ChillerSpec, loadKw: number, running: boolean) {
  if (!running) return { supplyC: s.supplyC + 6, returnC: s.supplyC + 6, powerKw: 0 };
  return { supplyC: s.supplyC, returnC: s.supplyC + loadKw / (4.186 * s.flowLs), powerKw: loadKw / s.cop + s.auxKw };
}

export interface WastewaterSpec {
  tankM3: number;
  inflowPh: number;
  lowPh: number; // the caustic pump on below
  highPh: number; // the acid pump on above
  dosePhMin: number; // one pump's lift per minute
  dragOutPh: number; // one bar's drag-out - the pH drop
}

export interface Wastewater {
  ph: number;
  naoh: boolean;
  acid: boolean;
}

/** The tank over `seconds`: the inflow mixes it towards the rinses' pH, the pumps by the band. */
export function wastewaterStep(s: WastewaterSpec, w: Wastewater, inflowLMin: number, bars: number, seconds: number) {
  const mix = Math.min(1, (inflowLMin * (seconds / 60)) / (s.tankM3 * 1000));
  w.ph += (s.inflowPh - w.ph) * mix * 4 - bars * s.dragOutPh;
  w.naoh = w.ph < s.lowPh || (w.naoh && w.ph < (s.lowPh + s.highPh) / 2);
  w.acid = w.ph > s.highPh || (w.acid && w.ph > (s.lowPh + s.highPh) / 2);
  w.ph += ((w.naoh ? 1 : 0) - (w.acid ? 1 : 0)) * s.dosePhMin * (seconds / 60);
  w.ph = Math.min(14, Math.max(0, w.ph));
}

export interface DiSpec {
  limitUScm: number;
  freshUScm: number;
  perM3: number; // the conductivity's growth per m³ drawn
  regenMin: number;
}

export interface Di {
  uScm: number;
  column: "A" | "B";
  regenLeftS: number; // the other column's regeneration left
}

/** The DI water over `seconds` with `m3` drawn: over the limit - the other column takes over, this one regenerates. */
export function diStep(s: DiSpec, d: Di, m3: number, seconds: number) {
  d.uScm += m3 * s.perM3;
  d.regenLeftS = Math.max(0, d.regenLeftS - seconds);
  if (d.uScm >= s.limitUScm && d.regenLeftS === 0) {
    d.column = d.column === "A" ? "B" : "A";
    d.uScm = s.freshUScm;
    d.regenLeftS = s.regenMin * 60;
  }
}
