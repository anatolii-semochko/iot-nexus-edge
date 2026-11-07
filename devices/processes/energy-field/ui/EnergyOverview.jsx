import React, { useState } from 'react'
import { CSpinner } from '@coreui/react'
import { api } from 'src/api/client'
import { useCan } from 'src/access'
import KeyValue from 'src/components/KeyValue'
import LedgerBlock from './LedgerBlock'
import { DevicePopup } from './EnergyFieldScene'
import { BatteryIcon, ConsumerIcon, Flow, GenerationIcon, GridIcon, SCENE_CSS } from './fieldIcons'
import { fmt, useFieldData } from './useFieldData'
import { packageT } from 'src/i18n'
// the package's words (its own locales/, then the core's)
const tr = packageT('energy-field')

// The energy's overview (iot AGENTS_TO_DO.md 2026-10-29, the user's layout): a Dashboard component drawn
// at a folder's full width under its blocks - the whole picture at a glance. Three columns, the energy's
// flows between them: the generation over the grid on the left, each with its flow to the right; the
// Energy Ledger in the middle (the Energy scene's own Ledger block - the mode, the prices, today's figures,
// the operating switches - the user, 2026-10-30); the
// batteries over the consumption on the right, each with its flow from the left. The flows - the scene's
// three colours (green - for us, orange - against us, grey - none) and directions (the grid's export and
// the batteries' discharge point back), a margin each side (2026-10-30). Narrow - one column, the flows
// turned down.
// A narrow overview (the user, 2026-11-07 - as the Energy scene's): the generation with its flow at the
// bottom of its block, the grid with its flow on its right, the Ledger, the consumption with its flow on
// its left, the batteries with their flow on top of their block; the wide one unchanged. Each block opens
// the scene's own popup of the whole (the summed figures, the big charts - the scene's DevicePopup).

const FLOW_SIZE = 56
const ICON_HEIGHT = 72
// the Ledger block's least width (its five day figures side by side) and the width the grid stacks under
const MID_MIN_PX = 540
const STACK_PX = 1100

const CSS = `
.eo { container-type: inline-size; }
.eo-grid { display: grid; grid-template-columns: minmax(0, 1fr) max-content minmax(${MID_MIN_PX}px, 2fr) max-content minmax(0, 1fr); gap: 10px; align-items: stretch }
.eo-side { display: grid; grid-template-rows: 1fr 1fr; gap: 10px }
.eo-flows { display: grid; grid-template-rows: 1fr 1fr; gap: 10px; align-items: center; justify-items: center }
.eo-block { display: flex; align-items: center; gap: 14px; padding: 12px 16px; border: 1px solid var(--ef-line); border-radius: 12px; background: var(--ef-card); color: inherit; text-align: start; cursor: pointer; width: 100% }
.eo-block:hover, .eo-block:focus-visible { border-color: var(--cui-primary) }
.eo-block .kv.eo-main { font-size: 1.35rem }
.eo-flow { display: flex; flex-direction: column; align-items: center; line-height: 1.1 }
.eo-flow .kv { font-size: 1.05rem }
.eo-narrow-only { display: none }
@container (max-width: ${STACK_PX}px) {
  .eo-grid { grid-template-columns: max-content minmax(0, 1fr) max-content; grid-template-areas: "gen gen gen" "grid grid gridflow" "ledger ledger ledger" "loadflow load load" "batt batt batt" }
  .eo-side, .eo-flows { display: contents }
  .eo-wide-only { display: none }
  .eo-block { flex-wrap: wrap }
  .eo-narrow-only { display: flex; flex-basis: 100%; justify-content: center }
  .eo-gen { grid-area: gen } .eo-gridb { grid-area: grid } .eo-f-grid { grid-area: gridflow; align-self: center }
  .eo-ledger { grid-area: ledger } .eo-f-load { grid-area: loadflow; align-self: center } .eo-load { grid-area: load }
  .eo-batt { grid-area: batt }
  .eo-flow svg { transform: rotate(90deg) }
  .eo-flow.mx-3 { margin-inline: 4px !important }
}
`

