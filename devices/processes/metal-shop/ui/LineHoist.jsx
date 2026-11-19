import React, { useEffect, useState } from 'react'
import StepTimer, { TIMER_CSS, useClock } from './StepTimer'
import lineSpots from './factory-line.json'
import shopSpots from './factory-shop.json'

// The anodizing line's moving hoist over its picture (2026-11-19, iot AGENTS_TO_DO.md - "the hoist moves"): the
// picture has the line's gantry alone; the carriage, the hoist's bar and the bars resting in the baths are
// sprites rendered with the same camera (factory-<view>-<sprite>.webp - each the picture's full frame), moved to
// their places by transforms only (compositor-only animation, iot memory). The places - the render's
// `hoist.stations` (each its carriage, raised bar and bar-down point, in the picture's shares). Two views: the
// line's popup ("line") and the shop's plan ("shop").
//
// The process sends its move as a timeline (`hoist.plan` - each phase's end and the carriage's travel,
// anodizing-line model.ts hoistPlan): the panel plays it on its own clock, one phase after another - the
// carriage travels only with the bar up, the bar goes up and down only with the carriage standing (the user,
// 2026-11-19: snapshots of the state made the two overlap whenever an update skipped a phase). Each sprite is
// rendered at every station too (factory-<view>-<sprite>-<k>.webp - its own perspective): the nearest station's
// one is shown, switched at the half-way point - never two at once (a cross-fade doubled the carriage). The bar
// under the liquid is cut away at the bath's surface while it goes in or out; the gantry's front rail and posts
// (factory-<view>-rail.webp) lie over the bar and its cables, which hang behind them. Over each bar in a bath -
// its step's timer: a ring with a cut at its start, done (green) and left (yellow), the seconds left, counted to
// the bar's `doneAt` on the panel's clock.

const SPRITES = import.meta.glob('./factory-*-{carriage,bar-up,bar-down,rail}*.webp', {
  eager: true,
  import: 'default',
})

/** A view's sprites and stations; `home` - the station the sprites were rendered at (the nearest to `at`). */
const geometry = (view, spots) => {
  const stations = spots.hoist?.stations ?? []
  const at = spots.hoist?.at ?? [0.5, 0.3]
  const home = stations.reduce(
    (best, st, k) =>
      Math.abs(st.car[0] - at[0]) < Math.abs(stations[best].car[0] - at[0]) ? k : best,
    0,
  )
  const sprite = (name, k) =>
    SPRITES[
      k === undefined ? `./factory-${view}-${name}.webp` : `./factory-${view}-${name}-${k}.webp`
    ]
  // the per-station sprites - only when every station has its own
  const perStation = (name) => stations.length > 0 && stations.every((_, k) => sprite(name, k))
  return { stations, home, sprite, perStation }
}
// the step timers: at a station's point `kind` moved by `dy` (the picture's shares), `size` - a bath's pitch share.
// The line's popup tags each bath over its back edge, so the timers go on the baths' front walls there.
const TIMERS = {
  line: { kind: 'down', dy: 0.12, size: 0.42 },
  shop: { kind: 'up', dy: 0, size: 0.5 },
}
const VIEWS = {
  line: { ...geometry('line', lineSpots), timer: TIMERS.line },
  shop: { ...geometry('shop', shopSpots), timer: TIMERS.shop },
}

const CSS = `
.ms-hoist { position: absolute; inset: 0; pointer-events: none; overflow: hidden }
.ms-hoist img, .ms-hoist .ms-layer { position: absolute; left: 0; top: 0; width: 100%; will-change: transform }
.ms-hoist img { height: auto }
.ms-hoist .ms-layer { height: 100% }
.ms-hoist .ms-clip { position: absolute; inset: 0 }
.ms-hoist .ms-cable { position: absolute; width: 2px; background: #5c636a; transform-origin: top center; will-change: transform }
`

// the liquid's surface between a station's bar-down (0) and raised-bar (1) points: the render's bath top 0.412 m,
// the bar's 0.45 m down and 0.8 m up (images/dashboard/v2/make_folder_renders.py bath, BAR_*_Z)
const SURFACE = -(0.45 - 0.412) / (0.8 - 0.45)
// a client clock further off the server's than this is corrected by the update's own time (`hoist.at`)
const SKEW_MS = 60_000

