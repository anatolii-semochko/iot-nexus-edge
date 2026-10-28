import React, { useEffect, useState } from 'react'
import { CSpinner } from '@coreui/react'
import { request } from 'src/api/client'

// Today's lines of the given time series (GET /series/data) - one chart per
// key, one under another, each on its own Y axis (AGENTS_TO_DO.md
// 2026-10-22 C, images/device-diagrams.png); `labels` - each chart's name
// (e.g. "State of charge, %"); "now" marked; the lower and the upper
// limit lines at practical values. Pure SVG, the container's
// width. Shared by the packages' scenes (moved from energy-field's UI
// 2026-10-20). `signed` - the keys of values that swing both ways (grid
// import / export, battery discharge / charge, a tank's charge / give-back):
// their zero in the middle, the range the same up and down, the zero line
// drawn (the user, 2026-10-24). `limits` - per key the lines a person should know (the user, 2026-10-25):
// [{ value | points: [{ t, v }], level: 'warning' (yellow) | 'critical' (red), label }] - dashed, light;
// one far above the day's values is named at the chart's edge instead of flattening the curve.
// `absolute` - the keys drawn by their size (a power one way, its sign only the direction).
const W = 680
const H = 130
const PAD = { left: 40, right: 8, top: 10, bottom: 22 }
const COLORS = ['var(--cui-success)', 'var(--cui-info)', 'var(--cui-warning)', 'var(--cui-primary)']
const HEADROOM = 1.05 // the curve's peak stays below the upper limit line
const POINTS = 288 // the points asked for over the day
const GAP_STEPS = 3 // more than this many points' time between two readings - a gap, not a line

// A practical axis limit above |v| (AGENTS_TO_DO.md 2026-10-23, heating 1):
// a multiple of half its decade - 53 -> 60, 3.9 -> 4.5, 21 -> 25.
const niceLimit = (v) => {
  const a = Math.abs(v) * HEADROOM
  if (a === 0) return 0
  const half = 10 ** Math.floor(Math.log10(a)) / 2
  return Math.sign(v) * Math.ceil(a / half) * half
}

const LIMIT_COLORS = { warning: 'var(--cui-warning)', critical: 'var(--cui-danger)' }
const LIMIT_REACH = 2 // a limit within this many times the day's reach widens the axis to show it

