import React from 'react'

// Precision round gauge (AGENTS.md section 86) - elementary visual
// component, first drawn for the aquarium info panel (2026-09-29) and
// kept here for places that need accuracy: a 240-degree scale with 40
// fine tick marks (every 5th major) colored by zone - green inside the
// warning limits, yellow between warning and error, red beyond error.
// Any limit may be null, so one-sided scales work too (e.g. "days left":
// red only at the low end; "clogging": red only at the high end).
// Renders an SVG <g> - place it inside your own <svg> at (x, y).
//
// limits: { min, max, errLow, warnLow, warnHigh, errHigh }
// state:  'absent' | 'inactive' (muted grey) | 'active' | 'error'

export const GAUGE_ZONE_COLORS = { red: '#e55353', yellow: '#f9b115', green: '#2eb85c' }
export const GAUGE_MUTED_COLORS = { absent: '#c3cad3', inactive: '#6b7280' }
export const GAUGE_INK = '#2b2f36'
const ZONE_COLORS = GAUGE_ZONE_COLORS
const STATE_COLORS = GAUGE_MUTED_COLORS
const INK = GAUGE_INK

const START = 150 // degrees, screen coordinates (y down): lower left
const SWEEP = 240
const TICKS = 40
const MAJOR_EVERY = 5

export const zoneAt = (v, { errLow, warnLow, warnHigh, errHigh }) => {
  if (errLow != null && v < errLow) return 'red'
  if (errHigh != null && v > errHigh) return 'red'
  if (warnLow != null && v < warnLow) return 'yellow'
  if (warnHigh != null && v > warnHigh) return 'yellow'
  return 'green'
}

const polar = (deg, radius) => {
  const rad = (deg * Math.PI) / 180
  return [radius * Math.cos(rad), radius * Math.sin(rad)]
}

const PrecisionRoundGauge = ({ x, y, r, value, limits, label, unit, decimals = 1, state = 'active' }) => {
  const { min, max } = limits
  const angleOf = (v) => START + ((Math.min(max, Math.max(min, v)) - min) / (max - min)) * SWEEP
  const hasValue = state !== 'absent' && value != null && !Number.isNaN(value)
  const zone = hasValue ? zoneAt(value, limits) : 'green'
  const muted = state === 'absent' || state === 'inactive' ? STATE_COLORS[state] : null
  const effective = state === 'active' && zone === 'red' ? 'error' : state

  const rimColor =
    effective === 'error'
      ? ZONE_COLORS.red
      : state === 'active' && zone === 'yellow'
        ? ZONE_COLORS.yellow
        : muted ?? INK
  const textColor = effective === 'error' ? ZONE_COLORS.red : muted ?? INK

  const ticks = []
  for (let i = 0; i <= TICKS; i++) {
    const v = min + ((max - min) * i) / TICKS
    const a = angleOf(v)
    const major = i % MAJOR_EVERY === 0
    const [x1, y1] = polar(a, r * 0.8)
    const [x2, y2] = polar(a, r * (major ? 0.62 : 0.69))
    ticks.push(
      <line
        key={i}
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke={muted ?? ZONE_COLORS[zoneAt(v, limits)]}
        strokeWidth={major ? r * 0.045 : r * 0.028}
        strokeLinecap="round"
      />,
    )
  }

  const [nx, ny] = polar(angleOf(hasValue ? value : min), r * 0.6)
  const [tx, ty] = polar(angleOf(hasValue ? value : min) + 180, r * 0.12)

  return (
    <g transform={`translate(${x} ${y})`}>
      <circle r={r} fill="#fff" stroke={rimColor} strokeWidth={r * 0.1} />
      {ticks}
      {hasValue && (
        <g>
          <line x1={tx} y1={ty} x2={nx} y2={ny} stroke={muted ?? INK} strokeWidth={r * 0.05} strokeLinecap="round" />
          <circle r={r * 0.075} fill={muted ?? INK} />
        </g>
      )}
      <text
        y={r * 0.42}
        textAnchor="middle"
        fontSize={r * 0.34}
        fontWeight={700}
        fill={textColor}
        style={{ fontVariantNumeric: 'tabular-nums' }}
      >
        {hasValue ? value.toFixed(decimals) : '—'}
        {unit && (
          <tspan fontSize={r * 0.17} fontWeight={600} dx={r * 0.04}>
            {unit}
          </tspan>
        )}
      </text>
      <text y={r * 0.68} textAnchor="middle" fontSize={r * 0.17} fill={muted ?? '#5b6270'}>
        {label}
      </text>
    </g>
  )
}

export default PrecisionRoundGauge
