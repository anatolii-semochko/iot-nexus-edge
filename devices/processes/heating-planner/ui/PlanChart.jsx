import React from 'react'
import { useNow } from 'src/hooks/useNow'
import { fmt, hhmm } from './usePlan'

// The heating plan's chart (P2 - iot AGENTS_TO_DO.md 2026-10-29), over the horizon, in bands one under
// another: the prices (buy, sell) with the Ledger's signal (hold off - grey, store - green) and the sun's
// surplus (yellow); the heat planned (bars - heat yellow, cold blue) over the rooms' need (a line); the
// heat pumps running; the store - one system's tanks (C) or all of them (kWh); the rooms off their
// setpoint (the comfort margin, K). "Now" - a red line.

const W = 900
const LEFT = 60
const RIGHT = 12
const BANDS = {
  price: [10, 80],
  heat: [96, 226],
  units: [242, 272],
  store: [288, 338],
  rooms: [352, 372],
}
const H = 396
const COLORS = {
  buy: '#d93b3b',
  sell: '#1d6fd8',
  heat: '#f2b705',
  cold: '#1c7ed6',
  need: '#e8590c',
  units: '#495057',
  store: '#c2255c',
  rooms: '#7048e8',
  holdOff: 'rgba(134,142,150,0.18)',
  storeSig: 'rgba(31,157,99,0.14)',
  sun: 'rgba(242,183,5,0.22)',
}

const Label = ({ y, children }) => (
  <text x="2" y={y + 10} fontSize="11" fill="var(--cui-secondary-color)">
    {children}
  </text>
)
const Tick = ({ y, children }) => (
  <text x={LEFT - 4} y={y} fontSize="10" textAnchor="end" fill="var(--cui-secondary-color)">
    {children}
  </text>
)

