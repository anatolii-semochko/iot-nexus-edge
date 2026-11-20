import React from 'react'

// A zone's gauge on the shop's plan (2026-11-20 - the user: the plan's cards gave way to gauges in the step
// timer's style, larger): a ring open at the bottom, its track white, the value's arc from the scale's start -
// green in its band, yellow out of it, red on an alarm; the band's edges as ticks; the value and its unit in the
// middle, the gauge's name under the ring. Its width - a share of the picture's, clamped so a phone still reads it.

export const GAUGE_CSS = `
.ms-gauge { position: absolute; aspect-ratio: 1; transform: translate(-50%, -50%); overflow: visible; pointer-events: none;
  width: clamp(46px, var(--w), 120px) }
.ms-gauge text { font-family: system-ui, sans-serif; font-weight: 700; fill: #1f2933; stroke: #fff; stroke-width: 6px;
  paint-order: stroke; stroke-linejoin: round }
.ms-gauge .v { font-size: 28px }
.ms-gauge .u { font-size: 15px; font-weight: 600; stroke-width: 5px }
.ms-gauge .n { font-size: 16px; font-weight: 600; stroke-width: 5px }
`

const COLORS = {
  ok: '#1f9d6b',
  warn: '#f0a500',
  alarm: '#e55353',
  track: 'rgba(255, 255, 255, 0.72)',
}
// the ring: its radius, the gap at the bottom (degrees)
const R = 38
const GAP = 90
const ARC = 2 * Math.PI * R
const SWEEP = ARC * (1 - GAP / 360)

/** An arc of the ring from `a` to `b` (shares of the open ring). */
const Arc = ({ a, b, color, width }) => {
  const len = SWEEP * (b - a)
  if (len < 0.5) return null
  return (
    <circle
      cx="50"
      cy="50"
      r={R}
      fill="none"
      stroke={color}
      strokeWidth={width}
      strokeLinecap="round"
      strokeDasharray={`${len} ${ARC}`}
      strokeDashoffset={-SWEEP * a}
    />
  )
}

/** A tick across the ring at `f` (a share of the open ring). */
const Tick = ({ f }) => {
  const deg = 90 + GAP / 2 + f * (360 - GAP)
  const rad = (deg * Math.PI) / 180
  const [c, s] = [Math.cos(rad), Math.sin(rad)]
  return (
    <line
      x1={50 + (R - 8) * c}
      y1={50 + (R - 8) * s}
      x2={50 + (R + 8) * c}
      y2={50 + (R + 8) * s}
      stroke="#1f2933"
      strokeWidth={2.2}
      strokeLinecap="round"
      opacity={0.55}
    />
  )
}

/**
 * One gauge at `at` (the picture's shares), `size` - its width as a share of the picture's.
 * `g`: { name, value, min, max, lo?, hi?, unit, digits?, state? ('ok' | 'warn' | 'alarm' - else by the band) }.
 */
const ZoneGauge = ({ at, size, g }) => {
  const span = g.max - g.min || 1
  const share = (v) => Math.min(1, Math.max(0, (v - g.min) / span))
  const ok = (g.lo == null || g.value >= g.lo) && (g.hi == null || g.value <= g.hi)
  const state = g.state ?? (ok ? 'ok' : 'warn')
  const f = Number.isFinite(g.value) ? share(g.value) : 0
  const text = Number.isFinite(g.value) ? g.value.toFixed(g.digits ?? 0) : '-'
  return (
    <svg
      className="ms-gauge"
      viewBox="0 0 100 100"
      style={{ left: `${at[0] * 100}%`, top: `${at[1] * 100}%`, '--w': `${size * 100}%` }}
    >
      <title>{`${g.name}: ${text} ${g.unit}`}</title>
      <g transform={`rotate(${90 + GAP / 2} 50 50)`}>
        <Arc a={0} b={1} color={COLORS.track} width={15} />
        <Arc a={0} b={f} color={COLORS[state]} width={9} />
      </g>
      {g.lo != null && g.lo > g.min && <Tick f={share(g.lo)} />}
      {g.hi != null && g.hi < g.max && <Tick f={share(g.hi)} />}
      <text className="v" x="50" y="47" textAnchor="middle" dominantBaseline="central">
        {text}
      </text>
      <text className="u" x="50" y="69" textAnchor="middle" dominantBaseline="central">
        {g.unit}
      </text>
      <text className="n" x="50" y="97" textAnchor="middle" dominantBaseline="central">
        {g.name}
      </text>
    </svg>
  )
}

export default ZoneGauge
