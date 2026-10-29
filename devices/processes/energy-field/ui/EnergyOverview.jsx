import React, { Suspense, useEffect, useState } from 'react'
import { CSpinner } from '@coreui/react'
import { request } from 'src/api/client'
import KeyValue from 'src/components/KeyValue'
import LedgerAvatar from '../../energy-ledger/ui/LedgerAvatar'
import { BatteryIcon, ConsumerIcon, Flow, GenerationIcon, GridIcon, SCENE_CSS } from './fieldIcons'
import { fmt, useFieldData } from './useFieldData'

// The energy's overview (iot AGENTS_TO_DO.md 2026-10-29, the user's layout): a Dashboard component drawn
// at a folder's full width under its blocks - the whole picture at a glance. Three columns, the energy's
// flows between them: the generation over the grid on the left, each with its flow to the right; the
// Energy Ledger in the middle (its card's picture - what the system saved, the plan, the strategy); the
// batteries over the consumption on the right, each with its flow from the left. The flows - the scene's
// three colours (green - for us, orange - against us, grey - none) and directions (the grid's export and
// the batteries' discharge point back). Narrow - one column, the flows turned down.

const FLOW_SIZE = 56
const ICON_HEIGHT = 72
const STACK_PX = 820

const CSS = `
.eo { container-type: inline-size; }
.eo-grid { display: grid; grid-template-columns: minmax(0, 1fr) max-content minmax(0, 1.3fr) max-content minmax(0, 1fr); gap: 10px; align-items: stretch }
.eo-side { display: grid; grid-template-rows: 1fr 1fr; gap: 10px }
.eo-flows { display: grid; grid-template-rows: 1fr 1fr; gap: 10px; align-items: center; justify-items: center }
.eo-block { display: flex; align-items: center; gap: 14px; padding: 12px 16px; border: 1px solid var(--ef-line); border-radius: 12px; background: var(--ef-card) }
.eo-block .kv.eo-main { font-size: 1.35rem }
.eo-mid { border: 2px solid var(--ef-panel-grid); border-radius: 12px; background: var(--ef-card); padding: 10px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; min-height: 100% }
.eo-flow { display: flex; flex-direction: column; align-items: center; line-height: 1.1 }
.eo-flow .kv { font-size: 1.05rem }
@container (max-width: ${STACK_PX}px) {
  .eo-grid { grid-template-columns: minmax(0, 1fr) }
  .eo-flows { grid-template-rows: none; grid-template-columns: 1fr 1fr }
  .eo-flows svg { transform: rotate(90deg) }
}
`

const kwText = (kw) => (Math.abs(kw) >= 100 ? fmt(Math.abs(kw), 0) : fmt(Math.abs(kw), 1))

/** A block: its icon, the key figure and the words under it. */
const Block = ({ icon, title, value, unit = 'kW', color, children }) => (
  <div className="eo-block">
    <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>{icon}</div>
    <div style={{ minWidth: 0 }}>
      <div className="fw-semibold">{title}</div>
      <KeyValue value={value} unit={unit} color={color} className="eo-main" />
      <div className="small ef-muted">{children}</div>
    </div>
  </div>
)

/** A flow between two columns - its chevrons, its power under them. */
const FlowCell = ({ dir, kw, color, scaleKw, label }) => (
  <div className="eo-flow">
    <Flow
      dir={dir}
      kw={Math.abs(kw)}
      scaleKw={scaleKw}
      color={color}
      size={FLOW_SIZE}
      label={label}
    />
    <KeyValue
      value={Math.abs(kw) > 0.05 ? kwText(kw) : '-'}
      unit="kW"
      color={Math.abs(kw) > 0.05 ? color : 'var(--ef-off)'}
    />
  </div>
)

/** The ledger's process row - the field's config names it; null while loading or when there is none. */
const useLedger = (ledgerId) => {
  const [state, setState] = useState({ ledger: null, error: null })
  useEffect(() => {
    if (!ledgerId) return undefined
    let cancelled = false
    request(`/processes/${ledgerId}`)
      .then((p) => !cancelled && setState({ ledger: p, error: null }))
      .catch((err) => !cancelled && setState({ ledger: null, error: err.message }))
    return () => {
      cancelled = true
    }
  }, [ledgerId])
  return state
}