const SeriesChart = ({ keys, labels = [], signed = [], limits = {}, absolute = [] }) => {
  const [series, setSeries] = useState(null)
  const [error, setError] = useState(null)
  // "now" - when the data was read (a render stays pure)
  const [readAt, setReadAt] = useState(null)
  const joined = keys.filter(Boolean).join(',')
  useEffect(() => {
    let cancelled = false
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    const now = Date.now()
    request(
      `/series/data?keys=${encodeURIComponent(joined)}&from=${start.getTime()}&to=${now}&points=${POINTS}`,
    )
      .then((d) => {
        if (cancelled) return
        setSeries(d.series ?? {})
        setReadAt(now)
      })
      .catch((err) => !cancelled && setError(err.message))
    return () => {
      cancelled = true
    }
  }, [joined])
  if (error) return <div className="small text-body-secondary">No history: {error}</div>
  if (!series) return <CSpinner size="sm" />
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const t0 = start.getTime()
  const t1 = t0 + 86_400_000
  const x = (t) => PAD.left + ((t - t0) / (t1 - t0)) * (W - PAD.left - PAD.right)
  // a gap in the history (the site was off) stays a gap
  const gapMs = ((t1 - t0) / POINTS) * GAP_STEPS
  const lines = joined.split(',').map((key, i) => {
    // `absolute` - a power counted one way (a heat pump's heat or cold): its size, up from zero
    const pts = absolute.includes(key)
      ? (series[key] ?? []).map((p) => ({ ...p, v: Math.abs(p.v) }))
      : (series[key] ?? [])
    const data = pts.map((p) => p.v)
    const both = signed.includes(key)
    const own = limits[key] ?? []
    const dataReach = Math.max(1e-9, ...data.map((v) => Math.abs(v)))
    // the limits near the day's values widen the axis; the far ones are only named
    const near = (v) => Math.abs(v) <= dataReach * LIMIT_REACH
    const limitValues = own
      .flatMap((l) => (l.points ? l.points.map((p) => p.v) : [l.value]))
      .filter(near)
    const vs = [...data, ...limitValues]
    const reach = niceLimit(Math.max(0, ...vs.map((v) => Math.abs(v)))) || 1
    const min = both ? -reach : niceLimit(Math.min(0, ...vs))
    const max = both ? reach : niceLimit(Math.max(0, ...vs)) || 1
    const y = (v) => PAD.top + ((max - v) / (max - min)) * (H - PAD.top - PAD.bottom)
    return {
      key,
      color: COLORS[i % COLORS.length],
      label: labels[i],
      min,
      max,
      // the zero line - in the middle for a signed series, wherever zero falls when the values cross it
      zeroY: min < 0 && max > 0 ? y(0) : null,
      limits: own.map((l, k, all) => ({
        // the far ones named at the edge, one under another (above - down from the top, below - up)
        row: l.points
          ? 0
          : all
              .slice(0, k)
              .filter(
                (o) => !o.points && !near(o.value) && Math.sign(o.value) === Math.sign(l.value),
              ).length,
        key: k,
        color: LIMIT_COLORS[l.level] ?? LIMIT_COLORS.warning,
        label: l.label,
        far: l.points ? false : !near(l.value),
        value: l.value,
        y: l.points ? null : y(Math.max(min, Math.min(max, l.value))),
        path: l.points
          ? l.points
              .filter((p) => p.t >= t0 && p.t <= t1)
              .map(
                (p, j) =>
                  `${j ? 'L' : 'M'}${x(p.t).toFixed(1)} ${y(Math.max(min, Math.min(max, p.v))).toFixed(1)}`,
              )
              .join(' ')
          : null,
      })),
      path: pts
        .map(
          (p, j) =>
            `${j && p.t - pts[j - 1].t <= gapMs ? 'L' : 'M'}${x(p.t).toFixed(1)} ${y(p.v).toFixed(1)}`,
        )
        .join(' '),
    }
  })
  if (lines.every((l) => !l.path))
    return <div className="small text-body-secondary">No points yet today.</div>
  return (
    <div className="d-grid gap-2">
      {lines.map((l) => (
        <div key={l.key}>
          {l.label && (
            <div className="small" style={{ color: l.color }}>
              {l.label}
            </div>
          )}
          <svg
            viewBox={`0 0 ${W} ${H}`}
            style={{ width: '100%', height: 'auto', display: 'block' }}
            role="img"
            aria-label={`Today's history${l.label ? ` - ${l.label}` : ''}`}
          >
            {[PAD.top, H - PAD.bottom].map((ly) => (
              <line
                key={ly}
                x1={PAD.left}
                x2={W - PAD.right}
                y1={ly}
                y2={ly}
                stroke="var(--cui-border-color)"
              />
            ))}
            {[0, 6, 12, 18, 24].map((h) => (
              <text
                key={h}
                x={x(t0 + h * 3_600_000)}
                y={H - 6}
                fontSize="10"
                textAnchor="middle"
                fill="var(--cui-secondary-color)"
              >
                {String(h).padStart(2, '0')}
              </text>
            ))}
            {l.zeroY !== null && (
              <>
                <line
                  x1={PAD.left}
                  x2={W - PAD.right}
                  y1={l.zeroY}
                  y2={l.zeroY}
                  stroke="var(--cui-secondary-color)"
                  strokeDasharray="4 3"
                />
                <text x={4} y={l.zeroY + 4} fontSize="10" fill={l.color}>
                  0
                </text>
              </>
            )}
            {l.limits.map((lim) =>
              lim.far ? (
                <text
                  key={lim.key}
                  x={W - PAD.right - 4}
                  y={
                    lim.value > 0 ? PAD.top + 11 + lim.row * 11 : H - PAD.bottom - 4 - lim.row * 11
                  }
                  fontSize="10"
                  textAnchor="end"
                  fill={lim.color}
                >
                  {lim.value > 0 ? '\u2191' : '\u2193'} {lim.label} {+lim.value.toFixed(1)}
                </text>
              ) : (
                <g key={lim.key} opacity="0.85">
                  {lim.path !== null ? (
                    <path
                      d={lim.path}
                      fill="none"
                      stroke={lim.color}
                      strokeWidth="1.3"
                      strokeDasharray="6 4"
                    />
                  ) : (
                    <line
                      x1={PAD.left}
                      x2={W - PAD.right}
                      y1={lim.y}
                      y2={lim.y}
                      stroke={lim.color}
                      strokeWidth="1.3"
                      strokeDasharray="6 4"
                    />
                  )}
                  {lim.label && lim.path === null && (
                    <text
                      x={W - PAD.right - 4}
                      y={lim.y - 3}
                      fontSize="10"
                      textAnchor="end"
                      fill={lim.color}
                    >
                      {lim.label}
                    </text>
                  )}
                </g>
              ),
            )}
            <path d={l.path} fill="none" stroke={l.color} strokeWidth="2" />
            <text x={4} y={PAD.top + 4} fontSize="10" fill={l.color}>
              {+l.max.toFixed(1)}
            </text>
            <text x={4} y={H - PAD.bottom + 4} fontSize="10" fill={l.color}>
              {+l.min.toFixed(1)}
            </text>
            <line
              x1={x(readAt)}
              x2={x(readAt)}
              y1={PAD.top}
              y2={H - PAD.bottom}
              stroke="var(--cui-danger)"
              strokeWidth="1.2"
            />
          </svg>
          {l.limits.some((lim) => !lim.far && lim.label) && (
            <div className="d-flex flex-wrap gap-3 small" style={{ fontSize: '0.75rem' }}>
              {l.limits
                .filter((lim) => !lim.far && lim.label)
                .map((lim) => (
                  <span key={lim.key} style={{ color: lim.color }}>
                    <svg width="18" height="6" aria-hidden="true" className="me-1">
                      <line
                        x1="0"
                        x2="18"
                        y1="3"
                        y2="3"
                        stroke={lim.color}
                        strokeWidth="1.5"
                        strokeDasharray="5 3"
                      />
                    </svg>
                    {lim.label}
                  </span>
                ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

export default SeriesChart
