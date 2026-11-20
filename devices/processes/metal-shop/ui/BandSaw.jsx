import React, { useEffect, useState } from 'react'
import StepTimer, { TIMER_CSS, useClock } from './StepTimer'
import blanksSpots from './factory-blanks.json'
import shopSpots from './factory-shop.json'

// The band saw over its picture (2026-11-19, iot AGENTS_TO_DO.md - the saw stage): the picture has the saw's
// stand, its tables, the vice and the blanks' bin; the arm, the bar stock and the blank just cut are sprites
// rendered with the same camera (factory-<view>-saw-<arm|bar|blank>.webp - each the picture's full frame), moved
// by transforms only (compositor-only animation, iot memory). The places - the render's hot spots `saw` (the bar's
// feed, the arm's travel down, the blank's way out and down into the bin as vectors, the timer's place). A cut
// (the machining process's `saw.endAt`, `saw.spanS`) plays on the panel's clock: the bar fed by a blank's length,
// the arm down through it, the arm up; then the blank slides along the outfeed table and drops into the bin while
// the next cut starts. Over the saw - the cut's timer. Two views: the blanks zone's popup ("blanks") and the shop's
// plan ("shop"). While the blade is in the bar, sparks fly from the cut (2026-11-20, the user): small glowing dots,
// each one's wrapper (the picture's full frame) moved by a transform along the hot spots' `spark` way, bent by a
// mid-way point, fading out - transforms and opacity only.

const SPRITES = import.meta.glob('./factory-*-saw-{arm,bar,blank}.webp', {
  eager: true,
  import: 'default',
})
const SPOTS = { blanks: blanksSpots.saw?.[0], shop: shopSpots.saw?.[0] }
// a client clock further off the server's than this is corrected by the update's own time (`at`)
const SKEW_MS = 60_000
// a cut's phases - shares of its time: the feed, the cut (the arm down), the arm up
const FEED = 0.12
const CUT = 0.9
// the blank's way out and into the bin, s
const OUT_S = 3
// the timer's width (of the picture's) by the view
const TIMER = { blanks: 0.09, shop: 0.028 }
// the timer's shift along the blank's way out (shares of it) - in the zone's popup the saw's tag is over the arm,
// so the timer goes over the outfeed table beside it
const TIMER_SHIFT = { blanks: 1.6, shop: 0 }

const pct = (v) => `${(v * 100).toFixed(3)}%`
const shift = (v, k) => (k ? `translate(${pct(v[0] * k)}, ${pct(v[1] * k)})` : 'none')
const CSS = `
.ms-saw { position: absolute; inset: 0; pointer-events: none; overflow: hidden }
.ms-saw img { position: absolute; left: 0; top: 0; width: 100%; height: auto; will-change: transform }
.ms-saw .ms-saw-out { animation: ms-saw-out ${OUT_S}s linear both }
@keyframes ms-saw-out {
  0% { transform: none; opacity: 1 }
  55% { transform: translate(var(--ox), var(--oy)); opacity: 1 }
  85% { transform: translate(var(--dx), var(--dy)); opacity: 1 }
  100% { transform: translate(var(--dx), var(--dy)); opacity: 0 }
}
.ms-spark { position: absolute; inset: 0; will-change: transform, opacity; animation: ms-spark var(--d) linear infinite;
  animation-delay: var(--t); opacity: 0 }
.ms-spark i { position: absolute; width: var(--s); height: var(--s); margin: calc(var(--s) / -2) 0 0 calc(var(--s) / -2);
  border-radius: 50%; background: #fff1b8; box-shadow: 0 0 3px 1px #ffb02e, 0 0 6px 2px rgba(255, 106, 0, .55) }
@keyframes ms-spark {
  0% { transform: none; opacity: 1 }
  35% { transform: translate(var(--mx), var(--my)); opacity: 1 }
  100% { transform: translate(var(--ex), var(--ey)); opacity: 0 }
}
@media (prefers-reduced-motion: reduce) { .ms-saw .ms-saw-out { animation: none; opacity: 0 } .ms-spark { display: none } }
`
// the sparks: each one's share of the way, its side-ways spread (a share of the way's length), its time, its size
const SPARKS = [
  [1, 0, 0.55, 1],
  [0.75, 0.35, 0.45, 0.8],
  [0.9, -0.3, 0.6, 0.9],
  [0.6, 0.15, 0.4, 0.7],
  [1.1, 0.2, 0.65, 1],
  [0.8, -0.15, 0.5, 0.8],
  [0.55, -0.4, 0.4, 0.7],
  [0.95, 0.45, 0.6, 0.9],
]
// a spark's size (px) by the view
const SPARK_PX = { blanks: 4, shop: 2.5 }