const kwText = (kw) => (Math.abs(kw) >= 100 ? fmt(Math.abs(kw), 0) : fmt(Math.abs(kw), 1))

/** A block: its icon, the key figure and the words under it. */
const Block = ({ icon, title, value, unit = 'kW', color, className, onOpen, top, bottom, children }) => (
  <button type="button" className={`eo-block ${className}`} onClick={onOpen}>
    {top && <div className="eo-narrow-only">{top}</div>}
    <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>{icon}</div>
    <div style={{ minWidth: 0, flex: '1 1 0' }}>
      <div className="fw-semibold">{title}</div>
      <KeyValue value={value} unit={unit} color={color} className="eo-main" />
      <div className="small ef-muted">{children}</div>
    </div>
    {bottom && <div className="eo-narrow-only">{bottom}</div>}
  </button>
)

/** A flow between two columns - its chevrons, its power under them. */
const FlowCell = ({ dir, kw, color, scaleKw, label, className = '' }) => (
  <div className={`eo-flow mx-3 ${className}`}>
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

const EnergyOverview = ({ process }) => {
  const data = useFieldData(process)
  const { m, grid, gridMetrics } = data
  const can = useCan()
  const [popup, setPopup] = useState(null)
  const t = m.totals
  if (!t) return <CSpinner size="sm" />
  const control = can('processes.control', { process: process.id })
  const send = (action, params) => api.sendProcessCommand(process.id, action, params).catch(() => {})
  const seriesKey = (k) => `process:${process.id}:field.${k}`
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
  const genFlow = (
    <FlowCell
      dir="right"
      kw={generation}
      color={generation > 0.05 ? gain : off}
      scaleKw={scaleKw}
      label={tr('Generation {{kwText}} kW', { kwText: kwText(generation) })}
    />
  )
  const gridFlowCell = (
    <FlowCell
      className="eo-f-grid"
      dir={gridFlow === 'export' ? 'left' : 'right'}
      kw={t.gridKw}
      color={gridColor}
      scaleKw={scaleKw}
      label={tr('Grid {{gridFlow}} {{kwText}} kW', { gridFlow, kwText: kwText(t.gridKw) })}
    />
  )
  const battFlow = (
    <FlowCell
      dir={batteryDir === 'discharge' ? 'left' : 'right'}
      kw={t.batteryKw}
      color={batteryColor}
      scaleKw={scaleKw}
      label={tr('Batteries {{batteryDir}} {{kwText}} kW', { batteryDir, kwText: kwText(t.batteryKw) })}
    />
  )
  const loadFlowCell = (
    <FlowCell
      className="eo-f-load"
      dir="right"
      kw={t.loadKw ?? 0}
      color={loadColor}
      scaleKw={scaleKw}
      label={tr('Consumption {{kwText}} kW', { kwText: kwText(t.loadKw ?? 0) })}
    />
  )
  const gridIcon = (h) => (
    <GridIcon
      height={h}
      flow={gridFlow}
      voltage={gridMetrics?.outage ? 'none' : 'ok'}
      outage={gridMetrics?.outage}
    />
  )
  const consumerState = t.shedKw > 0.05 ? 'bad' : t.loadKw > 0.05 ? 'on' : 'idle'
  // the popup's big picture - the block's own icon, larger
  const pictureOf = (kind) =>
    kind === 'generation' ? (
      <GenerationIcon height={170} on={generation > 0.05} rpm={meanRpm} />
    ) : kind === 'grid' ? (
      gridIcon(180)
    ) : kind === 'batteries' ? (
      <BatteryIcon width={200} level={t.socPct ?? null} charging={batteryDir === 'charge'} />
    ) : (
      <ConsumerIcon height={180} state={consumerState} />
    )
  const nodeIdOf = (kind) =>
    kind === 'consumer' ? (m.consumer?.nodeId ?? null) : kind === 'grid' ? (grid?.node_id ?? null) : null
  return (
    <div className="ef-scene eo">
      <style>{SCENE_CSS + CSS}</style>
      <div className="eo-grid">
        <div className="eo-side">
          <Block
            className="eo-gen"
            onOpen={() => setPopup({ kind: 'generation' })}
            bottom={genFlow}
            icon={<GenerationIcon height={ICON_HEIGHT} on={generation > 0.05} rpm={meanRpm} />}
            title={tr('Generation')}
            value={kwText(generation)}
            color={generation > 0.05 ? 'var(--ef-gen)' : off}
          >
            {tr('Solar')} <KeyValue value={kwText(t.pvKw ?? 0)} unit="kW" /> {tr('· wind')}{' '}
            <KeyValue value={kwText(t.windKw ?? 0)} unit="kW" />
          </Block>
          <Block
            className="eo-gridb"
            onOpen={() => setPopup({ kind: 'grid' })}
            icon={gridIcon(ICON_HEIGHT)}
            title={tr('Grid')}
            value={gridMetrics?.outage ? 'outage' : kwText(t.gridKw)}
            unit={gridMetrics?.outage ? '' : 'kW'}
            color={gridMetrics?.outage ? 'var(--ef-bad)' : gridColor}
          >
            {gridFlow === 'none'
              ? tr('No exchange')
              : gridFlow === 'import'
                ? tr('Import')
                : tr('Export')}
            <br />
            {tr('buy')} <KeyValue value={fmt(gridMetrics?.buyCtKwh, 1)} /> {tr('/ sell')}{' '}
            <KeyValue value={fmt(gridMetrics?.sellCtKwh, 1)} />{' '}
            <span className="kv-unit ms-0">ct/kWh</span>
          </Block>
        </div>
        <div className="eo-flows">
          <div className="eo-wide-only">{genFlow}</div>
          {gridFlowCell}
        </div>
        <div className="eo-ledger">
          <LedgerBlock process={process} data={data} />
        </div>
        <div className="eo-flows">
          <div className="eo-wide-only">{battFlow}</div>
          {loadFlowCell}
        </div>
        <div className="eo-side">
          <Block
            className="eo-batt"
            onOpen={() => setPopup({ kind: 'batteries' })}
            top={battFlow}
            icon={
              <BatteryIcon
                width={ICON_HEIGHT * 1.2}
                level={t.socPct}
                charging={batteryDir === 'charge'}
              />
            }
            title={tr('Batteries')}
            value={fmt(t.socPct, 0)}
            unit="%"
            color="var(--ef-batt)"
          >
            {batteryDir === 'none'
              ? tr('Idle')
              : batteryDir === 'charge'
                ? tr('Charging')
                : tr('Discharging')}
            {batteryDir !== 'none' && (
              <>
                {' '}
                <KeyValue value={kwText(t.batteryKw)} unit="kW" />
              </>
            )}
          </Block>
          <Block
            className="eo-load"
            onOpen={() => setPopup({ kind: 'consumer' })}
            icon={<ConsumerIcon height={ICON_HEIGHT} state={consumerState} />}
            title={tr('Consumption')}
            value={kwText(t.loadKw ?? 0)}
            color={t.shedKw > 0.05 ? 'var(--ef-bad)' : 'var(--ef-cons)'}
          >
            {t.shedKw > 0.05 ? (
              <span style={{ color: 'var(--ef-bad)' }}>
                <KeyValue value={kwText(t.shedKw)} unit="kW" /> {tr('not covered')}
              </span>
            ) : (
              tr('The site now')
            )}
          </Block>
        </div>
      </div>
      {popup && (
        <DevicePopup
          popup={popup}
          process={process}
          m={m}
          gridMetrics={gridMetrics}
          grid={grid}
          control={control}
          send={send}
          seriesKey={seriesKey}
          gridSeries={grid ? `process:${grid.id}:grid.powerKw` : null}
          picture={pictureOf(popup.kind)}
          nodeId={nodeIdOf(popup.kind)}
          onClose={() => setPopup(null)}
        />
      )}
    </div>
  )
}

export default EnergyOverview
