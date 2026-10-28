import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { CButton, CModal, CModalBody, CModalHeader, CModalTitle, CSpinner } from '@coreui/react'
import { request } from 'src/api/client'
import AiButton from 'src/components/ai/AiButton'
import SummaryLine from 'src/components/SummaryLine'
import { useNow } from 'src/hooks/useNow'
import AnemometerIcon from './anemometer/AnemometerIcon'
import { SkyIcon, skyAspect } from './SkyIcon'

// The weather widgets of the scenes (the energy field's sun and wind, the heating's outdoor
// temperature) in one style (the user's mockup images/fix-weather-widjet.png, 2026-10-24;
// moved here from energy-field the same day - the heating shows one too): the picture on the
// left at the content's full
// height, the big main figure and the texts on the right, the next hours' curve under them
// (a light opaque body between two grey lines, the hours under it on the card's own
// background) stretching to the right edge; all rubber. A narrow widget - the picture on top,
// the texts under it. A click on the curve - a wide popup: the detailed charts one under
// another, at a chosen scale (two days / a week / a month, each with the next day's forecast).

// a widget narrower than this (its content) stacks the picture over the texts
const NARROW_PX = 440
// the widget's height - its picture's: a heat pump's in the heating scene less 20 % (the user,
// 2026-10-24 - lower widgets); the texts' line on top, the curve in the rest
const WIDGET_PX = 112
// the picture's width at most this share of the widget (side by side) - else a wide picture
// would narrow the texts, they would wrap, grow taller and widen the picture again
const ICON_MAX_SHARE = 0.4
// a digit's width (em) - an hour's label kept inside the curve's width at its edges
const LABEL_DIGIT_EM = 0.6
// the anemometer's proportions (width / height - its strip's frame); the sky's - by its picture
const ANEMOMETER_ASPECT = 270 / 186
// the charts' body - a barely visible tint of the text colour (the user: light, 2026-10-24)
const CHART_TINT_PCT = 3
const CHART_TINT_HOVER_PCT = 6

const WIDGET_CSS = `
.wx-widget {
  --wx-line: var(--cui-border-color); --wx-muted: var(--cui-secondary-color);
  --wx-sun-line: #e8590c; --wx-wind-line: #1c7ed6; --wx-temp-line: #e5534b; --wx-humidity-line: #0f9a96;
  --wx-chart-bg: color-mix(in srgb, var(--cui-body-color) ${CHART_TINT_PCT}%, transparent);
  --wx-chart-hover: color-mix(in srgb, var(--cui-body-color) ${CHART_TINT_HOVER_PCT}%, transparent);
}
[data-coreui-theme='dark'] .wx-widget {
  --wx-sun-line: #ffb347; --wx-wind-line: #74c0fc; --wx-temp-line: #ff6b6b; --wx-humidity-line: #2fc4c0;
}
.wx-card { border: 1px solid var(--wx-line); border-radius: 12px; background: var(--cui-body-bg); padding: 14px 18px }
.wx-muted { color: var(--wx-muted) }
.wx-row { display: flex; gap: 16px; align-items: center }
.wx-row.wx-narrow { flex-direction: column; align-items: center; gap: 10px }
.wx-icon { flex: none; display: flex; align-items: center; justify-content: center }
.wx-body { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 2px; height: ${WIDGET_PX}px }
.wx-narrow .wx-body { width: 100% }
/* the texts - one line, only the main ones; what does not fit is cut, never wrapped */
.wx-line { display: flex; align-items: baseline; column-gap: 12px; white-space: nowrap; overflow: hidden; flex: none; flex-wrap: nowrap }
.wx-line .sum-figures { flex-wrap: nowrap }
.wx-curve { cursor: pointer; margin-top: 2px; border-radius: 2px; flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column }
.wx-curve:focus-visible { outline: 2px solid var(--cui-primary); outline-offset: 2px }
.wx-curve-body { position: relative; flex: 1 1 auto; min-height: 24px; background: var(--wx-chart-bg);
  border-top: 1px solid var(--wx-line); border-bottom: 1px solid var(--wx-line) }
.wx-curve-body > svg { position: absolute; inset: 0; width: 100%; height: 100% }
.wx-curve-hours { position: relative; height: 1.5em; flex: none; color: var(--wx-muted); font-size: 0.8em }
.wx-curve-hours > span { position: absolute; top: 2px; transform: translateX(-50%) }
.wx-curve:hover .wx-curve-body { background: var(--wx-chart-hover) }
`

