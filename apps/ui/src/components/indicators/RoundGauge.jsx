import React from 'react'
import { GAUGE_INK, GAUGE_MUTED_COLORS, GAUGE_ZONE_COLORS, zoneAt } from './PrecisionRoundGauge'

// Round gauge (AGENTS.md section 86) - elementary visual component, the
// readable sibling of PrecisionRoundGauge (2026-10-20, heating-control's
// pictures; after nexus-edge-aquarium's SimpleRoundGauge): a white dial,
// bold zone segments over 240 degrees sized by the limits, a needle, a big
// value; the rim turns yellow / red with the value's zone. Optionally a
// second, smaller inner scale with its own needle and value in its own
// colour - two related readings on one dial (flow / return temperature,
// heat / electric power). Renders an SVG <g> - place it inside your own
// <svg> at (x, y).
//
// limits: { min, max, errLow, warnLow, warnHigh, errHigh } (zoneAt)
// inner:  { value, limits, unit, decimals, color, label }
// state:  'absent' | 'inactive' (muted grey) | 'active'
// A scale with min < 0 < max (a power both ways) has its zero marked.

const START = 150 // degrees, screen coordinates (y down): lower left
const SWEEP = 240

const polar = (deg, radius) => {
  const rad = (deg * Math.PI) / 180
  return [radius * Math.cos(rad), radius * Math.sin(rad)]
}

const angleOf = ({ min, max }, v) =>
  START + ((Math.min(max, Math.max(min, v)) - min) / (max - min)) * SWEEP

const arc = (from, to, radius) => {
  const [x0, y0] = polar(from, radius)
  const [x1, y1] = polar(to, radius)
  return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${radius} ${radius} 0 ${to - from > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`
}

// the zone segments along the scale: [from, to, colour] in degrees
const segments = (limits) => {
  const { min, max, errLow, warnLow, warnHigh, errHigh } = limits
  const cuts = [min, errLow, warnLow, warnHigh, errHigh, max]
    .filter((v) => v != null && v >= min && v <= max)
    .sort((a, b) => a - b)
  const out = []
  for (let i = 0; i < cuts.length - 1; i++) {
    if (cuts[i + 1] <= cuts[i]) continue
    const mid = (cuts[i] + cuts[i + 1]) / 2
    out.push([
      angleOf(limits, cuts[i]),
      angleOf(limits, cuts[i + 1]),
      GAUGE_ZONE_COLORS[zoneAt(mid, limits)],
    ])
  }
  return out
}

const fmt = (v, d) =>
  v === null || v === undefined || Number.isNaN(Number(v)) ? '-' : Number(v).toFixed(d)

const RoundGauge = ({
  x,
  y,
  r,
  value,
  limits,
  unit,
  decimals = 1,
  label,
  inner,
  state = 'active',
}) => {
  const muted = state === 'absent' || state === 'inactive' ? GAUGE_MUTED_COLORS[state] : null
  const hasValue = state !== 'absent' && value != null && !Number.isNaN(Number(value))
  const zone = hasValue ? zoneAt(value, limits) : 'green'
  const rim = muted ?? GAUGE_ZONE_COLORS[zone]
  const ink = muted ?? (zone === 'red' ? GAUGE_ZONE_COLORS.red : GAUGE_INK)
  const fs = r * 0.27
  // the outer scale's band: its radius and width (the zero mark exactly across it)
  const band = { r: r * (inner ? 0.74 : 0.72), w: r * (inner ? 0.15 : 0.2) }
  const zeroAt = (radius) => polar(angleOf(limits, 0), radius)
  const needle = (lim, v, length, color, width) => {
    const [nx, ny] = polar(angleOf(lim, v), length)
    return (
      <line
        x1="0"
        y1="0"
        x2={nx}
        y2={ny}
        stroke={color}
        strokeWidth={width}
        strokeLinecap="round"
      />
    )
  }
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle r={r} fill="#ffffff" stroke={rim} strokeWidth={r * 0.08} />
      {segments(limits).map(([a, b, color]) => (
        <path
          key={`o${a}`}
          d={arc(a, b, band.r)}
          fill="none"
          stroke={muted ?? color}
          strokeWidth={band.w}
        />
      ))}
      {limits.min < 0 && limits.max > 0 && (
        // a scale both ways (+ in / - out): its zero marked across the band, no wider than it
        <line
          x1={zeroAt(band.r - band.w / 2)[0]}
          y1={zeroAt(band.r - band.w / 2)[1]}
          x2={zeroAt(band.r + band.w / 2)[0]}
          y2={zeroAt(band.r + band.w / 2)[1]}
          stroke={muted ?? GAUGE_INK}
          strokeWidth={r * 0.04}
        />
      )}
      {inner &&
        segments(inner.limits).map(([a, b, color]) => (
          <path
            key={`i${a}`}
            d={arc(a, b, r * 0.5)}
            fill="none"
            stroke={muted ?? color}
            strokeOpacity="0.75"
            strokeWidth={r * 0.08}
          />
        ))}
      {inner &&
        state !== 'absent' &&
        inner.value != null &&
        needle(inner.limits, Number(inner.value), r * 0.5, muted ?? inner.color, r * 0.045)}
      {hasValue && needle(limits, Number(value), r * 0.72, ink, r * 0.065)}
      <circle r={r * 0.08} fill={ink} />
      {inner ? (
        <text y={r * 0.46} textAnchor="middle" fontWeight="700" fontSize={fs} fill={ink}>
          {hasValue ? fmt(value, decimals) : '-'}
          <tspan fontSize={fs * 0.55} fontWeight="500" dx={fs * 0.12}>
            {unit}
          </tspan>
        </text>
      ) : (
        // a single scale (2026-10-22, as the aquarium's): the figure larger, its unit on its own line under it
        <>
          <text y={r * 0.5} textAnchor="middle" fontWeight="700" fontSize={fs * 1.15} fill={ink}>
            {hasValue ? fmt(value, decimals) : '-'}
          </text>
          {unit && !label && (
            <text
              y={r * 0.8}
              textAnchor="middle"
              fontWeight="500"
              fontSize={fs * 0.6}
              fill={muted ?? '#5d6878'}
            >
              {unit}
            </text>
          )}
        </>
      )}
      {inner && (
        <text
          y={r * 0.46 + fs * 0.85}
          textAnchor="middle"
          fontWeight="600"
          fontSize={fs * 0.62}
          fill={muted ?? inner.color}
        >
          {fmt(inner.value, inner.decimals ?? decimals)}
          <tspan fontSize={fs * 0.42} dx={fs * 0.08}>
            {inner.unit}
          </tspan>
        </text>
      )}
      {label && (
        <text
          y={r * (inner ? 0.86 : 0.8)}
          textAnchor="middle"
          fontSize={r * 0.15}
          fill={muted ?? '#5d6878'}
        >
          {label}
        </text>
      )}
    </g>
  )
}

export default RoundGauge
