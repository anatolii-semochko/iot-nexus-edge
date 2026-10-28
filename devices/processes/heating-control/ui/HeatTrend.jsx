import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { CButton, CButtonGroup } from '@coreui/react'
import { request } from 'src/api/client'
import { useNow } from 'src/hooks/useNow'

// A heat flow over time beside its water lines (the user's mockup images/fix-heat-streams.png,
// 2026-10-24): the heat pumps' heat into the tanks, the consumers' heat out of them - the last
// day or the last week (a switch), stretched to the scene's right edge; a light body between two
// grey lines (the weather widgets' look), the curve, the times under it, the peak in a corner.

// the scales: how far back, the points asked for, the labels
const SPANS = [
  { key: 'day', label: 'Day', hint: 'The last 24 hours', ms: 86_400_000, points: 288 },
  { key: 'week', label: 'Week', hint: 'The last 7 days', ms: 7 * 86_400_000, points: 336 },
]
// re-read this often (the series are written every 5 minutes)
const RELOAD_MS = 5 * 60_000
const HOUR_LABEL_EVERY = 6
// more than this many points' time between two readings - a gap
const GAP_STEPS = 3

const TREND_CSS = `
.ht-trend { display: flex; flex-direction: column; gap: 4px; min-width: 0 }
.ht-trend-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; font-size: .8rem; color: var(--ht-muted) }
.ht-trend-body { position: relative; flex: 1 1 auto; min-height: 60px;
  background: color-mix(in srgb, var(--cui-body-color) 3%, transparent);
  border-top: 1px solid var(--ht-line); border-bottom: 1px solid var(--ht-line) }
.ht-trend-body > svg { position: absolute; inset: 0; width: 100%; height: 100% }
.ht-trend-times { position: relative; height: 1.4em; font-size: .8rem; color: var(--ht-muted) }
.ht-trend-times > span { position: absolute; top: 0; transform: translateX(-50%); white-space: nowrap }
`

// a practical upper limit above v: a multiple of half its decade (as the series charts)
const niceLimit = (v) => {
  if (!(v > 0)) return 1
  const half = 10 ** Math.floor(Math.log10(v * 1.05)) / 2
  return Math.ceil((v * 1.05) / half) * half
}

/** The times under the curve: every few hours over a day, each day over a week. */
const timesOf = (t0, t1, span) => {
  const out = []
  const c = new Date(t0)
  if (span === 'day') {
    c.setMinutes(0, 0, 0)
    while (c.getTime() < t0 || c.getHours() % HOUR_LABEL_EVERY !== 0) c.setHours(c.getHours() + 1)
    for (; c.getTime() <= t1; c.setHours(c.getHours() + HOUR_LABEL_EVERY))
      out.push({ t: c.getTime(), text: String(c.getHours()).padStart(2, '0') })
    return out
  }
  c.setHours(12, 0, 0, 0)
  if (c.getTime() < t0) c.setDate(c.getDate() + 1)
  for (; c.getTime() <= t1; c.setDate(c.getDate() + 1))
    out.push({ t: c.getTime(), text: c.toLocaleDateString([], { weekday: 'short' }) })
  return out
}

/**
 * `seriesKey` - the series (kW), `label` - what it is, `color` - the curve's. Fills its
 * container's height.
 */
const HeatTrend = ({ seriesKey, label, color }) => {
  const [span, setSpan] = useState(SPANS[0])
  const [points, setPoints] = useState(null)
  const [readAt, setReadAt] = useState(null)
  const tick = useNow(RELOAD_MS)
  const bodyRef = useRef(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const el = bodyRef.current
    if (!el) return undefined
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  useEffect(() => {
    let cancelled = false
    const now = Date.now()
    request(
      `/series/data?keys=${encodeURIComponent(seriesKey)}&from=${now - span.ms}&to=${now}&points=${span.points}`,
    )
      .then((d) => {
        if (cancelled) return
        setPoints(d.series?.[seriesKey] ?? [])
        setReadAt(now)
      })
      .catch(() => !cancelled && setPoints([]))
    return () => {
      cancelled = true
    }
  }, [seriesKey, span, tick])
  const t1 = readAt ?? 0
  const t0 = t1 - span.ms
  const vs = (points ?? []).map((p) => Math.abs(p.v))
  const peak = vs.length ? Math.max(...vs) : 0
  const top = niceLimit(peak)
  const x = (t) => ((t - t0) / (t1 - t0 || 1)) * 1000
  const y = (v) => 96 - (Math.max(0, Math.min(top, Math.abs(v))) / top) * 90
  // a gap in the history (the site was off) stays a gap - no straight line across it
  const gapMs = (span.ms / span.points) * GAP_STEPS
  const d = (points ?? [])
    .map(
      (p, i, all) =>
        `${i && p.t - all[i - 1].t <= gapMs ? 'L' : 'M'}${x(p.t).toFixed(1)} ${y(p.v).toFixed(1)}`,
    )
    .join(' ')
  return (
    <div className="ht-trend" title={`${label} - ${span.hint.toLowerCase()}`}>
      <style>{TREND_CSS}</style>
      <div className="ht-trend-head">
        <span>
          {label}, kW{peak > 0 && ` - peak ${peak.toFixed(1)}`}
        </span>
        <CButtonGroup size="sm" role="group" aria-label={`${label} - the scale`}>
          {SPANS.map((s) => (
            <CButton
              key={s.key}
              color="secondary"
              variant={s.key === span.key ? undefined : 'outline'}
              aria-pressed={s.key === span.key}
              title={s.hint}
              onClick={() => setSpan(s)}
              style={{ padding: '0 8px', fontSize: '.75rem' }}
            >
              {s.label}
            </CButton>
          ))}
        </CButtonGroup>
      </div>
      <div ref={bodyRef} className="ht-trend-body">
        <svg
          viewBox="0 0 1000 100"
          preserveAspectRatio="none"
          role="img"
          aria-label={`${label} - ${span.hint.toLowerCase()}`}
        >
          {d && (
            <path
              d={d}
              fill="none"
              stroke={color}
              strokeWidth="2.5"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>
        {points && points.length === 0 && (
          <span className="position-absolute top-50 start-50 translate-middle small text-body-secondary">
            No history yet
          </span>
        )}
      </div>
      <div className="ht-trend-times">
        {width > 0 &&
          readAt !== null &&
          timesOf(t0, t1, span.key).map((tk) => (
            <span key={tk.t} style={{ left: `${x(tk.t) / 10}%` }}>
              {tk.text}
            </span>
          ))}
      </div>
    </div>
  )
}

export default HeatTrend