/** A station's point (`kind` - "car", "up", "down") at a fractional station (between two - interpolated). */
const point = (stations, f, kind) => {
  const k = Math.max(0, Math.min(stations.length - 1, f))
  const a = stations[Math.floor(k)][kind]
  const b = stations[Math.ceil(k)][kind]
  const t = k - Math.floor(k)
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
}

/** A full-frame layer's transform: from its home point to `to` (both in the picture's shares). */
const shift = (home, to) => `translate(${(to[0] - home[0]) * 100}%, ${(to[1] - home[1]) * 100}%)`

/** A sprite moved to `to` (a station's point of `kind`) over `move` (a CSS transition): when each station has its
 * own sprite, only station `near`'s one is shown (switched, not faded); else the one rendered at the home one. */
const Moving = ({ g, name, kind, to, near, move }) => {
  if (!g.perStation(name))
    return (
      <img
        src={g.sprite(name)}
        alt=""
        style={{ transform: shift(g.stations[g.home][kind], to), transition: move }}
      />
    )
  return g.stations.map((st, k) => (
    <img
      key={k}
      src={g.sprite(name, k)}
      alt=""
      style={{ transform: shift(st[kind], to), opacity: k === near ? 1 : 0, transition: move }}
    />
  ))
}

/**
 * The hoist at `t` (the server's ms) from its timeline: the phase, the carriage's station (fractional) now and
 * at the phase's end, the bar's lift (0 - down, 1 - up) now and at the end, the next moment to re-render.
 */
const hoistAt = (h, pitch, t) => {
  const plan = Array.isArray(h.plan) ? h.plan : []
  const k = plan.findIndex((p) => p.endAt > t)
  if (k < 0) {
    const last = plan[plan.length - 1]
    const f = (last ? last.toMm : h.posMm) / pitch
    return { phase: null, ended: !!last, f, fEnd: f, lift: 0, liftEnd: 0, nextAt: null }
  }
  const p = plan[k]
  const start = k === 0 ? (h.at ?? t) : plan[k - 1].endAt
  const share = p.endAt > start ? Math.min(1, Math.max(0, (t - start) / (p.endAt - start))) : 1
  const f = (p.fromMm + (p.toMm - p.fromMm) * share) / pitch
  const fEnd = p.toMm / pitch
  const LIFT = {
    'to-pick': [0, 0],
    wait: [0, 0],
    'lift-up': [0, 1],
    drip: [1, 1],
    carry: [1, 1],
    'lift-down': [1, 0],
  }
  const [l0, l1] = LIFT[p.state] ?? [0, 0]
  // the next half-way point between two stations on a travel
  let nextAt = p.endAt
  if (p.toMm !== p.fromMm) {
    const dir = Math.sign(fEnd - f)
    const half = dir > 0 ? Math.floor(f + 0.5) + 0.5 : Math.ceil(f - 0.5) - 0.5
    if ((half - f) * dir > 0 && (fEnd - half) * dir > 0) {
      const at = start + ((half * pitch - p.fromMm) / (p.toMm - p.fromMm)) * (p.endAt - start)
      nextAt = Math.min(nextAt, Math.ceil(at) + 1)
    }
  }
  return { phase: p, ended: false, f, fEnd, lift: l0 + (l1 - l0) * share, liftEnd: l1, nextAt }
}

