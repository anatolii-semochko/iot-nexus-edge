import React from 'react'
import { useNow } from 'src/hooks/useNow'

// The slots' purchase (bars) and sale (line) prices, ct/kWh, over the
// period given, with "now" marked; the tariff zones as a band under the
// bars. Pure SVG, scales to its container's width; theme colours from
// CoreUI's variables.
const W = 720
const H = 180
const PAD = { left: 34, right: 8, top: 10, bottom: 34 }
const ZONE_COLORS = ['#3b82f6', '#f59e0b', '#ef4444', '#10b981', '#8b5cf6', '#64748b']

const PriceChart = ({ slots, now: nowGiven }) => {
  const clock = useNow(60_000)
  const now = nowGiven ?? clock
  if (!slots?.length)
    return <div className="text-body-secondary small">No prices for this period.</div>
  const t0 = slots[0].t
  const t1 = slots[slots.length - 1].t + slots[slots.length - 1].minutes * 60_000
  const values = slots.flatMap((s) => [s.buyCtKwh, s.sellCtKwh]).filter((v) => v !== null)
  const max = Math.max(1, ...values)
  const min = Math.min(0, ...values)
  const x = (t) => PAD.left + ((t - t0) / (t1 - t0)) * (W - PAD.left - PAD.right)
  const y = (v) => PAD.top + ((max - v) / (max - min)) * (H - PAD.top - PAD.bottom)
  const zones = [...new Set(slots.map((s) => s.zone).filter(Boolean))]
  const sellPath = slots
    .filter((s) => s.sellCtKwh !== null)
    .map(
      (s, i) =>
        `${i ? 'L' : 'M'}${x(s.t).toFixed(1)} ${y(s.sellCtKwh).toFixed(1)} H${x(s.t + s.minutes * 60_000).toFixed(1)}`,
    )
    .join(' ')
  const hours = []
  for (let t = Math.ceil(t0 / 3_600_000) * 3_600_000; t <= t1; t += 3_600_000) hours.push(t)
  const ticks = [min, (min + max) / 2, max]

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: '100%', height: 'auto', display: 'block' }}
      role="img"
      aria-label="Electricity prices"
    >
      {ticks.map((v) => (
        <g key={v}>
          <line
            x1={PAD.left}
            x2={W - PAD.right}
            y1={y(v)}
            y2={y(v)}
            stroke="var(--cui-border-color)"
            strokeWidth={0.5}
          />
          <text
            x={PAD.left - 4}
            y={y(v) + 3}
            fontSize={9}
            textAnchor="end"
            fill="var(--cui-secondary-color)"
          >
            {v.toFixed(0)}
          </text>
        </g>
      ))}
      {slots.map((s) =>
        s.buyCtKwh === null ? null : (
          <rect
            key={s.t}
            x={x(s.t) + 0.3}
            y={Math.min(y(s.buyCtKwh), y(0))}
            width={Math.max(0.5, x(s.t + s.minutes * 60_000) - x(s.t) - 0.6)}
            height={Math.abs(y(0) - y(s.buyCtKwh))}
            fill={
              s.t + s.minutes * 60_000 <= now ? 'var(--cui-secondary-bg)' : 'var(--cui-primary)'
            }
            opacity={s.t + s.minutes * 60_000 <= now ? 1 : 0.55}
          >
            <title>{`${new Date(s.t).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })}: buy ${s.buyCtKwh} ct/kWh${s.sellCtKwh !== null ? `, sell ${s.sellCtKwh}` : ''}${s.zone ? ` (${s.zone})` : ''}`}</title>
          </rect>
        ),
      )}
      {sellPath && <path d={sellPath} fill="none" stroke="var(--cui-success)" strokeWidth={1.5} />}
      {slots.map((s) =>
        s.zone ? (
          <rect
            key={`z${s.t}`}
            x={x(s.t)}
            y={H - PAD.bottom + 3}
            width={x(s.t + s.minutes * 60_000) - x(s.t)}
            height={4}
            fill={ZONE_COLORS[zones.indexOf(s.zone) % ZONE_COLORS.length]}
          />
        ) : null,
      )}
      {hours
        .filter((t) => new Date(t).getHours() % 3 === 0)
        .map((t) => (
          <text
            key={t}
            x={x(t)}
            y={H - PAD.bottom + 18}
            fontSize={9}
            textAnchor="middle"
            fill="var(--cui-secondary-color)"
          >
            {new Date(t).getHours() === 0
              ? new Date(t).toLocaleDateString([], { day: 'numeric', month: 'short' })
              : `${new Date(t).getHours()}:00`}
          </text>
        ))}
      {now >= t0 && now <= t1 && (
        <line
          x1={x(now)}
          x2={x(now)}
          y1={PAD.top}
          y2={H - PAD.bottom}
          stroke="var(--cui-danger)"
          strokeWidth={1.2}
        />
      )}
      <g fontSize={9} fill="var(--cui-secondary-color)">
        <rect
          x={PAD.left}
          y={H - 9}
          width={8}
          height={6}
          fill="var(--cui-primary)"
          opacity={0.55}
        />
        <text x={PAD.left + 11} y={H - 3}>
          buy, ct/kWh
        </text>
        <line
          x1={PAD.left + 80}
          x2={PAD.left + 90}
          y1={H - 6}
          y2={H - 6}
          stroke="var(--cui-success)"
          strokeWidth={1.5}
        />
        <text x={PAD.left + 93} y={H - 3}>
          sell
        </text>
        {zones.map((z, i) => (
          <g key={z}>
            <rect
              x={PAD.left + 130 + i * 70}
              y={H - 8}
              width={10}
              height={4}
              fill={ZONE_COLORS[i % ZONE_COLORS.length]}
            />
            <text x={PAD.left + 143 + i * 70} y={H - 3}>
              {z}
            </text>
          </g>
        ))}
      </g>
    </svg>
  )
}

export default PriceChart