/** The element's content box, followed (ResizeObserver). */
const useSize = (ref) => {
  const [size, setSize] = useState({ width: 0, height: 0 })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return undefined
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect
      setSize((s) => (s.width === width && s.height === height ? s : { width, height }))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return size
}

/** A smooth path (Catmull-Rom as cubic Beziers) through the points. */
const smoothPath = (pts) => {
  if (pts.length < 2) return ''
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[Math.min(pts.length - 1, i + 2)]
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]
    d += ` C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`
  }
  return d
}

// the widgets' curve: the last day and the next (the user, 2026-10-24) - the past half, the
// forecast half, "now" in the middle; the hours labelled every few by the clock
const CURVE_HALF_MS = 24 * 3_600_000
const CURVE_LABEL_EVERY_H = 6

// one hourly point past each edge - the curve then runs from the very edge (the box cuts it)
const CURVE_EDGE_MS = 3_600_000

/** The forecast's hours around now - the last day and the next (the forecast keeps a past day). */
export const dayAround = (forecast, now) =>
  (forecast?.hourly ?? []).filter(
    (h) => h.t >= now - CURVE_HALF_MS - CURVE_EDGE_MS && h.t <= now + CURVE_HALF_MS + CURVE_EDGE_MS,
  )

/**
 * The last day and the next as a smooth curve: a light body between two grey lines, "now" a
 * dashed line in the middle, the hours under it. Stretches to its container (the body drawn in
 * a 1000 x 100 box, the text in HTML - never stretched). `onOpen` - a click / Enter opens the
 * detailed charts.
 */
const HourCurve = ({ hours, now, value, min, max, color, label, onOpen }) => {
  if (hours.length < 2) return null
  const t0 = now - CURVE_HALF_MS
  const t1 = now + CURVE_HALF_MS
  const xs = (t) => (t - t0) / (t1 - t0)
  const y = (v) => 92 - ((Math.min(max, Math.max(min, v)) - min) / (max - min || 1)) * 84
  const d = smoothPath(hours.map((h) => [xs(h.t) * 1000, y(value(h))]))
  // the labels by the clock (a daylight-saving day has 23 or 25 hours)
  const ticks = []
  const c = new Date(t0)
  c.setMinutes(0, 0, 0)
  while (c.getTime() < t0 || c.getHours() % CURVE_LABEL_EVERY_H !== 0) c.setHours(c.getHours() + 1)
  for (; c.getTime() <= t1; c.setHours(c.getHours() + CURVE_LABEL_EVERY_H))
    ticks.push({ t: c.getTime(), h: c.getHours() })
  // the curve runs edge to edge; a label at an edge is moved in, never out of the curve's width
  const half = (h) => (String(h).length * LABEL_DIGIT_EM) / 2
  return (
    <div
      className="wx-curve"
      role="button"
      tabIndex={0}
      title={`${label} - open the detailed chart`}
      aria-label={`${label} - open the detailed chart`}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen()
        }
      }}
    >
      <div className="wx-curve-body">
        <svg viewBox="0 0 1000 100" preserveAspectRatio="none" aria-hidden="true">
          <line
            x1={xs(now) * 1000}
            x2={xs(now) * 1000}
            y1="0"
            y2="100"
            stroke="var(--wx-muted)"
            strokeDasharray="3 3"
            vectorEffect="non-scaling-stroke"
          />
          <path
            d={d}
            fill="none"
            stroke={color}
            strokeWidth="2.5"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </div>
      <div className="wx-curve-hours">
        {ticks.map((tk) => (
          <span
            key={tk.t}
            style={{
              left: `clamp(${half(tk.h)}em, ${xs(tk.t) * 100}%, calc(100% - ${half(tk.h)}em))`,
            }}
          >
            {tk.h}
          </span>
        ))}
      </div>
    </div>
  )
}