const PlanChart = ({ slots, mode, single }) => {
  const now = useNow(60_000)
  if (!slots?.length) return null
  const cooling = mode === 'cooling'
  const t0 = slots[0].t
  const t1 = slots[slots.length - 1].end
  const x = (t) => LEFT + ((Math.max(t0, Math.min(t1, t)) - t0) / (t1 - t0)) * (W - LEFT - RIGHT)
  const yIn = (b, v, lo, hi) => b[1] - ((v - lo) / (hi - lo || 1)) * (b[1] - b[0])
  const step = (pick, b, lo, hi) =>
    slots
      .map((s) => {
        const y = yIn(b, pick(s), lo, hi).toFixed(1)
        return `${x(s.t).toFixed(1)},${y} ${x(s.end).toFixed(1)},${y}`
      })
      .join(' ')
  const runs = (pick) =>
    slots.reduce((out, s) => {
      const v = pick(s)
      const last = out[out.length - 1]
      if (v && last && last.v === v && last.end === s.t) last.end = s.end
      else if (v) out.push({ t: s.t, end: s.end, v })
      return out
    }, [])

  const prices = slots.flatMap((s) => [s.buyCtKwh, s.sellCtKwh ?? 0])
  const pLo = Math.min(0, ...prices)
  const pHi = Math.max(1, ...prices)
  const kwHi = Math.max(1, ...slots.flatMap((s) => [s.heatKw, s.needKw]))
  const uHi = Math.max(1, ...slots.map((s) => s.units))
  const storeOf = (s) => (single ? s.tankC : s.storeKwh)
  const storeVals = slots.map(storeOf).filter((v) => v != null)
  const sLo = single ? Math.floor(Math.min(...storeVals) - 1) : 0
  const sHi = Math.ceil(Math.max(sLo + 1, ...storeVals) + (single ? 1 : 0))
  const offHi = Math.max(0.5, ...slots.map((s) => s.roomOffsetK ?? 0))
  const hours = []
  for (let t = Math.ceil(t0 / 3_600_000) * 3_600_000; t < t1; t += 3_600_000) hours.push(t)
  const heatColor = cooling ? COLORS.cold : COLORS.heat

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      role="img"
      aria-label="The heating plan: prices, the heat planned and needed, the units, the store, the rooms"
    >
      {/* the Ledger's signal and the sun's surplus - behind the prices */}
      {runs((s) => (s.signal === 1 ? 'hold' : s.signal === 3 ? 'store' : null)).map((r) => (
        <rect
          key={`s${r.t}`}
          x={x(r.t)}
          width={Math.max(1, x(r.end) - x(r.t))}
          y={BANDS.price[0]}
          height={BANDS.price[1] - BANDS.price[0]}
          fill={r.v === 'hold' ? COLORS.holdOff : COLORS.storeSig}
        >
          <title>{`${hhmm(r.t)}-${hhmm(r.end)}: the Energy Ledger's signal - ${r.v === 'hold' ? 'hold off (dear energy)' : 'store heat (cheap energy / the sun)'}`}</title>
        </rect>
      ))}
      {runs((s) => (s.cheapKw > 0.5 ? 'sun' : null)).map((r) => (
        <rect
          key={`u${r.t}`}
          x={x(r.t)}
          width={Math.max(1, x(r.end) - x(r.t))}
          y={BANDS.heat[0]}
          height={BANDS.heat[1] - BANDS.heat[0]}
          fill={COLORS.sun}
        >
          <title>{`${hhmm(r.t)}-${hhmm(r.end)}: the sun's surplus (the Ledger would export it) - the heat at the sale price`}</title>
        </rect>
      ))}
      {hours
        .filter((t) => new Date(t).getHours() % 6 === 0)
        .map((t) => (
          <g key={t}>
            <line
              x1={x(t)}
              x2={x(t)}
              y1={BANDS.price[0]}
              y2={BANDS.rooms[1]}
              stroke="var(--cui-border-color)"
              strokeDasharray={new Date(t).getHours() === 0 ? undefined : '2 4'}
            />
            <text x={x(t) + 2} y={H - 8} fontSize="11" fill="var(--cui-secondary-color)">
              {new Date(t).getHours() === 0
                ? new Date(t).toLocaleDateString(undefined, { weekday: 'short' })
                : hhmm(t)}
            </text>
          </g>
        ))}

      <Label y={BANDS.price[0]}>ct</Label>
      <Tick y={BANDS.price[0] + 10}>{Math.round(pHi)}</Tick>
      <polyline
        points={step((s) => s.buyCtKwh, BANDS.price, pLo, pHi)}
        fill="none"
        stroke={COLORS.buy}
        strokeWidth="1.8"
      >
        <title>The purchase price, ct/kWh</title>
      </polyline>
      <polyline
        points={step((s) => s.sellCtKwh ?? 0, BANDS.price, pLo, pHi)}
        fill="none"
        stroke={COLORS.sell}
        strokeWidth="1.4"
        strokeDasharray="4 3"
      >
        <title>The sale price, ct/kWh - the sun's surplus is worth this</title>
      </polyline>

      <Label y={BANDS.heat[0]}>kW</Label>
      <Tick y={BANDS.heat[0] + 10}>{Math.round(kwHi)}</Tick>
      <line
        x1={LEFT}
        x2={W - RIGHT}
        y1={BANDS.heat[1]}
        y2={BANDS.heat[1]}
        stroke="var(--cui-border-color)"
      />
      {slots.map((s) =>
        s.heatKw > 0.05 ? (
          <rect
            key={s.t}
            x={x(s.t)}
            width={Math.max(1, x(s.end) - x(s.t) - 0.5)}
            y={yIn(BANDS.heat, s.heatKw, 0, kwHi)}
            height={BANDS.heat[1] - yIn(BANDS.heat, s.heatKw, 0, kwHi)}
            fill={heatColor}
            opacity="0.8"
          >
            <title>{`${hhmm(s.t)}: ${cooling ? 'cold' : 'heat'} ${fmt(s.heatKw)} kW - ${s.units} unit(s), the need ${fmt(s.needKw)} kW, ${fmt(s.buyCtKwh)} ct/kWh`}</title>
          </rect>
        ) : null,
      )}
      <polyline
        points={step((s) => s.needKw, BANDS.heat, 0, kwHi)}
        fill="none"
        stroke={COLORS.need}
        strokeWidth="1.6"
        strokeDasharray="5 3"
      >
        <title>{`The rooms' need - the ${cooling ? 'cold' : 'heat'} they lose now, kW`}</title>
      </polyline>

      <Label y={BANDS.units[0] - 4}>units</Label>
      <Tick y={BANDS.units[0] + 8}>{uHi}</Tick>
      <polyline
        points={step((s) => s.units, BANDS.units, 0, uHi)}
        fill="none"
        stroke={COLORS.units}
        strokeWidth="1.6"
      >
        <title>The heat pumps running</title>
      </polyline>

      <Label y={BANDS.store[0]}>{single ? '°C' : 'kWh'}</Label>
      <Tick y={BANDS.store[0] + 10}>{sHi}</Tick>
      <Tick y={BANDS.store[1]}>{sLo}</Tick>
      <polyline
        points={step((s) => storeOf(s) ?? sLo, BANDS.store, sLo, sHi)}
        fill="none"
        stroke={COLORS.store}
        strokeWidth="1.8"
      >
        <title>
          {single
            ? "The tanks' average temperature at each slot's end, °C"
            : "The store at each slot's end - all the systems' tanks and the rooms' margin, kWh"}
        </title>
      </polyline>

      <Label y={BANDS.rooms[0] - 2}>rooms</Label>
      <polygon
        points={`${x(t0)},${BANDS.rooms[0]} ${step((s) => s.roomOffsetK ?? 0, [BANDS.rooms[0], BANDS.rooms[0] + (BANDS.rooms[1] - BANDS.rooms[0])], offHi, 0)} ${x(t1)},${BANDS.rooms[0]}`}
        fill={COLORS.rooms}
        opacity="0.45"
      >
        <title>{`The rooms off their setpoint (${cooling ? 'above' : 'below'} it) - the comfort margin in use, K (at most ${fmt(offHi, 1)})`}</title>
      </polygon>
      <line
        x1={LEFT}
        x2={W - RIGHT}
        y1={BANDS.rooms[0]}
        y2={BANDS.rooms[0]}
        stroke="var(--cui-border-color)"
      />

      {now >= t0 && now <= t1 && (
        <line
          x1={x(now)}
          x2={x(now)}
          y1={BANDS.price[0]}
          y2={BANDS.rooms[1]}
          stroke="var(--cui-danger)"
          strokeWidth="1.2"
        />
      )}
    </svg>
  )
}

export const LEGEND = [
  ['buy', COLORS.buy, 'buy price'],
  ['sell', COLORS.sell, 'sale price'],
  ['heat', COLORS.heat, 'heat planned'],
  ['need', COLORS.need, "the rooms' need"],
  ['units', COLORS.units, 'units'],
  ['store', COLORS.store, 'store'],
  ['rooms', COLORS.rooms, 'rooms off setpoint'],
  ['hold', COLORS.holdOff, 'hold off'],
  ['storeSig', COLORS.storeSig, 'store heat'],
  ['sun', COLORS.sun, "the sun's surplus"],
]

export default PlanChart