const LineHoist = ({ m, view = 'line' }) => {
  const g = VIEWS[view] ?? VIEWS.line
  const h = m?.hoist
  const pitch = h?.pitchMm || 900
  const local = useClock(null)
  // the server's clock: the client's, unless it is far off the update's own time
  const skew = h?.at && local && Math.abs(local - h.at) > SKEW_MS ? local - h.at : 0
  const pre = h && local ? hoistAt(h, pitch, local - skew) : null
  const now = useClock(pre?.nextAt != null ? pre.nextAt + skew : null)
  // the first frame stands where the hoist is now; the transitions to the phase's end start from the next one
  const [ready, setReady] = useState(false)
  useEffect(() => {
    if (!local || ready) return undefined
    const frame = requestAnimationFrame(() => setReady(true))
    return () => cancelAnimationFrame(frame)
  }, [local, ready])
  const { stations: STATIONS, home: HOME, sprite } = g
  if (!h || !local || STATIONS.length < 2 || !sprite('carriage')) return null
  const t = Math.max(local, now) - skew
  const s = hoistAt(h, pitch, t)
  const secs = s.phase ? Math.max(0, (s.phase.endAt - t) / 1000) : 0
  const move = ready && secs > 0 ? `transform ${secs}s linear` : 'none'
  const near = Math.max(0, Math.min(STATIONS.length - 1, Math.round(s.f)))
  // the carriage and the bar: at the phase's end (a CSS transition takes them there over its time left)
  const fTo = ready ? s.fEnd : s.f
  const lTo = ready ? s.liftEnd : s.lift
  const car = point(STATIONS, fTo, 'car')
  const shown = s.phase !== null && s.phase.state !== 'to-pick' && s.phase.state !== 'wait'
  const up = point(STATIONS, fTo, 'up')
  const dn = point(STATIONS, fTo, 'down')
  const barAt = [dn[0] + (up[0] - dn[0]) * lTo, dn[1] + (up[1] - dn[1]) * lTo]
  const H = STATIONS[HOME]
  // the cable: from under the carriage to the bar - its full length (the bar down), scaled to the bar's height
  const full = Math.max(0.001, H.down[1] - H.car[1] - 0.012)
  const scale = Math.max(0, barAt[1] - car[1] - 0.012) / full
  // the bar going in or out of a bath: cut at the liquid's surface (a station's line, the bar's plane)
  const lifting = s.phase && (s.phase.state === 'lift-up' || s.phase.state === 'lift-down')
  const st = STATIONS[near]
  const surface = st.down[1] + (st.up[1] - st.down[1]) * SURFACE
  const clip =
    lifting && near > 0 && near < STATIONS.length - 1
      ? `inset(0 0 ${(1 - surface) * 100}% 0)`
      : 'none'
  // the bars resting in the baths - all but the one on the hoist now; the moved one in its new bath while the
  // next update is not there yet (the timeline played out)
  const onHoist = h.bar ?? null
  const resting = (m.bars ?? []).filter(
    (b) =>
      b.station !== null &&
      !(onHoist && b.id === onHoist && (shown || s.ended)) &&
      !(b.carried && !s.ended),
  )
  if (s.ended && onHoist && h.to > 0 && h.to < STATIONS.length - 1)
    resting.push({ id: onHoist, station: h.to, needMin: 0 })
  const T = g.timer
  const size = Math.abs(STATIONS[2].car[0] - STATIONS[1].car[0]) * T.size
  return (
    <div className="ms-hoist" aria-hidden="true">
      <style>{CSS + TIMER_CSS}</style>
      {resting.map((b) => (
        <img
          key={b.id}
          src={g.perStation('bar-down') ? sprite('bar-down', b.station) : sprite('bar-down')}
          alt=""
          style={
            g.perStation('bar-down')
              ? undefined
              : { transform: shift(H.down, STATIONS[b.station]?.down ?? H.down) }
          }
        />
      ))}
      <div className="ms-clip" style={{ clipPath: clip, opacity: shown ? 1 : 0 }}>
        <div className="ms-layer" style={{ transform: shift(H.car, car), transition: move }}>
          <div
            className="ms-cable"
            style={{
              left: `${H.car[0] * 100}%`,
              top: `${(H.car[1] + 0.012) * 100}%`,
              height: `${full * 100}%`,
              transform: `scaleY(${scale})`,
              transition: move,
            }}
          />
        </div>
        <div className="ms-layer">
          <Moving g={g} name="bar-up" kind="up" to={barAt} near={near} move={move} />
        </div>
      </div>
      {sprite('rail') && <img src={sprite('rail')} alt="" />}
      <Moving g={g} name="carriage" kind="car" to={car} near={near} move={move} />
      {/* the step timers - over everything (the carriage passes over the baths' points) */}
      {resting.map((b) => {
        const at0 = STATIONS[b.station]
        if (!at0 || !(b.needMin > 0)) return null
        const needS = b.needMin * 60
        const leftS = Math.max(
          0,
          Number.isFinite(b.doneAt)
            ? (b.doneAt - t) / 1000
            : (b.leftS ?? needS - b.elapsedMin * 60),
        )
        const at = [at0[T.kind][0], at0[T.kind][1] + T.dy]
        return <StepTimer key={b.id} at={at} size={size} leftS={leftS} needS={needS} />
      })}
    </div>
  )
}

export default LineHoist