/**
 * A weather widget's frame: `icon(height)` - the picture at that height, `aspect` - its width /
 * height; the picture `WIDGET_PX` high, the texts' line and the curve beside it as high; the
 * picture on top when narrow.
 * `cardClass` - the scene's own card frame (its blocks' look), else `wx-card`.
 */
const WeatherCard = ({ icon, aspect, cardClass = 'wx-card', children }) => {
  const cardRef = useRef(null)
  const card = useSize(cardRef)
  const narrow = card.width > 0 && card.width < NARROW_PX
  const height = Math.min(
    WIDGET_PX,
    narrow ? card.width / aspect : (card.width * ICON_MAX_SHARE) / aspect,
  )
  return (
    <section className={`wx-widget ${cardClass}`}>
      <div ref={cardRef} className={`wx-row${narrow ? ' wx-narrow' : ''}`}>
        <div className="wx-icon" style={{ width: height * aspect, height }}>
          {card.width > 0 && icon(height)}
        </div>
        <div className="wx-body">{children}</div>
      </div>
    </section>
  )
}

// ---- the popup: the detailed charts -------------------------------------------------------

const DAY_MS = 86_400_000
// the scales: the past shown (from), the history's days asked for, the forecast ahead
const RANGES = [
  {
    key: '2d',
    label: 'Two days',
    hint: 'The last 24 hours and the next 24 - the forecast',
    days: 1,
    from: (now) => now - DAY_MS,
  },
  {
    key: 'week',
    label: 'Week',
    hint: 'Seven days and today, the next day - the forecast',
    days: 7,
    from: (now) => {
      const d = new Date(now)
      d.setHours(0, 0, 0, 0)
      return d.getTime() - 7 * DAY_MS
    },
  },
  {
    key: 'month',
    label: 'Month',
    hint: 'The last month and today, the next day - the forecast',
    days: 31,
    from: (now) => {
      const d = new Date(now)
      d.setHours(0, 0, 0, 0)
      d.setMonth(d.getMonth() - 1)
      return d.getTime()
    },
  },
]
const FORECAST_AHEAD_MS = DAY_MS

const CHART_H = 150
// the forecast's word only where its band has room for it
const FORECAST_LABEL_PX = 60
const PAD = { left: 44, right: 10, top: 10, bottom: 24 }

// a practical axis limit above |v|: a multiple of half its decade (as the scenes' series charts)
const niceLimit = (v) => {
  const a = Math.abs(v) * 1.05
  if (a === 0) return 0
  const half = 10 ** Math.floor(Math.log10(a)) / 2
  return Math.sign(v) * Math.ceil(a / half) * half
}

/** The x axis's ticks for the span: hours over two days, days over a week, every few days over a month. */
const ticksOf = (t0, t1) => {
  const span = t1 - t0
  const out = []
  if (span <= 3 * DAY_MS) {
    // by the clock, not by fixed 6 h steps - a daylight-saving day has 23 or 25 hours
    const d = new Date(t0)
    d.setMinutes(0, 0, 0)
    if (d.getTime() < t0) d.setHours(d.getHours() + 1)
    while (d.getHours() % 6 !== 0) d.setHours(d.getHours() + 1)
    for (; d.getTime() <= t1; d.setHours(d.getHours() + 6)) {
      out.push({
        t: d.getTime(),
        text:
          d.getHours() === 0
            ? d.toLocaleDateString([], { weekday: 'short', day: 'numeric' })
            : String(d.getHours()).padStart(2, '0'),
        day: d.getHours() === 0,
      })
    }
    return out
  }
  const everyDays = span <= 10 * DAY_MS ? 1 : 4
  const d = new Date(t0)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + 1)
  for (let i = 0; d.getTime() <= t1; i++, d.setDate(d.getDate() + 1)) {
    if (i % everyDays === 0)
      out.push({
        t: d.getTime(),
        text:
          everyDays === 1
            ? d.toLocaleDateString([], { weekday: 'short', day: 'numeric' })
            : d.toLocaleDateString([], { day: 'numeric', month: 'short' }),
        day: true,
      })
  }
  return out
}

