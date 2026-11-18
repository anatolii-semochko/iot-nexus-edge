// The metal shop's mockup charts (step 2, iot AGENTS_TO_DO.md 2026-11-18): today's curves made from the
// time of day - a work shift 06:00-22:00, the machines' cycles, a little noise - the same every reload
// (no randomness), so the mockup looks alive but stays reproducible. Each a [{ t, v }] list every 5 min
// from 00:00 to now.

const STEP_MS = 5 * 60_000

/** A small repeatable wobble in -1..1 for the moment `t` and the curve `seed`. */
const wobble = (t, seed) => {
  const x = Math.sin((t / 60_000) * 0.137 + seed * 12.9898) * 43758.5453
  return (x - Math.floor(x)) * 2 - 1
}

/** The hour of the day of `t`, fractional. */
const hourOf = (t) => {
  const d = new Date(t)
  return d.getHours() + d.getMinutes() / 60
}

/** In the shift (06:00-22:00) - 1, else 0; a short break at 12:00. */
const shift = (h) => (h >= 6 && h < 22 && !(h >= 12 && h < 12.5) ? 1 : 0)

/** Today's points from 00:00 to `now` of `fn(t, h)`. */
export const daySeries = (now, fn) => {
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  const out = []
  for (let t = start.getTime(); t <= now; t += STEP_MS) out.push({ t, v: fn(t, hourOf(t)) })
  return out
}

export const SERIES = {
  // the anodize bath: held at 20 °C by the chiller, warmer while the rectifier runs
  anodizeC: (t, h) => 20 + shift(h) * 0.6 * Math.sin(h * 2.1) + wobble(t, 1) * 0.15,
  anodizeSetC: () => 20,
  rectifierA: (t, h) => (shift(h) && Math.sin(h * 3.2) > -0.3 ? 2700 + wobble(t, 2) * 180 : 0),
  // the CNC centres: running, a setup now and then, idle out of the shift
  cnc1Kw: (t, h) => (shift(h) ? 7.5 + Math.sin(h * 9) * 2.2 + wobble(t, 3) * 0.6 : 0.4),
  cnc2Kw: (t, h) =>
    shift(h) && !(h > 13 && h < 14.2) ? 6.8 + Math.cos(h * 8) * 2 + wobble(t, 4) * 0.6 : 0.4,
  partsPerHour: (t, h) => (shift(h) ? Math.max(0, 9 + Math.sin(h * 1.7) * 3 + wobble(t, 5)) : 0),
  // the oven: heats up for each batch, holds, cools between them
  ovenC: (t, h) => (shift(h) ? 60 + 22 * Math.max(0, Math.sin(h * 1.9)) + wobble(t, 6) : 24),
  ovenSetC: (t, h) => (shift(h) ? 82 : 25),
  // the utilities
  airBar: (t, h) => (shift(h) ? 6.8 + 0.4 * Math.sin(h * 14) + wobble(t, 7) * 0.08 : 7.4),
  compressorKw: (t, h) =>
    shift(h) ? 9 + 3 * Math.max(0, Math.sin(h * 14)) + wobble(t, 8) * 0.5 : 1.2,
  wastewaterPh: (t, h) => 7.3 + 0.35 * Math.sin(h * 2.4) + wobble(t, 9) * 0.05,
  diUsCm: (t, h) => 1.8 + 0.5 * Math.max(0, Math.sin(h * 0.9)) + wobble(t, 10) * 0.05,
  // the saw and QC
  cutsPerHour: (t, h) =>
    shift(h) && h < 18 ? Math.max(0, 14 + Math.sin(h * 2.3) * 5 + wobble(t, 11) * 2) : 0,
  rejectsPct: (t, h) =>
    shift(h) ? Math.max(0, 0.7 + Math.sin(h * 1.3) * 0.4 + wobble(t, 12) * 0.2) : 0,
}
