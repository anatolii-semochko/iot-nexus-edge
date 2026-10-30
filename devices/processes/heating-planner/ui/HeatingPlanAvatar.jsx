import React from 'react'
import KeyValue from 'src/components/KeyValue'
import { useNow } from 'src/hooks/useNow'
import { fmt, sumSystems, usePlan } from './usePlan'

// The heating plan's Dashboard card picture (P2): the next day's heat planned (bars, all the systems)
// under the purchase price (a line), what the plan saves to its horizon's end against the band control
// and the heat pumps now. Drawn at its natural size - an unframed card scales it to the block's edges.

const W = 300
const H = 96
const AHEAD_MS = 24 * 3_600_000
const HEAT = '#f2b705'
const COLD = '#1c7ed6'
const PRICE = '#d93b3b'
const STRATEGY_NAMES = { cost: 'Least cost', gentle: 'Gentle', comfort: 'Comfort', sun: 'The sun' }
const BIG = 30
const SMALL = 20

const HeatingPlanAvatar = ({ process }) => {
  const { plan } = usePlan(process)
  const now = useNow(60_000)
  const planned = (plan?.systems ?? []).filter((x) => x.slots?.length)
  if (!planned.length)
    return (
      <div className="text-body-secondary" style={{ fontSize: SMALL, padding: 8 }}>
        No plan yet
      </div>
    )
  const all = sumSystems(planned)
  const slots = all.filter((s) => s.end > now && s.t < now + AHEAD_MS)
  const slotNow = slots.find((s) => s.t <= now) ?? slots[0]
  const cooling = planned[0].mode === 'cooling'
  const saving = planned.reduce((a, x) => a + (x.savingEur ?? 0), 0)
  if (!slots.length) return null
  const t0 = slots[0].t
  const t1 = slots[slots.length - 1].end
  const x = (t) => ((Math.max(t0, t) - t0) / (t1 - t0)) * W
  const kwHi = Math.max(1, ...slots.map((s) => s.heatKw))
  const pHi = Math.max(1, ...slots.map((s) => s.buyCtKwh))
  const pLo = Math.min(...slots.map((s) => s.buyCtKwh))
  const price = slots
    .map((s) => {
      const y = (6 + ((pHi - s.buyCtKwh) / (pHi - pLo || 1)) * 30).toFixed(1)
      return `${x(s.t).toFixed(1)},${y} ${x(s.end).toFixed(1)},${y}`
    })
    .join(' ')
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 4, width: W }}>
      <svg
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="The next day's heat plan"
      >
        <title>
          The next 24 hours: the heat planned (bars) under the purchase price (the line)
        </title>
        {slots.map((s) =>
          s.heatKw > 0.05 ? (
            <rect
              key={s.t}
              x={x(s.t)}
              width={Math.max(1, x(s.end) - x(s.t) - 0.3)}
              y={H - (s.heatKw / kwHi) * (H - 42)}
              height={(s.heatKw / kwHi) * (H - 42)}
              fill={cooling ? COLD : HEAT}
              opacity="0.85"
            />
          ) : null,
        )}
        <line x1="0" x2={W} y1={H - 0.5} y2={H - 0.5} stroke="var(--cui-border-color)" />
        <polyline points={price} fill="none" stroke={PRICE} strokeWidth="2" />
      </svg>
      <div style={{ fontSize: BIG, lineHeight: 1.15, whiteSpace: 'nowrap' }}>
        <span title="What the plan saves to its horizon's end against the band control">
          <KeyValue value={fmt(saving, 2)} unit="€" className="text-success" />
        </span>
        <span style={{ marginLeft: 18 }} title={`The heat pumps' ${cooling ? 'cold' : 'heat'} now`}>
          <KeyValue value={fmt(slotNow?.heatKw)} unit="kW" />
        </span>
      </div>
      <div className="text-body-secondary" style={{ fontSize: SMALL, whiteSpace: 'nowrap' }}>
        {STRATEGY_NAMES[planned[0].strategy] ?? 'saving'} ·{' '}
        {slotNow?.units ? `${slotNow.units} units running` : 'holding'}
      </div>
    </div>
  )
}

export default HeatingPlanAvatar