/**
 * One detailed chart: `lines` [{ key, label, color, dots? }] over `rows` ({ t, ...values }),
 * `t0` .. `t1`, `now` marked and the forecast after it shaded; `min` / `max` fixed or nice.
 */
const TimeChart = ({ title, unit, rows, lines, t0, t1, now, min, max }) => {
  const ref = useRef(null)
  const { width } = useSize(ref)
  const W = Math.max(320, width)
  const vs = rows.flatMap((r) => lines.map((l) => r[l.key])).filter((v) => typeof v === 'number')
  const lo = min ?? niceLimit(Math.min(0, ...vs))
  const hi = max ?? (niceLimit(Math.max(0, ...vs)) || 1)
  const x = (t) => PAD.left + ((t - t0) / (t1 - t0)) * (W - PAD.left - PAD.right)
  const y = (v) => PAD.top + ((hi - v) / (hi - lo || 1)) * (CHART_H - PAD.top - PAD.bottom)
  const nowX = x(now)
  return (
    <div>
      <div className="d-flex gap-3 small flex-wrap">
        <span className="fw-semibold">{title}</span>
        {lines.length > 1 &&
          lines.map((l) => (
            <span key={l.key} style={{ color: l.color }}>
              {l.dashed ? '- - ' : '— '}
              {l.label}
            </span>
          ))}
      </div>
      <div ref={ref}>
        {width > 0 && (
          <svg width={W} height={CHART_H} role="img" aria-label={`${title}, ${unit}`}>
            <rect
              x={nowX}
              y={PAD.top}
              width={Math.max(0, W - PAD.right - nowX)}
              height={CHART_H - PAD.top - PAD.bottom}
              fill="var(--wx-chart-bg)"
            />
            {[PAD.top, CHART_H - PAD.bottom].map((ly) => (
              <line
                key={ly}
                x1={PAD.left}
                x2={W - PAD.right}
                y1={ly}
                y2={ly}
                stroke="var(--wx-line)"
              />
            ))}
            {ticksOf(t0, t1).map((tk) => (
              <g key={tk.t}>
                {tk.day && (
                  <line
                    x1={x(tk.t)}
                    x2={x(tk.t)}
                    y1={PAD.top}
                    y2={CHART_H - PAD.bottom}
                    stroke="var(--wx-line)"
                    strokeDasharray="2 3"
                  />
                )}
                <text
                  x={x(tk.t)}
                  y={CHART_H - 7}
                  fontSize="11"
                  textAnchor="middle"
                  fill="var(--wx-muted)"
                >
                  {tk.text}
                </text>
              </g>
            ))}
            {lines.map((l) => {
              const pts = rows
                .filter((r) => typeof r[l.key] === 'number')
                .map((r) => [x(r.t), y(r[l.key])])
              return l.dots ? (
                <g key={l.key} fill={l.color}>
                  {pts.map(([px, py], i) => (
                    <circle key={i} cx={px} cy={py} r="1.8" />
                  ))}
                </g>
              ) : (
                <path
                  key={l.key}
                  d={pts
                    .map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`)
                    .join(' ')}
                  fill="none"
                  stroke={l.color}
                  strokeWidth="2"
                  strokeDasharray={l.dashed ? '5 4' : undefined}
                  strokeLinejoin="round"
                />
              )
            })}
            <text x={4} y={PAD.top + 4} fontSize="11" fill="var(--wx-muted)">
              {+hi.toFixed(1)}
            </text>
            <text x={4} y={CHART_H - PAD.bottom + 4} fontSize="11" fill="var(--wx-muted)">
              {+lo.toFixed(1)}
            </text>
            <text
              x={4}
              y={(PAD.top + CHART_H - PAD.bottom) / 2 + 4}
              fontSize="11"
              fill="var(--wx-muted)"
            >
              {unit}
            </text>
            <line
              x1={nowX}
              x2={nowX}
              y1={PAD.top}
              y2={CHART_H - PAD.bottom}
              stroke="var(--cui-danger)"
              strokeWidth="1.2"
            />
            {W - PAD.right - nowX > FORECAST_LABEL_PX && (
              <text x={nowX + 4} y={PAD.top + 12} fontSize="11" fill="var(--wx-muted)">
                forecast
              </text>
            )}
          </svg>
        )}
      </div>
    </div>
  )
}

// what each widget's popup shows - the charts one under another
const CHARTS = {
  sun: {
    title: 'The sun',
    charts: [
      {
        title: 'Solar radiation',
        unit: 'W/m²',
        min: 0,
        lines: [{ key: 'radiationWm2', label: 'radiation', color: 'var(--wx-sun-line)' }],
      },
      {
        title: 'Cloud cover',
        unit: '%',
        min: 0,
        max: 100,
        lines: [{ key: 'cloudCoverPct', label: 'clouds', color: 'var(--wx-cloud-edge, #9aa8b6)' }],
      },
      {
        title: 'Temperature',
        unit: '°C',
        lines: [{ key: 'temperatureC', label: 'temperature', color: 'var(--wx-temp-line)' }],
      },
    ],
  },
  temperature: {
    title: 'Outside',
    charts: [
      {
        title: 'Temperature',
        unit: '°C',
        lines: [{ key: 'temperatureC', label: 'temperature', color: 'var(--wx-temp-line)' }],
      },
      {
        title: 'Humidity',
        unit: '%',
        min: 0,
        max: 100,
        lines: [{ key: 'humidityPct', label: 'humidity', color: 'var(--wx-humidity-line)' }],
      },
    ],
  },
  wind: {
    title: 'The wind',
    charts: [
      {
        title: 'Wind speed',
        unit: 'm/s',
        min: 0,
        lines: [
          { key: 'windSpeedMs', label: 'wind', color: 'var(--wx-wind-line)' },
          { key: 'windGustsMs', label: 'gusts', color: 'var(--wx-wind-line)', dashed: true },
        ],
      },
      {
        title: 'Wind direction (from)',
        unit: '°',
        min: 0,
        max: 360,
        lines: [
          { key: 'windDirectionDeg', label: 'direction', color: 'var(--wx-wind-line)', dots: true },
        ],
      },
    ],
  },
}

const WeatherPopup = ({ kind, weatherId, onClose }) => {
  const [range, setRange] = useState(RANGES[0])
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  // "now" - when the data was asked for (a render stays pure)
  const [now, setNow] = useState(null)
  useEffect(() => {
    let cancelled = false
    const at = Date.now()
    request(`/weather-control/${weatherId}/history?days=${range.days}`)
      .then((d) => {
        if (cancelled) return
        setData(d)
        setNow(at)
      })
      .catch((err) => !cancelled && setError(err.message))
    return () => {
      cancelled = true
    }
  }, [weatherId, range])
  const spec = CHARTS[kind]
  const t0 = now === null ? 0 : range.from(now)
  const t1 = now === null ? 0 : now + FORECAST_AHEAD_MS
  const rows = (data?.hourly ?? []).filter((r) => r.t >= t0 && r.t <= t1)
  return (
    <CModal visible onClose={onClose} size="xl" alignment="center" className="wx-widget">
      <CModalHeader>
        <CModalTitle className="d-flex align-items-center gap-2">
          <AiButton subject={{ type: 'process', id: weatherId }} label="the weather" size={24} />
          <span>
            {spec.title}
            <div className="small text-body-secondary fw-normal">{range.hint}</div>
          </span>
        </CModalTitle>
      </CModalHeader>
      <CModalBody>
        <div className="btn-group mb-3" role="group" aria-label="Scale">
          {RANGES.map((r) => (
            <CButton
              key={r.key}
              color="primary"
              variant={r.key === range.key ? undefined : 'outline'}
              aria-pressed={r.key === range.key}
              title={r.hint}
              onClick={() => {
                if (r.key === range.key) return
                setData(null)
                setError(null)
                setRange(r)
              }}
            >
              {r.label}
            </CButton>
          ))}
        </div>
        {error && <div className="small text-danger">No history: {error}</div>}
        {!error && !data && <CSpinner size="sm" />}
        {data && (
          <div className="d-grid gap-3">
            {spec.charts.map((c) => (
              <TimeChart key={c.title} {...c} rows={rows} t0={t0} t1={t1} now={now} />
            ))}
            <div className="small text-body-secondary">
              {data.attribution} - the past hours are the weather model&apos;s, not measured here.
            </div>
          </div>
        )}
      </CModalBody>
    </CModal>
  )
}

// ---- the widgets ---------------------------------------------------------------------------

export const fmt = (v, d = 1) =>
  v === null || v === undefined || Number.isNaN(Number(v)) ? '-' : Number(v).toFixed(d)

/** The forecast's next `hours` hours from now. */
export const nextHours = (forecast, hours = 8, now = Date.now()) =>
  (forecast?.hourly ?? []).filter((h) => h.t > now - 3_600_000).slice(1, hours + 1)

/** The forecast hour now falls in. */
export const currentHour = (forecast, now = Date.now()) =>
  (forecast?.hourly ?? []).filter((h) => h.t <= now).slice(-1)[0] ?? null

/** The sky's picture props for the hour (the field's live radiation when no forecast hour). */
const skyProps = (hourNow, radiation) => ({
  radiation: hourNow?.radiationWm2 ?? radiation ?? 0,
  cloudPct: hourNow?.cloudCoverPct ?? 0,
  isDay: hourNow ? hourNow.isDay !== 0 : true,
})

/** The sun's widget: the sky's picture, the radiation big, the clouds, the curve. */
export const SunWidget = ({ m, forecast, weatherId, cardClass }) => {
  const [open, setOpen] = useState(false)
  const now = useNow(60_000)
  const hourNow = currentHour(forecast, now)
  const hours = dayAround(forecast, now)
  const sky = skyProps(hourNow, m.weather?.radiationWm2)
  return (
    <>
      <style>{WIDGET_CSS}</style>
      <WeatherCard
        cardClass={cardClass}
        aspect={skyAspect(sky)}
        icon={(h) => <SkyIcon {...sky} height={h} />}
      >
        <SummaryLine
          className="wx-line"
          hint="The sun's radiation now"
          items={[{ v: fmt(m.weather?.radiationWm2, 0) }, 'W/m² sun']}
        >
          <span className="wx-muted">clouds {fmt(hourNow?.cloudCoverPct, 0)} %</span>
        </SummaryLine>
        <HourCurve
          hours={hours}
          now={now}
          value={(h) => h.radiationWm2 ?? 0}
          min={0}
          max={Math.max(200, ...hours.map((h) => h.radiationWm2 ?? 0))}
          color="var(--wx-sun-line)"
          label="The sun, the last day and the next (W/m²)"
          onOpen={() => weatherId && setOpen(true)}
        />
      </WeatherCard>
      {open && <WeatherPopup kind="sun" weatherId={weatherId} onClose={() => setOpen(false)} />}
    </>
  )
}

/** The wind's widget: the anemometer, the wind big, the gusts, the curve. */
export const WindWidget = ({ m, forecast, weatherId, cardClass }) => {
  const [open, setOpen] = useState(false)
  const now = useNow(60_000)
  const hourNow = currentHour(forecast, now)
  const hours = dayAround(forecast, now)
  return (
    <>
      <style>{WIDGET_CSS}</style>
      <WeatherCard
        cardClass={cardClass}
        aspect={ANEMOMETER_ASPECT}
        icon={(h) => <AnemometerIcon windMs={m.weather?.windMs ?? 0} size={h} />}
      >
        <SummaryLine
          className="wx-line"
          hint="The wind now"
          items={[{ v: fmt(m.weather?.windMs) }, 'm/s wind']}
        >
          <span className="wx-muted">gusts {fmt(hourNow?.windGustsMs)} m/s</span>
        </SummaryLine>
        <HourCurve
          hours={hours}
          now={now}
          value={(h) => h.windSpeedMs ?? 0}
          min={0}
          max={Math.max(5, ...hours.map((h) => h.windGustsMs ?? h.windSpeedMs ?? 0))}
          color="var(--wx-wind-line)"
          label="The wind, the last day and the next (m/s)"
          onOpen={() => weatherId && setOpen(true)}
        />
      </WeatherCard>
      {open && <WeatherPopup kind="wind" weatherId={weatherId} onClose={() => setOpen(false)} />}
    </>
  )
}

// the trend's threshold - under this change in 3 h the temperature is steady
const STEADY_C = 0.5

/**
 * The outdoor temperature's widget (the heating): the sky's picture, the temperature big, the
 * one in 3 hours, the next hours' curve (the humidity - in the popup). `outdoor` - the
 * heating's own reading ({ temperatureC, in3hC, humidityPct }), else the forecast's hour.
 */
export const TemperatureWidget = ({ forecast, outdoor, weatherId, cardClass }) => {
  const [open, setOpen] = useState(false)
  const now = useNow(60_000)
  const hourNow = currentHour(forecast, now)
  const hours = dayAround(forecast, now)
  const temp = outdoor?.temperatureC ?? hourNow?.temperatureC ?? null
  const trend = outdoor?.in3hC != null && temp != null ? outdoor.in3hC - temp : null
  const sky = skyProps(hourNow, 0)
  const temps = hours.map((h) => h.temperatureC).filter((v) => v != null)
  return (
    <>
      <style>{WIDGET_CSS}</style>
      <WeatherCard
        cardClass={cardClass}
        aspect={skyAspect(sky)}
        icon={(h) => <SkyIcon {...sky} height={h} />}
      >
        <SummaryLine
          className="wx-line"
          hint="The outdoor temperature now - the heat pumps' efficiency depends on it"
          items={[{ v: fmt(temp, 1) }, '°C outside']}
        >
          {trend !== null && (
            <span
              className="wx-muted"
              title={Math.abs(trend) < STEADY_C ? 'Steady' : trend > 0 ? 'Warming' : 'Cooling down'}
            >
              in 3 h {fmt(outdoor.in3hC, 1)} °C
            </span>
          )}
        </SummaryLine>
        <HourCurve
          hours={hours}
          now={now}
          value={(h) => h.temperatureC ?? 0}
          min={temps.length ? Math.floor(Math.min(...temps)) - 1 : 0}
          max={temps.length ? Math.ceil(Math.max(...temps)) + 1 : 1}
          color="var(--wx-temp-line)"
          label="The temperature, the last day and the next (°C)"
          onOpen={() => weatherId && setOpen(true)}
        />
      </WeatherCard>
      {open && (
        <WeatherPopup kind="temperature" weatherId={weatherId} onClose={() => setOpen(false)} />
      )}
    </>
  )
}
