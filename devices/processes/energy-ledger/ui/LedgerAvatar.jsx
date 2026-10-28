import React from 'react'
import { useProcessLiveState } from 'src/api/useLiveProcess'
import {
  BatteryIcon,
  GridIcon,
  MoneyIcon,
  PvIcon,
  SCENE_CSS,
} from '../../energy-field/ui/fieldIcons'

// The Energy Ledger's Dashboard card picture (the user, 2026-10-25 - in the energy and heating
// avatars' style): what the system saved today and what was paid in total today, the efficiency (the
// saving's share) and the strategy, the self-sufficiency and what the plan still saves - each with its icon. Transparent; the
// energy field's colours.

const STRATEGY_NAMES = {
  cost: 'Least cost',
  selfSufficiency: 'Self-sufficiency',
  reserve: 'Reserve',
  peakShaving: 'Peak shaving',
  sales: 'Sales',
}
const money = (v) =>
  `${v >= 0 ? '+' : '−'}${Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
const pct = (v) => (v === null || v === undefined ? '-' : `${Math.round(v)} %`)

/** A ring filled to a share - the saving's efficiency. */
const RingIcon = ({ value, size = 34 }) => {
  const r = 14
  const c = 2 * Math.PI * r
  const share = Math.max(0, Math.min(1, (value ?? 0) / 100))
  return (
    <svg width={size} height={size} viewBox="0 0 34 34" aria-hidden="true">
      <circle cx="17" cy="17" r={r} fill="none" stroke="var(--ef-line)" strokeWidth="5" />
      <circle
        cx="17"
        cy="17"
        r={r}
        fill="none"
        stroke="var(--ef-gen)"
        strokeWidth="5"
        strokeDasharray={`${c * share} ${c}`}
        transform="rotate(-90 17 17)"
        strokeLinecap="round"
      />
    </svg>
  )
}

/** The plan's strategy - a path through the day's price steps. */
const StrategyIcon = ({ size = 34 }) => (
  <svg width={size} height={size} viewBox="0 0 34 34" aria-hidden="true">
    <path
      d="M3 26 H10 V18 H17 V24 H24 V10 H31"
      fill="none"
      stroke="var(--ef-line)"
      strokeWidth="3"
    />
    <path
      d="M4 22 C10 22 12 12 18 14 S26 8 30 7"
      fill="none"
      stroke="var(--ef-batt)"
      strokeWidth="3"
      strokeLinecap="round"
    />
    <circle cx="30" cy="7" r="2.6" fill="var(--ef-batt)" />
  </svg>
)

const Row = ({ icon, value, sub }) => (
  <div className="d-flex align-items-center" style={{ gap: 6 }}>
    <div style={{ width: 36, display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
      {icon}
    </div>
    <div style={{ lineHeight: 1.2, whiteSpace: 'nowrap' }}>
      <div className="kv" style={{ fontSize: '1rem' }}>
        {value}
      </div>
      <div className="text-body-secondary" style={{ fontSize: '0.75rem' }}>
        {sub}
      </div>
    </div>
  </div>
)

const LedgerAvatar = ({ process }) => {
  const live = useProcessLiveState(process.id)
  const m = live.metrics ?? process.metrics ?? {}
  const k = m.kpis
  if (!k) return null
  const saved = k.savedEur ?? 0
  const paid = -(k.netEur ?? 0)
  const planSaves = m.plan?.savingEur ?? null
  return (
    <div
      className="ef-scene"
      style={{
        height: '100%',
        display: 'grid',
        gridTemplateColumns: 'repeat(2, max-content)',
        alignContent: 'center',
        justifyContent: 'center',
        gap: '8px 14px',
        padding: '4px 6px',
      }}
    >
      <style>{SCENE_CSS}</style>
      {/* the order the user asked (2026-10-25): saved | paid; efficiency | strategy; self-sufficient | plan saves */}
      <Row
        icon={<MoneyIcon height={30} positive={saved >= 0} />}
        value={
          <span style={{ color: saved >= 0 ? 'var(--ef-gen)' : 'var(--ef-bad)' }}>
            {money(saved)}
          </span>
        }
        sub="Saved today"
      />
      <Row
        icon={<GridIcon height={34} flow={paid > 0 ? 'import' : 'none'} voltage="ok" />}
        value={`${Math.abs(paid).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`}
        sub={paid >= 0 ? 'Paid total' : 'Earned total'}
      />
      <Row icon={<RingIcon value={k.savedPct} />} value={pct(k.savedPct)} sub="Efficiency" />
      <Row
        icon={<StrategyIcon />}
        value={
          <span style={{ fontSize: '0.9rem' }}>{STRATEGY_NAMES[m.plan?.strategy] ?? '-'}</span>
        }
        sub="Strategy"
      />
      <Row
        icon={<PvIcon height={34} on />}
        value={pct(k.selfSufficiencyPct)}
        sub="Self-sufficient"
      />
      <Row
        icon={<BatteryIcon width={36} level={m.planNow?.socPct ?? null} />}
        value={planSaves === null ? '-' : money(planSaves)}
        sub="Plan saves"
      />
    </div>
  )
}

export default LedgerAvatar