const EnergyOverview = ({ process }) => {
  const { m, gridMetrics } = useFieldData(process)
  const ledgerId = process.config?.ledgerProcessId ?? null
  const { ledger, error } = useLedger(ledgerId)
  const t = m.totals
  if (!t) return <CSpinner size="sm" />
  const generation = (t.pvKw ?? 0) + (t.windKw ?? 0)
  const gridFlow = t.gridKw > 0.05 ? 'import' : t.gridKw < -0.05 ? 'export' : 'none'
  const batteryDir = t.batteryKw < -0.05 ? 'charge' : t.batteryKw > 0.05 ? 'discharge' : 'none'
  const scaleKw = Math.max(50, generation, t.loadKw ?? 0)
  const turning = (m.wind ?? []).filter((x) => x.state === 'running' || x.state === 'idle')
  const meanRpm = turning.length ? turning.reduce((a, x) => a + x.rpm, 0) / turning.length : 0
  const gain = 'var(--ef-gain)'
  const cost = 'var(--ef-cost)'
  const off = 'var(--ef-off)'
  const gridColor = gridFlow === 'export' ? gain : gridFlow === 'import' ? cost : off
  const batteryColor = batteryDir === 'charge' ? gain : batteryDir === 'discharge' ? cost : off
  const loadColor = (t.loadKw ?? 0) > 0.05 ? cost : off
  return (
    <div className="ef-scene eo">
      <style>{SCENE_CSS + CSS}</style>
      <div className="eo-grid">
        <div className="eo-side">
          <Block
            icon={<GenerationIcon height={ICON_HEIGHT} on={generation > 0.05} rpm={meanRpm} />}
            title="Generation"
            value={kwText(generation)}
            color={generation > 0.05 ? 'var(--ef-gen)' : off}
          >
            Solar <KeyValue value={kwText(t.pvKw ?? 0)} unit="kW" /> · wind{' '}
            <KeyValue value={kwText(t.windKw ?? 0)} unit="kW" />
          </Block>
          <Block
            icon={
              <GridIcon
                height={ICON_HEIGHT}
                flow={gridFlow}
                voltage={gridMetrics?.outage ? 'none' : 'ok'}
                outage={gridMetrics?.outage}
              />
            }
            title="Grid"
            value={gridMetrics?.outage ? 'outage' : kwText(t.gridKw)}
            unit={gridMetrics?.outage ? '' : 'kW'}
            color={gridMetrics?.outage ? 'var(--ef-bad)' : gridColor}
          >
            {gridFlow === 'none' ? 'No exchange' : gridFlow === 'import' ? 'Import' : 'Export'}
            <br />
            buy <KeyValue value={fmt(gridMetrics?.buyCtKwh, 1)} /> / sell{' '}
            <KeyValue value={fmt(gridMetrics?.sellCtKwh, 1)} />{' '}
            <span className="kv-unit ms-0">ct/kWh</span>
          </Block>
        </div>
        <div className="eo-flows">
          <FlowCell
            dir="right"
            kw={generation}
            color={generation > 0.05 ? gain : off}
            scaleKw={scaleKw}
            label={`Generation ${kwText(generation)} kW`}
          />
          <FlowCell
            dir={gridFlow === 'export' ? 'left' : 'right'}
            kw={t.gridKw}
            color={gridColor}
            scaleKw={scaleKw}
            label={`Grid ${gridFlow} ${kwText(t.gridKw)} kW`}
          />
        </div>
        <div className="eo-mid">
          <div className="fw-semibold">Energy Ledger</div>
          {ledger ? (
            <Suspense fallback={<CSpinner size="sm" />}>
              <LedgerAvatar process={ledger} />
            </Suspense>
          ) : (
            <span className="small ef-muted text-center">
              {!ledgerId
                ? 'No Energy Ledger linked (the field’s settings)'
                : error
                  ? `The Energy Ledger - ${error}`
                  : 'The Energy Ledger…'}
            </span>
          )}
        </div>
        <div className="eo-flows">
          <FlowCell
            dir={batteryDir === 'discharge' ? 'left' : 'right'}
            kw={t.batteryKw}
            color={batteryColor}
            scaleKw={scaleKw}
            label={`Batteries ${batteryDir} ${kwText(t.batteryKw)} kW`}
          />
          <FlowCell
            dir="right"
            kw={t.loadKw ?? 0}
            color={loadColor}
            scaleKw={scaleKw}
            label={`Consumption ${kwText(t.loadKw ?? 0)} kW`}
          />
        </div>
        <div className="eo-side">
          <Block
            icon={
              <BatteryIcon
                width={ICON_HEIGHT * 1.2}
                level={t.socPct}
                charging={batteryDir === 'charge'}
              />
            }
            title="Batteries"
            value={fmt(t.socPct, 0)}
            unit="%"
            color="var(--ef-batt)"
          >
            {batteryDir === 'none' ? 'Idle' : batteryDir === 'charge' ? 'Charging' : 'Discharging'}
            {batteryDir !== 'none' && (
              <>
                {' '}
                <KeyValue value={kwText(t.batteryKw)} unit="kW" />
              </>
            )}
          </Block>
          <Block
            icon={
              <ConsumerIcon
                height={ICON_HEIGHT}
                state={t.shedKw > 0.05 ? 'bad' : t.loadKw > 0.05 ? 'on' : 'idle'}
              />
            }
            title="Consumption"
            value={kwText(t.loadKw ?? 0)}
            color={t.shedKw > 0.05 ? 'var(--ef-bad)' : 'var(--ef-cons)'}
          >
            {t.shedKw > 0.05 ? (
              <span style={{ color: 'var(--ef-bad)' }}>
                <KeyValue value={kwText(t.shedKw)} unit="kW" /> not covered
              </span>
            ) : (
              'The site now'
            )}
          </Block>
        </div>
      </div>
    </div>
  )
}

export default EnergyOverview