/** The sparks from the cut along `way` (a vector in the picture's shares) while the blade cuts. */
const Sparks = ({ at, way, view }) => {
  const len = Math.hypot(way[0], way[1]) || 1
  // the side-ways direction - across the way
  const side = [-way[1] / len, way[0] / len]
  return SPARKS.map(([f, sp, d, s], k) => {
    const end = [way[0] * f + side[0] * sp * len * 0.6, way[1] * f + side[1] * sp * len * 0.6]
    // the mid-way point: out first, the fall later (a spark's arc)
    const mid = [end[0] * 0.45, end[1] * 0.2 - Math.abs(end[1]) * 0.12]
    return (
      <div
        key={k}
        className="ms-spark"
        style={{
          '--d': `${d}s`,
          '--t': `${(-k * d) / SPARKS.length}s`,
          '--mx': pct(mid[0]),
          '--my': pct(mid[1]),
          '--ex': pct(end[0]),
          '--ey': pct(end[1]),
          '--s': `${(SPARK_PX[view] ?? 3) * s}px`,
        }}
      >
        <i style={{ left: pct(at[0]), top: pct(at[1]) }} />
      </div>
    )
  })
}

/** The cut at `t`: the bar's feed and the arm's travel (0..1) now and at the phase's end, the phase's end. */
const cutAt = (saw, t) => {
  if (!Number.isFinite(saw?.endAt) || !(saw.spanS > 0) || t >= saw.endAt) return null
  const span = saw.spanS * 1000
  const start = saw.endAt - span
  const f = Math.max(0, (t - start) / span)
  if (f < FEED) return { feed: f / FEED, feedEnd: 1, arm: 0, armEnd: 0, endAt: start + FEED * span }
  if (f < CUT) {
    const a = (f - FEED) / (CUT - FEED)
    return { feed: 1, feedEnd: 1, arm: a, armEnd: 1, endAt: start + CUT * span }
  }
  return { feed: 1, feedEnd: 1, arm: 1 - (f - CUT) / (1 - CUT), armEnd: 0, endAt: saw.endAt }
}

/** A blank on its way out; its animation's offset fixed when it shows (a later render must not move it). */
const Blank = ({ src, sp, since }) => {
  const [delay] = useState(() => -since / 1000)
  return (
    <img
      src={src}
      alt=""
      className="ms-saw-out"
      style={{
        animationDelay: `${delay}s`,
        '--ox': pct(sp.out[0]),
        '--oy': pct(sp.out[1]),
        '--dx': pct(sp.drop[0]),
        '--dy': pct(sp.drop[1]),
      }}
    />
  )
}

const BandSaw = ({ m, view = 'blanks' }) => {
  const sp = SPOTS[view]
  const saw = m?.saw
  const local = useClock(null)
  const skew = m?.at && local && Math.abs(local - m.at) > SKEW_MS ? local - m.at : 0
  const pre = saw && local ? cutAt(saw, local - skew) : null
  const now = useClock(pre ? pre.endAt + skew : saw?.endAt ? saw.endAt + skew : null)
  // the cuts seen ending - each one's blank on its way out (kept a while after its end)
  const [ends, setEnds] = useState([])
  if (Number.isFinite(saw?.endAt) && !ends.includes(saw.endAt))
    setEnds([...ends.slice(-3), saw.endAt])
  // the first frame stands where the cut is now; the transitions start from the next one
  const [ready, setReady] = useState(false)
  useEffect(() => {
    if (!local || ready) return undefined
    const frame = requestAnimationFrame(() => setReady(true))
    return () => cancelAnimationFrame(frame)
  }, [local, ready])
  const sprite = (name) => SPRITES[`./factory-${view}-saw-${name}.webp`]
  if (!sp || !local || !sprite('arm')) return null
  const t = Math.max(local, now) - skew
  const c = cutAt(saw, t)
  const secs = c && ready ? Math.max(0, (c.endAt - t) / 1000) : 0
  const move = secs > 0 ? `transform ${secs}s linear` : 'none'
  const feed = c ? (ready ? c.feedEnd : c.feed) : 0
  const arm = c ? (ready ? c.armEnd : c.arm) : 0
  const out = ends.filter((e) => t >= e && t < e + OUT_S * 1000)
  return (
    <div className="ms-saw" aria-hidden="true">
      <style>{CSS + TIMER_CSS}</style>
      <img
        src={sprite('bar')}
        alt=""
        style={{ transform: shift(sp.feed, feed), transition: c ? move : 'none' }}
      />
      {sprite('blank') &&
        out.map((e) => <Blank key={e} src={sprite('blank')} sp={sp} since={t - e} />)}
      <img src={sprite('arm')} alt="" style={{ transform: shift(sp.arm, arm), transition: move }} />
      {c && c.armEnd === 1 && c.arm < 1 && sp.cut && sp.spark && (
        <Sparks at={sp.cut} way={sp.spark} view={view} />
      )}
      {c && (
        <StepTimer
          at={[
            sp.timer[0] + sp.out[0] * (TIMER_SHIFT[view] ?? 0),
            sp.timer[1] + sp.out[1] * (TIMER_SHIFT[view] ?? 0),
          ]}
          size={TIMER[view] ?? 0.05}
          leftS={Math.max(0, (saw.endAt - t) / 1000)}
          needS={saw.spanS}
        />
      )}
    </div>
  )
}

export default BandSaw
