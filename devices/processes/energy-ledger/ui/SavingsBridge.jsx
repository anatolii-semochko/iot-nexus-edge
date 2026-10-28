import React from 'react'

// The savings bridge (a waterfall): "without the system" - the full bar,
// each saving a step down (green), what was really paid - the last bar; the
// figures on the bars, the names below, each bar's explanation on hover.
// `unit` 'eur' | 'kwh'. Pure SVG, the container's width.

const W = 760
const H = 260
const PAD = { left: 12, right: 12, top: 28, bottom: 48 }

const fmtValue = (v, unit) =>
  unit === 'eur'
    ? `${v < 0 ? '−' : ''}${Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
    : `${v < 0 ? '−' : ''}${Math.abs(v).toLocaleString(undefined, { maximumFractionDigits: 0 })} kWh`

const SavingsBridge = ({ steps, unit = 'eur' }) => {
  const val = (s) => (unit === 'eur' ? s.eur : s.kwh)
  // the running level after each step
  const bars = steps.reduce((acc, s, i) => {
    const v = val(s)
    if (i === 0 || s.key === 'actual') return [...acc, { ...s, v, from: 0, to: v }]
    const from = acc[acc.length - 1].to
    return [...acc, { ...s, v, from, to: from + v }]
  }, [])
  const max = Math.max(1, ...bars.map((b) => Math.max(b.from, b.to)))
  const min = Math.min(0, ...bars.map((b) => Math.min(b.from, b.to)))
  const plotH = H - PAD.top - PAD.bottom
  const y = (v) => PAD.top + ((max - v) / (max - min)) * plotH
  const slot = (W - PAD.left - PAD.right) / bars.length
  const barW = Math.min(90, slot * 0.62)
  const color = (b) =>
    b.key === 'without'
      ? '#8a96a8'
      : b.key === 'actual'
        ? '#1d6fd8'
        : b.v <= 0
          ? '#1f9d63'
          : '#d93b3b'
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      role="img"
      aria-label={`Savings bridge: ${bars.map((b) => `${b.label} ${fmtValue(b.v, unit)}`).join(', ')}`}
    >
      <line x1={PAD.left} x2={W - PAD.right} y1={y(0)} y2={y(0)} stroke="var(--cui-border-color)" />
      {bars.map((b, i) => {
        const cx = PAD.left + slot * i + slot / 2
        const top = y(Math.max(b.from, b.to))
        const h = Math.max(2, Math.abs(y(b.from) - y(b.to)))
        const next = bars[i + 1]
        return (
          <g key={b.key}>
            <title>{`${b.label}: ${fmtValue(b.v, unit)} - ${b.hint}`}</title>
            <rect x={cx - barW / 2} y={top} width={barW} height={h} rx="3" fill={color(b)} />
            {next && next.key !== 'actual' && (
              <line
                x1={cx + barW / 2}
                x2={cx + slot - barW / 2}
                y1={y(b.to)}
                y2={y(b.to)}
                stroke="var(--cui-secondary-color)"
                strokeDasharray="3 3"
              />
            )}
            <text
              x={cx}
              y={top - 8}
              textAnchor="middle"
              fontSize="14"
              fontWeight="600"
              fill="var(--cui-body-color)"
            >
              {fmtValue(b.v, unit)}
            </text>
            <text
              x={cx}
              y={H - PAD.bottom + 20}
              textAnchor="middle"
              fontSize="13"
              fill="var(--cui-secondary-color)"
            >
              {b.label}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

export default SavingsBridge
