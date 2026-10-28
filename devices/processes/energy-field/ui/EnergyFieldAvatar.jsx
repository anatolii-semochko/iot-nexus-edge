import React from 'react'
import {
  BatteryIcon,
  ConsumerIcon,
  GridIcon,
  MoneyIcon,
  PvIcon,
  SCENE_CSS,
  TurbineIcon,
} from './fieldIcons'
import { fmt, useFieldData } from './useFieldData'

// The Energy Field's Dashboard card picture (images/AQUARIUM V16.png, the
// reviewed mockup): the grid, the batteries, the wind, the consumer, the
// sun and today's balance, each with its power - the state in the colour
// (grey - no flow / off, red - outage, not covered, low charge); the bolt
// while charging; the turbines turning at their mean speed. Transparent.

// (2026-10-22, the user's mockup images/energy-dashboard-icon.png): the money's own icon, the
// generation's new icons, the labels in full words, the six rows centred in the block
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

const EnergyFieldAvatar = ({ process }) => {
  const { m, gridMetrics } = useFieldData(process)
  const t = m.totals
  if (!t) return null
  const kw = (v) =>
    `${Math.abs(v ?? 0) >= 100 ? fmt(Math.abs(v ?? 0), 0) : fmt(Math.abs(v ?? 0), 1)} kW`
  const gridFlow = t.gridKw > 0.05 ? 'import' : t.gridKw < -0.05 ? 'export' : 'none'
  const turning = (m.wind ?? []).filter((x) => x.state === 'running' || x.state === 'idle')
  const meanRpm = turning.length ? turning.reduce((a, x) => a + x.rpm, 0) / turning.length : 0
  const balance = (gridMetrics?.today?.revenueEur ?? 0) - (gridMetrics?.today?.costEur ?? 0)
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
      <Row
        icon={
          <GridIcon
            height={34}
            flow={gridFlow}
            voltage={gridMetrics?.outage ? 'none' : 'ok'}
            outage={gridMetrics?.outage}
          />
        }
        value={gridMetrics?.outage ? 'outage' : kw(t.gridKw)}
        sub={
          gridFlow === 'import' ? 'Import' : gridFlow === 'export' ? 'Export' : 'Import / Export'
        }
      />
      <Row
        icon={<BatteryIcon width={36} level={t.socPct} charging={t.batteryKw < -0.05} />}
        value={`${fmt(t.socPct, 0)} %`}
        sub={
          Math.abs(t.batteryKw) > 0.05 ? (
            <>
              {t.batteryKw < 0 ? 'In' : 'Out'}{' '}
              <b className="text-body">{kw(t.batteryKw).replace(' kW', '')}</b> kW
            </>
          ) : (
            'Idle'
          )
        }
      />
      <Row
        icon={
          <TurbineIcon
            height={34}
            rpm={meanRpm}
            state={t.windKw > 0.05 || meanRpm > 0 ? 'running' : 'off'}
          />
        }
        value={kw(t.windKw)}
        sub="Wind"
      />
      <Row
        icon={
          <ConsumerIcon
            height={34}
            state={t.shedKw > 0.05 ? 'bad' : t.loadKw > 0.05 ? 'on' : 'idle'}
          />
        }
        value={kw(t.loadKw)}
        sub={t.shedKw > 0.05 ? `${kw(t.shedKw)} not covered` : 'Consumption'}
      />
      <Row icon={<PvIcon height={34} on={t.pvKw > 0.05} />} value={kw(t.pvKw)} sub="Solar" />
      <Row
        icon={<MoneyIcon height={30} positive={balance >= 0} />}
        value={
          <span
            style={{ color: balance >= 0 ? 'var(--ef-gen)' : 'var(--ef-bad)' }}
          >{`${balance >= 0 ? '+' : '−'}${fmt(Math.abs(balance), 2)} €`}</span>
        }
        sub="Today"
      />
    </div>
  )
}

export default EnergyFieldAvatar
