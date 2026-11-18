import React, { useLayoutEffect, useState } from 'react'
import { HoverMarks, hoverTime, hoverValue, useChartHover } from 'src/components/charts/ChartHover'

// One of the mockup popups' charts (step 2): today's curves in the core charts' look - two grey lines, the
// hours under it, "now" in red, the hover line with the values. `lines` - [{ label, color, points, dashed }];
// `unit` - the readout's; drawn at the box's real width.

const H = 190
const PAD = { left: 40, right: 8, top: 10, bottom: 22 }

const MockChart = ({ title, unit, lines, now }) => {
  const [box, setBox] = useState(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    if (!box) return undefined
    const ro = new ResizeObserver(([e]) => setWidth(Math.round(e.contentRect.width)))
    ro.observe(box)
    return () => ro.disconnect()
  }, [box])
  const W = Math.max(320, width)
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  const t0 = start.getTime()
  const t1 = t0 + 86_400_000
  const [hoverT, hoverProps] = useChartHover({
    W,
    left: PAD.left,
    right: PAD.right,
    t0,
    t1,
    last: now,
  })
  const vs0 = lines.flatMap((l) => l.points.map((p) => p.v))
  // no points yet (a series just declared) - an empty 0..1 frame
  const vs = vs0.length ? vs0 : [0, 1]
  const min = Math.min(...vs)
  const max = Math.max(...vs)
  // from zero, unless the values sit far from it (a bath at 20 °C, a pH of 7) - then round their range
  const far = min > 0 && min > max * 0.5
  const lo = far ? min - (max - min || 1) * 0.6 : Math.min(0, min)
  const hi = far ? max + (max - min || 1) * 0.6 : max * 1.08 || 1
  const x = (t) => PAD.left + ((t - t0) / (t1 - t0)) * (W - PAD.left - PAD.right)
  const y = (v) => PAD.top + ((hi - v) / (hi - lo || 1)) * (H - PAD.top - PAD.bottom)
  const at = (pts, t) => {
    let found = null
    for (const p of pts) {
      if (p.t > t) break
      found = p
    }
    return found
  }
  return (
    <div ref={setBox}>
      <div className="small d-flex flex-wrap gap-3">
        <span>{title}</span>
        {lines.length > 1 &&
          lines.map((l) => (
            <span key={l.label} style={{ color: l.color }}>
              {l.dashed ? '- - ' : '— '}
              {l.label}
            </span>
          ))}
      </div>
      {width > 0 && (
        <svg width={W} height={H} role="img" aria-label={title} {...hoverProps}>
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
          <text x={4} y={PAD.top + 4} fontSize="10" fill="var(--cui-secondary-color)">
            {+hi.toFixed(Math.abs(hi) >= 100 ? 0 : 1)}
          </text>
          <text x={4} y={H - PAD.bottom + 4} fontSize="10" fill="var(--cui-secondary-color)">
            {+lo.toFixed(Math.abs(lo) >= 100 ? 0 : 1)}
          </text>
          {lines.map((l) => (
            <path
              key={l.label}
              d={l.points
                .map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)} ${y(p.v).toFixed(1)}`)
                .join(' ')}
              fill="none"
              stroke={l.color}
              strokeWidth="2"
              strokeDasharray={l.dashed ? '6 4' : undefined}
            />
          ))}
          <line
            x1={x(now)}
            x2={x(now)}
            y1={PAD.top}
            y2={H - PAD.bottom}
            stroke="var(--cui-danger)"
            strokeWidth="1.2"
          />
          {hoverT !== null && (
            <HoverMarks
              x={x(hoverT)}
              top={PAD.top}
              bottom={H - PAD.bottom}
              W={W}
              right={PAD.right}
              title={hoverTime(hoverT)}
              rows={lines
                .map((l) => ({ l, p: at(l.points, hoverT) }))
                .filter((r) => r.p)
                .map(({ l, p }) => ({
                  label: lines.length > 1 ? l.label : null,
                  value: `${hoverValue(p.v)} ${unit}`,
                  color: l.color,
                  y: y(p.v),
                }))}
            />
          )}
        </svg>
      )}
    </div>
  )
}

export default MockChart
