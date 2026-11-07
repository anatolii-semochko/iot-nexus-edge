import React, { useState } from 'react'
import { CFormCheck, CModal, CModalBody, CModalHeader, CModalTitle } from '@coreui/react'
import { api } from 'src/api/client'
import { useCan } from 'src/access'
import { useNow } from 'src/hooks/useNow'
import KeyValue from 'src/components/KeyValue'
import SummaryLine from 'src/components/SummaryLine'
import UnitPopup from 'src/components/nodeInfo/UnitPopup'
import AiButton from 'src/components/ai/AiButton'
import {
  BatteryIcon,
  ConsumerIcon,
  Flow,
  GenerationIcon,
  GridIcon,
  PriceGauge,
  GEN_ICON_HEIGHT,
  PvIcon,
  SCENE_CSS,
  TurbineIcon,
} from './fieldIcons'
import { SunWidget, WindWidget } from '../../weather-control/ui/WeatherWidgets'
import DayNotes from 'src/components/dayNotes/DayNotes'
import { currentHour, fmt, nextHours, useFieldData } from './useFieldData'
import { useFlowLimits } from './useFlowLimits'
import SeriesChart from 'src/components/charts/SeriesChart'
import StatTile from 'src/components/StatTile'
import LedgerBlock from './LedgerBlock'
import { LEVEL_COLOR, priceHoursOf, priceLevel } from './priceLevels'
import { packageT } from 'src/i18n'
// the package's words (its own locales/, then the core's)
const tr = packageT('energy-field')

// The Energy Field - the user's scene (Dashboard component, images/AQUARIUM
// V17-V19.png and the reviewed mockup 2026-10-19): the sky and the wind,
// the generation by groups, the grid -> control -> consumer row, the
// battery array; the energy flows between them. Rubber: the generation and
// battery blocks wrap by the width (the icons' size by their count), the
// middle row stacks when narrow (container queries). Every device opens a
// popup; monitoring and basic control only (commands - processes.control);
// the technical config is the process's.

// the flows' figures (the user's mockup images/fix-energy-panel-1.png): the power big, its word
// in proportion; orange - energy taken (import, supply, discharge), green - given (generation,
// export, charge)
const FLOW_VALUE_REM = 2.4
const FLOW_WORD_REM = 1.25
// on a narrow scene (the flows inside the blocks)
const FLOW_VALUE_NARROW_REM = 1.8
const FLOW_WORD_NARROW_REM = 1.05

// the middle row: the centre's least width (its five day figures side by side), the scene's
// width under which the row stacks (the side blocks, the flows' figures and the centre no longer fit)
const MID_MIN_PX = 440
const MID_STACK_PX = 1080
// the top / bottom flows' side slots - the big figures beside the chevrons (a wide scene; a narrow one -
// shared equally)
const FLOW_SIDE = 200

const LAYOUT_CSS = `
.ef-scene { container-type: inline-size; display: flex; flex-direction: column; gap: 14px; color: var(--ef-ink) }
.ef-card { border: 1px solid var(--ef-line); border-radius: 12px; background: var(--ef-card); padding: 14px 18px }
.ef-row2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px }
/* the side blocks as wide as their content, the centre 42 % of the row - the flows share the rest
   equally, each midway between its blocks (the user, 2026-10-23); the centre its former share */
/* the flows never narrower than their figures, the centre than its five day figures - else they
   overlap (images/bug-electricity-blocks.png); the row stacks before that (MID_STACK_PX) */
.ef-mid { display: grid; grid-template-columns: max-content minmax(max-content, 1fr) minmax(${MID_MIN_PX}px, 42%) minmax(max-content, 1fr) max-content; gap: 6px; align-items: center }
.ef-device { border: 0; background: transparent; color: inherit; padding: 4px; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 2px; border-radius: 8px }
.ef-device:hover, .ef-device:focus-visible { background: var(--cui-tertiary-bg) }
.ef-side { align-self: stretch; justify-content: flex-end }
.ef-side-icon { flex: 1 1 auto; align-self: stretch; position: relative; min-height: 104px }
.ef-side-icon > svg { position: absolute; inset: 0; width: 100%; height: 100% }
/* .kv is 1.2em of its parent */
.ef-flow-value { font-size: ${FLOW_VALUE_REM / 1.2}rem; line-height: 1.1 }
.ef-flow-value .kv-unit { color: inherit; font-style: normal }
.ef-flow-word { font-size: ${FLOW_WORD_REM}rem }
.ef-flow-btn { border: 0; background: transparent; padding: 0; line-height: 0; color: inherit; cursor: pointer; border-radius: 8px }
.ef-flow-btn:hover, .ef-flow-btn:focus-visible { background: var(--cui-tertiary-bg) }
.ef-flow-btn:disabled { cursor: default; background: transparent }
.ef-muted { color: var(--ef-muted) }
.ef-unit-power { font-size: 14px; line-height: 1; margin-bottom: 2px }
/* the unit grey as every other word (.kv-unit - the user, 2026-10-25) */
/* a battery tile's power - a little further from its chevrons (the user, 2026-10-24) */
.ef-batteries .ef-unit-power { margin-bottom: 5px }
.ef-batteries { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px }
@container (max-width: 760px) {
  .ef-row2 { grid-template-columns: minmax(0, 1fr) }
}
/* the generation's and the batteries' flows: the figure, the chevrons, the word */
.ef-flowrow { display: flex; justify-content: center; align-items: center; gap: 1rem }
.ef-flowrow-side { display: flex; width: ${FLOW_SIDE}px }
.ef-narrow-only { display: none }
/* a narrow scene (the user, 2026-11-07): the generation's flow at the bottom of its block, the batteries'
   on top of theirs; the grid with its flow on the right, the ledger, the consumption with its flow on the
   left - two columns; the gaps as the scene's */
@container (max-width: ${MID_STACK_PX}px) {
  .ef-wide-only { display: none }
  .ef-narrow-only { display: block }
  .ef-flowrow { gap: 0.5rem }
  .ef-flowrow-side { width: auto; flex: 1 1 0; min-width: 0 }
  /* the figures and the words smaller - a block's width holds the figure, the chevrons and the word */
  .ef-flow-value { font-size: ${FLOW_VALUE_NARROW_REM / 1.2}rem }
  .ef-flow-word { font-size: ${FLOW_WORD_NARROW_REM}rem }
  .ef-mid { grid-template-columns: repeat(2, minmax(0, 1fr)); grid-template-areas: "grid gridflow" "ledger ledger" "supply consumer"; gap: 14px }
  .ef-mid > :nth-child(1) { grid-area: grid }
  .ef-mid > :nth-child(2) { grid-area: gridflow }
  .ef-mid > :nth-child(3) { grid-area: ledger }
  .ef-mid > :nth-child(4) { grid-area: supply }
  .ef-mid > :nth-child(5) { grid-area: consumer }
  .ef-hflow { transform: rotate(90deg) }
}
`

// the generation's power over its icon - the key figure, close to it (the user's mockup
// images/generation-devices-icons-power.png)
// the energy flows between the blocks (the user's mockup images/energy-streams.png - larger;
// the side ones centred between their neighbours by the grid's flexible columns)
const FLOW_SIZE = 84
// the grid's two price gauges (buy, sell) under its title
const GAUGE_PX = 64
// a battery tile's chevrons (the user's mockup images/fix-accum-ui.png): larger - their strokes
// 29 x 35 px - between the power and the battery; the charge's figures inside the battery,
// nothing under it (the user, 2026-10-24)
const TILE_FLOW_SIZE = 41
const TILE_FLOW_MARGIN = { margin: '-5.5px 0 -1.5px' }

/** A flow's power - big, in its colour (the words beside it - `.ef-flow-word`). */
const FlowFigure = ({ kw, color }) => (
  <span className="ef-flow-value" style={{ color }}>
    <KeyValue value={kwText(kw)} unit="kW" />
  </span>
)

/**
 * A unit's power over its icon - the PV blocks, the turbines, the batteries alike (the user,
 * 2026-10-24): the figure bold, its "kW" small and light grey - there to read, not to catch the
 * eye; `color` - the figure's own (the batteries' state colours); "off" for a unit switched off.
 */
const UnitPower = ({ kw, off = false, offText = 'off', color }) =>
  off ? (
    <span className="ef-unit-power fw-semibold" style={{ color: 'var(--ef-off)' }}>
      {offText}
    </span>
  ) : (
    <span className="ef-unit-power">
      <KeyValue value={kwText(kw)} unit="kW" color={color} />
    </span>
  )
const kwText = (kw) => (Math.abs(kw) >= 100 ? fmt(kw, 0) : fmt(kw, 1))

const Popup = ({ title, subtitle, onClose, children }) => (
  <CModal visible onClose={onClose} size="xl" alignment="center">
    <CModalHeader>
      <CModalTitle>
        {title}
        {subtitle && <div className="small text-body-secondary fw-normal">{subtitle}</div>}
      </CModalTitle>
    </CModalHeader>
    <CModalBody>{children}</CModalBody>
  </CModal>
)

const Stat = StatTile

const EnergyFieldScene = ({ process }) => {
  const can = useCan()
  const { m, grid, gridMetrics, forecast, prices } = useFieldData(process)
  const [popup, setPopup] = useState(null)
  const now = useNow(60_000)
  const [error, setError] = useState(null)
  const control = can('processes.control', { process: process.id })
  const configure = can('processes.config', { process: process.id })
  const send = (action, params) => {
    setError(null)
    api.sendProcessCommand(process.id, action, params).catch((err) => setError(err.message))
  }
  if (!m.totals)
    return (
      <div className="text-body-secondary small p-3">
        {tr("No state yet - the process hasn't run.")}
      </div>
    )

  const t = m.totals
  const today = m.today ?? {}
  const hourNow = currentHour(forecast, now)
  const next = nextHours(forecast, 8, now)
  const pvItems = m.pv ?? []
  const windItems = m.wind ?? []
  const height = GEN_ICON_HEIGHT
  // the groups (the engineer's - the process's Settings): none used - all together, no heading; some -
  // by them, the ungrouped ones in "Other" (the generation and the batteries alike)
  const byGroups = (block, lists) => {
    const own = (m.groups ?? []).filter((g) => (g.block ?? 'generation') === block)
    const keys = new Set(own.map((g) => g.key))
    const inGroup = (x, key) => (key === null ? !keys.has(x.group) : x.group === key)
    const used = Object.values(lists).some((list) => list.some((x) => keys.has(x.group)))
    const shown = used ? [...own, { key: null, name: tr('Other') }] : [{ key: null, name: null }]
    return shown
      .map((g) => ({
        ...g,
        ...Object.fromEntries(
          Object.entries(lists).map(([k, list]) => [k, list.filter((x) => inGroup(x, g.key))]),
        ),
      }))
      .filter((g) => Object.keys(lists).some((k) => g[k].length))
  }
  const groups = byGroups('generation', { pv: pvItems, wind: windItems })
  const batteryGroups = byGroups('batteries', { items: m.batteries ?? [] })
  const capacity = {
    kWp: (process.config?.pvBlocks ?? []).reduce((a, b) => a + (b.kWp ?? 0), 0),
    windKw: (process.config?.turbines ?? []).reduce((a, b) => a + (b.ratedKw ?? 0), 0),
    kWh: (process.config?.batteries ?? []).reduce((a, b) => a + (b.capacityKwh ?? 0), 0),
  }
  const generation = (t.pvKw ?? 0) + (t.windKw ?? 0)
  const nominalV = grid?.config?.quality?.nominalV ?? 230
  const tolV = (nominalV * (grid?.config?.quality?.voltageTolerancePct ?? 10)) / 100
  const phases = gridMetrics?.phasesV ?? []
  const voltage =
    gridMetrics?.outage || !phases.length
      ? 'none'
      : phases.some((v) => v !== null && Math.abs(v - nominalV) > tolV)
        ? 'bad'
        : 'ok'
  const gridFlow = t.gridKw > 0.05 ? 'import' : t.gridKw < -0.05 ? 'export' : 'none'
  // the prices now among the next 24 hours' - the grid's gauges (the Ledger block's figures alike)
  const hoursAhead = priceHoursOf(prices, now)
  const buyLevel = priceLevel(
    gridMetrics?.buyCtKwh,
    hoursAhead.map((p) => p.buy),
  )
  const sellLevel = priceLevel(
    gridMetrics?.sellCtKwh,
    hoursAhead.map((p) => p.sell),
    true,
  )
  const scaleKw = Math.max(50, capacity.kWp * 0.8)
  const batteryKwh = (m.batteries ?? []).reduce(
    (a, b) =>
      a +
      (b.on
        ? ((b.socPct ?? 0) / 100) *
          ((process.config?.batteries ?? []).find((x) => x.nodeId === b.nodeId)?.capacityKwh ?? 0)
        : 0),
    0,
  )
  const consumerState = t.shedKw > 0.05 ? 'bad' : t.loadKw > 0.05 ? 'on' : 'idle'
  // a device popup's big live picture - the scene's own drawing, larger
  const pictureOf = (p) => {
    const find = (list) => (list ?? []).find((x) => x.nodeId === p.item?.nodeId)
    if (p.kind === 'pv') {
      const x = find(m.pv)
      return <PvIcon height={190} on={!!x?.on && x.kw > 0} />
    }
    if (p.kind === 'wind') {
      const x = find(m.wind)
      return <TurbineIcon height={190} rpm={x?.rpm ?? 0} state={x?.state ?? 'idle'} />
    }
    if (p.kind === 'battery') {
      const b = find(m.batteries)
      const spec = (process.config?.batteries ?? []).find((x) => x.nodeId === p.item?.nodeId)
      return (
        <BatteryIcon
          width={200}
          level={b?.on ? b.socPct : null}
          state={b?.on ? 'ok' : 'off'}
          charging={(b?.kw ?? 0) < -0.05}
          kwh={((b?.socPct ?? 0) / 100) * (spec?.capacityKwh ?? 0)}
          figures
        />
      )
    }
    if (p.kind === 'generation') {
      const running = (m.wind ?? []).filter((x) => x.rpm > 0)
      const rpm = running.length ? running.reduce((a, x) => a + x.rpm, 0) / running.length : 0
      return <GenerationIcon height={170} on={(t.pvKw ?? 0) + (t.windKw ?? 0) > 0.05} rpm={rpm} />
    }
    if (p.kind === 'batteries')
      return (
        <BatteryIcon
          width={200}
          level={t.socPct ?? null}
          state="ok"
          charging={(t.batteryKw ?? 0) < -0.05}
          kwh={((t.socPct ?? 0) / 100) * capacity.kWh}
          figures
        />
      )
    if (p.kind === 'grid')
      return (
        <GridIcon height={180} flow={gridFlow} voltage={voltage} outage={gridMetrics?.outage} />
      )
    return <ConsumerIcon height={180} state={consumerState} />
  }
  const nodeIdOf = (p) =>
    p.item?.nodeId ??
    (p.kind === 'consumer'
      ? (m.consumer?.nodeId ?? null)
      : p.kind === 'grid'
        ? (grid?.node_id ?? null)
        : null)
  const batteryDir = t.batteryKw < -0.05 ? 'charge' : t.batteryKw > 0.05 ? 'discharge' : 'none'
  const batteryColor =
    batteryDir === 'charge'
      ? 'var(--ef-gain)'
      : batteryDir === 'discharge'
        ? 'var(--ef-cost)'
        : 'var(--ef-off)'
  // the critical states (the process's alerts.ts) over the three colours: red - an error (a limit, a
  // rating), yellow - a warning (well over the plan); the state and the reason in each flow's title
  const alerts = m.alerts ?? { grid: null, load: null, units: {} }
  const unitAlert = (nodeId) => alerts.units?.[nodeId] ?? null
  const levelColor = (a, normal) =>
    a?.level === 'critical' ? 'var(--ef-bad)' : a?.level === 'warning' ? 'var(--ef-warn)' : normal
  const gridColor = levelColor(
    alerts.grid,
    gridFlow === 'export'
      ? 'var(--ef-gain)'
      : gridFlow === 'none'
        ? 'var(--ef-off)'
        : 'var(--ef-cost)',
  )
  const loadColor = levelColor(
    alerts.load,
    consumerState === 'idle' ? 'var(--ef-off)' : 'var(--ef-cost)',
  )
  const genAlerts = [...pvItems, ...windItems].map((x) => unitAlert(x.nodeId)).filter(Boolean)
  const batAlerts = (m.batteries ?? []).map((x) => unitAlert(x.nodeId)).filter(Boolean)
  const alertLine = (a) =>
    a ? `\n${a.level === 'critical' ? tr('Error') : tr('Warning')}: ${a.text}` : ''
  const unitsLine = (list) => (list.length ? tr(' Error: {{join}}', { join: list.join('; ') }) : '')
  const more = tr("Click for the details and today's chart")
  const flowTitles = {
    generation:
      (generation > 0.05
        ? tr('Generation {{kwText}} kW (PV {{kwText2}}, wind {{kwText22}}) - for us', {
            kwText: kwText(generation),
            kwText2: kwText(t.pvKw ?? 0),
            kwText22: kwText(t.windKw ?? 0),
          })
        : tr('No generation now')) +
      unitsLine(genAlerts) +
      more,
    grid:
      (gridFlow === 'import'
        ? tr('Import {{kwText}} kW from the grid at {{fmt}} ct/kWh - against us', {
            kwText: kwText(t.gridKw),
            fmt: fmt(gridMetrics?.buyCtKwh, 1),
          })
        : gridFlow === 'export'
          ? tr('Export {{kwText}} kW to the grid at {{fmt}} ct/kWh - for us', {
              kwText: kwText(-t.gridKw),
              fmt: fmt(gridMetrics?.sellCtKwh, 1),
            })
          : tr('No flow to or from the grid')) +
      alertLine(alerts.grid) +
      more,
    supply:
      (t.loadKw > 0.05
        ? tr("The site's consumption {{kwText}} kW - against us", {
            kwText: kwText(t.loadKw),
          })
        : tr('No consumption')) +
      (t.shedKw > 0.05
        ? tr(' Error: {{kwText}} kW not covered', { kwText: kwText(t.shedKw) })
        : '') +
      alertLine(alerts.load) +
      more,
    batteries:
      (batteryDir === 'charge'
        ? tr('The batteries charging {{kwText}} kW - for us (stored)', {
            kwText: kwText(-t.batteryKw),
          })
        : batteryDir === 'discharge'
          ? tr('The batteries discharging {{kwText}} kW - the stored energy spent', {
              kwText: kwText(t.batteryKw),
            })
          : tr('The batteries idle')) +
      ` - ${fmt(t.socPct, 0)} %` +
      unitsLine(batAlerts) +
      more,
  }
  const seriesKey = (k) => `process:${process.id}:field.${k}`

  // a battery unit's tile: its power, the current's arrows, the battery with its charge
  const batteryTile = (b) => {
    const spec = (process.config?.batteries ?? []).find((x) => x.nodeId === b.nodeId)
    const dir = !b.on ? 'none' : b.kw < -0.05 ? 'in' : b.kw > 0.05 ? 'out' : 'none'
    const over =
      !!unitAlert(b.nodeId) ||
      (spec && Math.abs(b.kw) > Math.max(spec.maxChargeKw, spec.maxDischargeKw) * 1.02)
    return (
      <button
        key={b.nodeId}
        type="button"
        className="ef-device"
        title={`${b.name} - ${b.on ? tr('{{fmt}} %, {{fmt2}} kW', { fmt: fmt(b.socPct, 0), fmt2: fmt(b.kw) }) : tr('switched off')}`}
        onClick={() => setPopup({ kind: 'battery', item: b })}
      >
        <UnitPower
          kw={Math.abs(b.kw ?? 0)}
          color={
            !b.on || dir === 'none'
              ? 'var(--ef-off)'
              : over
                ? 'var(--ef-bad)'
                : dir === 'out'
                  ? 'var(--ef-cost)'
                  : 'var(--ef-gain)'
          }
        />
        <span className="d-flex" style={TILE_FLOW_MARGIN}>
          <Flow
            dir={dir === 'out' ? 'up' : 'down'}
            kw={dir === 'none' ? 0 : Math.abs(b.kw)}
            scaleKw={spec?.maxChargeKw ?? 60}
            color={over ? 'var(--ef-bad)' : dir === 'out' ? 'var(--ef-cost)' : 'var(--ef-gain)'}
            size={TILE_FLOW_SIZE}
            label={`${b.name} ${dir}`}
          />
        </span>
        <BatteryIcon
          width={130}
          level={b.on ? b.socPct : null}
          state={b.on ? 'ok' : 'off'}
          charging={dir === 'in'}
          kwh={((b.socPct ?? 0) / 100) * (spec?.capacityKwh ?? 0)}
          figures
        />
      </button>
    )
  }

  // the generation's and the batteries' flows - between the blocks on a wide scene, inside their blocks
  // on a narrow one (the generation's at its bottom, the batteries' on top; the user, 2026-11-07)
  const generationFlow = (
    <div className="ef-flowrow">
      <span className="ef-flowrow-side justify-content-end">
        <FlowFigure
          kw={generation}
          color={generation > 0.05 ? 'var(--ef-gain)' : 'var(--ef-off)'}
        />
      </span>
      <Flow
        dir="down"
        kw={generation}
        scaleKw={scaleKw}
        color={genAlerts.length ? 'var(--ef-bad)' : 'var(--ef-gain)'}
        size={FLOW_SIZE}
        label={tr('Generation {{kwText}} kW', { kwText: kwText(generation) })}
        title={flowTitles.generation}
        onClick={() => setPopup({ kind: 'generation' })}
      />
      <span
        className="ef-flowrow-side"
        style={{ color: generation > 0.05 ? 'var(--ef-gain)' : 'var(--ef-off)' }}
      >
        <span className="ef-flow-word" title={flowTitles.generation}>
          {tr('generation')}
        </span>
      </span>
    </div>
  )
  const batteryFlow = (
    <div className="ef-flowrow">
      <span className="ef-flowrow-side justify-content-end" style={{ color: batteryColor }}>
        {batteryDir === 'discharge' ? (
          <span className="ef-flow-word">{tr('discharging')}</span>
        ) : (
          <FlowFigure kw={Math.abs(t.batteryKw)} color={batteryColor} />
        )}
      </span>
      <Flow
        dir={batteryDir === 'discharge' ? 'up' : 'down'}
        kw={Math.abs(t.batteryKw)}
        scaleKw={scaleKw}
        color={batAlerts.length ? 'var(--ef-bad)' : batteryColor}
        size={FLOW_SIZE}
        label={tr('Batteries {{batteryDir}} {{kwText}} kW', {
          batteryDir,
          kwText: kwText(Math.abs(t.batteryKw)),
        })}
        title={flowTitles.batteries}
        onClick={() => setPopup({ kind: 'batteries' })}
      />
      <span className="ef-flowrow-side" style={{ color: batteryColor }}>
        {batteryDir === 'discharge' ? (
          <FlowFigure kw={Math.abs(t.batteryKw)} color={batteryColor} />
        ) : (
          <span className="ef-flow-word">
            {batteryDir === 'charge' ? tr('charging') : tr('idle')}
          </span>
        )}
      </span>
    </div>
  )

  return (
    <div className="ef-scene">
      <style>{SCENE_CSS + LAYOUT_CSS}</style>

      <div className="d-flex align-items-baseline justify-content-between flex-wrap gap-2">
        <div className="d-flex align-items-baseline gap-3 flex-wrap">
          <strong style={{ fontSize: '1.4rem' }}>
            {/* the AI's mark before the page's title, larger (the user, 2026-10-25) */}
            <AiButton
              subject={{ type: 'process', id: process.id }}
              label={process.name}
              size={30}
              className="me-2"
            />
            {process.name}
          </strong>
          {/* the capacities as large as the summary lines' figures (the Generation line's - the user, 2026-10-25) */}
          <span className="sum-figures">
            <span className="sum-value" style={{ color: 'var(--ef-gen)' }}>
              {fmt(capacity.kWp, 0)}
            </span>
            <span className="sum-text">
              <span className="sum-unit">kWp</span> {tr('PV,')}
            </span>
            <span className="sum-value" style={{ color: 'var(--ef-gen)' }}>
              {fmt(capacity.windKw, 1)}
            </span>
            <span className="sum-text">
              <span className="sum-unit">kW</span> {tr('wind,')}
            </span>
            <span className="sum-value" style={{ color: 'var(--ef-batt)' }}>
              {fmt(capacity.kWh, 0)}
            </span>
            <span className="sum-text">
              <span className="sum-unit">kWh</span> {tr('storage')}
            </span>
          </span>
        </div>
        {error && <span className="small text-danger">{error}</span>}
      </div>

      {/* the plant's notes (the field's - technical: outages, maintenance) - first, above the weather */}
      <DayNotes
        processId={process.id}
        kinds={['outage', 'maintenance', 'other']}
        title={tr('The plant today')}
        cardClass="ef-card"
        units={[
          ...(process.config?.pvBlocks ?? []),
          ...(process.config?.turbines ?? []),
          ...(process.config?.batteries ?? []),
        ].map((u) => ({ nodeId: u.nodeId, name: u.name }))}
      />

      <div className="ef-row2">
        <SunWidget
          cardClass="ef-card"
          m={m}
          forecast={forecast}
          weatherId={process.config?.weatherProcessId ?? null}
        />
        <WindWidget
          cardClass="ef-card"
          m={m}
          forecast={forecast}
          weatherId={process.config?.weatherProcessId ?? null}
        />
      </div>

      <section className="ef-card">
        <div className="d-flex align-items-center justify-content-between gap-2 mb-2 flex-wrap">
          <SummaryLine
            title={tr('Generation')}
            color="var(--ef-gen)"
            hint={tr('The generation now - the PV blocks and the wind turbines')}
            items={[{ v: kwText(t.pvKw) }, tr('kW PV +'), { v: kwText(t.windKw) }, tr('kW wind')]}
          />
        </div>
        {groups.map((g) => (
          <div key={g.key ?? '-'} className="mb-2">
            {g.name !== null && (
              <div className="d-flex align-items-baseline gap-2">
                <span className="fw-semibold">{g.name}</span>
                <span className="small ef-muted">
                  <KeyValue
                    value={kwText(g.pv.reduce((a, x) => a + x.kw, 0))}
                    unit="kW"
                    color="var(--ef-gen)"
                  />{' '}
                  PV
                  {g.wind.length > 0 && (
                    <>
                      ,{' '}
                      <KeyValue
                        value={kwText(g.wind.reduce((a, x) => a + x.kw, 0))}
                        unit="kW"
                        color="var(--ef-gen)"
                      />{' '}
                      {tr('wind')}
                    </>
                  )}
                  {g.pv.filter((x) => !x.on).length +
                    g.wind.filter((x) => x.state === 'off').length >
                    0 &&
                    tr(' - {{v0}} off', {
                      v0:
                        g.pv.filter((x) => !x.on).length +
                        g.wind.filter((x) => x.state === 'off').length,
                    })}
                </span>
              </div>
            )}
            <div className="d-flex flex-wrap align-items-end" style={{ gap: '4px 2px' }}>
              {g.pv.map((x) => (
                <button
                  key={x.nodeId}
                  type="button"
                  className="ef-device"
                  title={`${x.name} - ${x.on ? `${fmt(x.kw, 2)} kW` : tr('switched off')}${unitAlert(x.nodeId) ? ` - ${unitAlert(x.nodeId)}` : ''}`}
                  onClick={() => setPopup({ kind: 'pv', item: x })}
                >
                  <UnitPower
                    kw={x.kw}
                    off={!x.on}
                    color={unitAlert(x.nodeId) ? 'var(--ef-bad)' : 'var(--ef-gen)'}
                  />
                  <PvIcon height={height} on={x.on && x.kw > 0} />
                </button>
              ))}
              {g.wind.map((x) => (
                <button
                  key={x.nodeId}
                  type="button"
                  className="ef-device"
                  title={`${x.name} - ${x.state === 'off' ? tr('switched off') : tr('{{fmt}} kW, {{fmt2}} rpm', { fmt: fmt(x.kw, 2), fmt2: fmt(x.rpm, 0) })}${unitAlert(x.nodeId) ? ` - ${unitAlert(x.nodeId)}` : ''}`}
                  onClick={() => setPopup({ kind: 'wind', item: x })}
                >
                  {x.state === 'storm' ? (
                    <UnitPower off offText="storm" />
                  ) : (
                    <UnitPower
                      kw={x.kw}
                      off={x.state === 'off'}
                      color={unitAlert(x.nodeId) ? 'var(--ef-bad)' : 'var(--ef-gen)'}
                    />
                  )}
                  <TurbineIcon height={height} rpm={x.rpm} state={x.state} />
                </button>
              ))}
            </div>
          </div>
        ))}
        <div className="ef-narrow-only">{generationFlow}</div>
      </section>

      <div className="ef-wide-only">{generationFlow}</div>

      <div className="ef-mid">
        <button
          type="button"
          className="ef-device ef-side px-3"
          onClick={() => setPopup({ kind: 'grid' })}
          title={tr('Grid connection - details')}
        >
          <span className="ef-side-icon">
            <GridIcon flow={gridFlow} voltage={voltage} outage={gridMetrics?.outage} />
          </span>
          <span className="fw-semibold">{tr('Grid')}</span>
          {/* the prices now on their gauges (the user's mockup images/fix-icon-energy-tower-1.png): buy -
              red to the right (dear), sell - red to the left (cheap); the phases and the frequency - the popup */}
          <span className="d-flex gap-3 justify-content-center small ef-muted">
            {[
              ['buy', gridMetrics?.buyCtKwh, buyLevel, false],
              ['sell', gridMetrics?.sellCtKwh, sellLevel, true],
            ].map(([word, ct, level, higherIsBetter]) => (
              <span key={word} className="d-flex flex-column align-items-center">
                <PriceGauge
                  share={level?.share}
                  higherIsBetter={higherIsBetter}
                  width={GAUGE_PX}
                  title={tr('{{v0}} now at {{fmt}} ct/kWh - {{v2}}', {
                    v0: word === 'buy' ? 'Buying' : 'Selling',
                    fmt: fmt(ct, 1),
                    v2: level
                      ? `${{ good: 'good', fair: 'middle', bad: 'poor' }[level.level]} among the next 24 hours`
                      : 'no prices ahead',
                  })}
                />
                <span className="text-nowrap">
                  {tr(word)}{' '}
                  <KeyValue
                    value={fmt(ct, 1)}
                    className={level ? `text-${LEVEL_COLOR[level.level]}` : undefined}
                  />
                </span>
              </span>
            ))}
          </span>
        </button>
        <div className="d-flex flex-column align-items-center gap-1">
          {gridFlow !== 'export' && <FlowFigure kw={Math.abs(t.gridKw)} color={gridColor} />}
          {gridFlow === 'export' && (
            <span className="ef-flow-word" style={{ color: 'var(--ef-gain)' }}>
              {tr('export')}
            </span>
          )}
          <span className="ef-hflow">
            <Flow
              dir={gridFlow === 'export' ? 'left' : 'right'}
              kw={Math.abs(t.gridKw)}
              scaleKw={scaleKw}
              color={gridColor}
              size={FLOW_SIZE}
              label={tr('Grid {{gridFlow}} {{kwText}} kW', {
                gridFlow,
                kwText: kwText(Math.abs(t.gridKw)),
              })}
              title={flowTitles.grid}
              onClick={() => setPopup({ kind: 'grid' })}
            />
          </span>
          {gridFlow === 'export' ? (
            <FlowFigure kw={Math.abs(t.gridKw)} color="var(--ef-gain)" />
          ) : (
            <span className="ef-flow-word" style={{ color: gridColor }} title={flowTitles.grid}>
              {tr(gridFlow)}
            </span>
          )}
        </div>

        <LedgerBlock process={process} data={{ m, gridMetrics, prices }} />

        <div className="d-flex flex-column align-items-center gap-1">
          <FlowFigure kw={t.loadKw} color={loadColor} />
          <span className="ef-hflow">
            <Flow
              dir="right"
              kw={t.loadKw - (t.shedKw ?? 0)}
              scaleKw={scaleKw}
              color={loadColor}
              size={FLOW_SIZE}
              label={tr('Supply {{kwText}} kW', { kwText: kwText(t.loadKw) })}
              title={flowTitles.supply}
              onClick={() => setPopup({ kind: 'consumer' })}
            />
          </span>
          <span className="ef-flow-word" style={{ color: loadColor }} title={flowTitles.supply}>
            {tr('supply')}
          </span>
        </div>
        <button
          type="button"
          className="ef-device ef-side px-3"
          onClick={() => setPopup({ kind: 'consumer' })}
          title={tr('Consumption - details')}
        >
          <span className="ef-side-icon">
            <ConsumerIcon state={consumerState} />
          </span>
          <span className="fw-semibold text-center">{m.consumer?.name ?? tr('Consumption')}</span>
          <span className="small ef-muted text-center" style={{ lineHeight: 1.45 }}>
            <KeyValue value={kwText(t.loadKw)} unit="kW" color="var(--ef-cons)" /> {tr('now')}
            {t.shedKw > 0.05 && (
              <>
                <br />
                <span style={{ color: 'var(--ef-bad)' }}>
                  {kwText(t.shedKw)} {tr('kW not covered')}
                </span>
              </>
            )}
            <br />
            {tr('today')}{' '}
            <KeyValue value={fmt(today.loadKwh, 0)} unit="kWh" color="var(--ef-cons)" />
          </span>
        </button>
      </div>

      <div className="ef-wide-only">{batteryFlow}</div>

      <section className="ef-card">
        <div className="ef-narrow-only mb-2">{batteryFlow}</div>
        <SummaryLine
          className="mb-2"
          title={tr('Batteries')}
          color="var(--ef-batt)"
          hint={tr("The batteries' charge - the share and the energy of their capacity")}
          items={[
            { v: fmt(t.socPct, 0) },
            '% -',
            { v: fmt(batteryKwh, 0) },
            tr('of {{fmt}} kWh', { fmt: fmt(capacity.kWh, 0) }),
          ]}
        />
        {batteryGroups.map((g) => {
          const on = g.items.filter((b) => b.on)
          const capOf = (b) =>
            (process.config?.batteries ?? []).find((x) => x.nodeId === b.nodeId)?.capacityKwh ?? 0
          const cap = on.reduce((a, b) => a + capOf(b), 0)
          const kwh = on.reduce((a, b) => a + ((b.socPct ?? 0) / 100) * capOf(b), 0)
          const kw = on.reduce((a, b) => a + (b.kw ?? 0), 0)
          return (
            <div key={g.key ?? '-'} className="mb-2">
              {g.name !== null && (
                <div
                  className="d-flex align-items-baseline gap-2"
                  title={tr("The group's charge, its stored energy, its power now")}
                >
                  <span className="fw-semibold">{g.name}</span>
                  <span className="small ef-muted">
                    <KeyValue
                      value={fmt(cap > 0 ? (kwh / cap) * 100 : null, 0)}
                      unit="%"
                      color="var(--ef-batt)"
                    />
                    , <KeyValue value={fmt(kwh, 0)} unit="kWh" color="var(--ef-batt)" />,{' '}
                    {Math.abs(kw) < 0.05 ? (
                      tr('idle')
                    ) : (
                      <span
                        style={{
                          color: kw < 0 ? 'var(--ef-gain)' : 'var(--ef-cost)',
                        }}
                      >
                        <KeyValue value={kwText(Math.abs(kw))} unit="kW" />{' '}
                        {kw < 0 ? tr('charging') : tr('discharging')}
                      </span>
                    )}
                    {g.items.length > on.length &&
                      tr(' - {{v0}} off', { v0: g.items.length - on.length })}
                  </span>
                </div>
              )}
              <div className="ef-batteries">{g.items.map((b) => batteryTile(b))}</div>
            </div>
          )
        })}
      </section>

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
          picture={pictureOf(popup)}
          nodeId={nodeIdOf(popup)}
          onClose={() => setPopup(null)}
        />
      )}
    </div>
  )
}

const DevicePopup = ({
  popup,
  process,
  m,
  gridMetrics,
  grid,
  control,
  send,
  seriesKey,
  gridSeries,
  picture,
  nodeId,
  onClose,
}) => {
  const { kind, item } = popup
  // the lines where the grid's / the consumption's flow turns red or yellow
  const flowLimits = useFlowLimits(process, grid, kind === 'grid' || kind === 'consumer')
  const live =
    kind === 'pv'
      ? (m.pv ?? []).find((x) => x.nodeId === item.nodeId)
      : kind === 'wind'
        ? (m.wind ?? []).find((x) => x.nodeId === item.nodeId)
        : kind === 'battery'
          ? (m.batteries ?? []).find((x) => x.nodeId === item.nodeId)
          : null
  const spec =
    kind === 'pv'
      ? (process.config?.pvBlocks ?? []).find((x) => x.nodeId === item.nodeId)
      : kind === 'wind'
        ? (process.config?.turbines ?? []).find((x) => x.nodeId === item.nodeId)
        : kind === 'battery'
          ? (process.config?.batteries ?? []).find((x) => x.nodeId === item.nodeId)
          : null
  const on = kind === 'wind' ? live?.state !== 'off' : live?.on
  const title =
    kind === 'grid'
      ? tr('Grid connection')
      : kind === 'consumer'
        ? (m.consumer?.name ?? tr('Consumption'))
        : kind === 'generation'
          ? tr('Generation')
          : kind === 'batteries'
            ? tr('Batteries')
            : item.name
  const t = m.totals ?? {}
  const today = m.today ?? {}
  const footer = (kind === 'pv' || kind === 'wind' || kind === 'battery') && (
    <div className="d-flex justify-content-between align-items-center border-top pt-2 mt-2 flex-wrap gap-2">
      <CFormCheck
        id={`ef-on-${item.nodeId}`}
        label={kind === 'battery' ? tr('In operation (contactor closed)') : tr('In operation')}
        title={control ? tr('Switch this unit on or off') : tr('You may only watch')}
        checked={!!on}
        disabled={!control}
        onChange={(e) => send('setEnabled', { nodeId: item.nodeId, enabled: e.target.checked })}
      />
      <span className="small text-body-secondary">
        {tr("Limits and parameters - in the process's configuration")}
      </span>
    </div>
  )
  return (
    <UnitPopup
      charts={
        <SeriesChart
          limits={{
            [gridSeries ?? seriesKey('gridKw')]: kind === 'grid' ? flowLimits.grid : [],
            [seriesKey('loadKw')]: kind === 'consumer' ? flowLimits.load : [],
          }}
          signed={[seriesKey('batteryKw'), seriesKey('gridKw'), gridSeries]}
          keys={
            kind === 'pv'
              ? [seriesKey('pvKw')]
              : kind === 'wind'
                ? [seriesKey('windKw')]
                : kind === 'generation'
                  ? [seriesKey('pvKw'), seriesKey('windKw')]
                  : kind === 'battery' || kind === 'batteries'
                    ? [seriesKey('socPct'), seriesKey('batteryKw')]
                    : kind === 'grid'
                      ? [gridSeries ?? seriesKey('gridKw')]
                      : [seriesKey('loadKw')]
          }
          labels={
            kind === 'pv'
              ? [tr("The field's PV today, kW (all blocks)")]
              : kind === 'wind'
                ? [tr("The field's wind today, kW (all turbines)")]
                : kind === 'generation'
                  ? [tr('PV today, kW'), tr('Wind today, kW')]
                  : kind === 'battery' || kind === 'batteries'
                    ? [
                        tr('The array - state of charge, %'),
                        tr('The array - power, kW (+ discharge / - charge)'),
                      ]
                    : kind === 'grid'
                      ? [tr('The grid today, kW (+ import / - export)')]
                      : [tr('Consumption today, kW')]
          }
        />
      }
      title={title}
      nodeId={nodeId}
      processId={process.id}
      picture={picture}
      footer={footer}
      className="ef-colors"
      onClose={onClose}
    >
      <div>
        <div
          className="d-grid mb-3"
          style={{
            gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
            gap: 12,
          }}
        >
          {kind === 'pv' && (
            <>
              <Stat label={tr('Power')}>
                <KeyValue value={fmt(live?.kw, 2)} unit="kW" />
              </Stat>
              <Stat label={tr('Size')}>
                {fmt(spec?.kWp, 1)} {tr('kWp /')} {fmt(spec?.acKw, 0)} {tr('kW AC')}
              </Stat>
              <Stat label={tr('Yield factor')}>
                <KeyValue value={fmt(spec?.yieldFactor ?? 1, 2)} />
              </Stat>
            </>
          )}
          {kind === 'wind' && (
            <>
              <Stat label={tr('Power')}>
                <KeyValue value={fmt(live?.kw, 2)} unit="kW" />
              </Stat>
              <Stat label={tr('Rotor')}>
                <KeyValue value={fmt(live?.rpm, 0)} unit="rpm" />
              </Stat>
              <Stat label={tr('State')}>{live?.state}</Stat>
              <Stat label={tr('Rated')}>
                {fmt(spec?.ratedKw, 1)} {tr('kW at')} {fmt(spec?.ratedMs, 0)} m/s
              </Stat>
              <Stat label={tr('Cut-in / out')}>
                {fmt(spec?.cutInMs, 0)} / {fmt(spec?.cutOutMs, 0)} m/s
              </Stat>
            </>
          )}
          {kind === 'battery' && (
            <>
              <Stat label={tr('Charge')}>
                <KeyValue value={fmt(live?.socPct, 0)} unit="%" />
              </Stat>
              <Stat label={tr('Power')}>
                {fmt(Math.abs(live?.kw ?? 0))} kW{' '}
                {live?.kw < 0 ? tr('in') : live?.kw > 0 ? tr('out') : ''}
              </Stat>
              <Stat label="DC">
                <KeyValue value={fmt(live?.voltage, 0)} unit="V" />
              </Stat>
              <Stat label={tr('Current')}>
                <KeyValue value={fmt(live?.currentA, 1)} unit="A" />
              </Stat>
              <Stat label={tr('Capacity')}>
                {fmt(spec?.capacityKwh, 0)} {tr('kWh /')} {fmt(spec?.maxChargeKw, 0)} kW
              </Stat>
            </>
          )}
          {kind === 'grid' && (
            <>
              <Stat label={tr('Power')}>
                {fmt(Math.abs(gridMetrics?.powerKw ?? 0))} kW {gridMetrics?.flow}
              </Stat>
              <Stat label={tr('Phases')}>
                {(gridMetrics?.phasesV ?? []).map((v) => fmt(v, 0)).join(' / ')} V
              </Stat>
              <Stat label={tr('Frequency')}>
                <KeyValue value={fmt(gridMetrics?.frequencyHz, 2)} unit={tr('Hz')} />
              </Stat>
              <Stat label={tr('Buy / sell')}>
                {fmt(gridMetrics?.buyCtKwh, 1)} / {fmt(gridMetrics?.sellCtKwh, 1)} {tr('ct')}
              </Stat>
              <Stat label={tr('Today')}>
                {fmt(gridMetrics?.today?.costEur, 2)} / +{fmt(gridMetrics?.today?.revenueEur, 2)}{' '}
                EUR
              </Stat>
            </>
          )}
          {kind === 'generation' && (
            <>
              <Stat label={tr('Now')}>
                <KeyValue value={fmt((t.pvKw ?? 0) + (t.windKw ?? 0))} unit="kW" />
              </Stat>
              <Stat label={tr('PV / wind')}>
                {fmt(t.pvKw)} / {fmt(t.windKw)} kW
              </Stat>
              <Stat label={tr('Today')}>
                <KeyValue value={fmt((today.pvKwh ?? 0) + (today.windKwh ?? 0), 0)} unit="kWh" />
              </Stat>
              <Stat label={tr('Held back')}>
                <KeyValue value={fmt(t.curtailedKw)} unit="kW" />
              </Stat>
            </>
          )}
          {kind === 'batteries' && (
            <>
              <Stat label={tr('Charge')}>
                <KeyValue value={fmt(t.socPct, 0)} unit="%" />
              </Stat>
              <Stat label={tr('Power')}>
                {fmt(Math.abs(t.batteryKw ?? 0))} kW{' '}
                {t.batteryKw < -0.05 ? tr('in') : t.batteryKw > 0.05 ? tr('out') : ''}
              </Stat>
              <Stat label={tr('Today in / out')}>
                {fmt(today.chargeKwh, 0)} / {fmt(today.dischargeKwh, 0)} kWh
              </Stat>
              <Stat label={tr('Units on')}>
                {(m.batteries ?? []).filter((b) => b.on).length} {tr('of')}{' '}
                {(m.batteries ?? []).length}
              </Stat>
            </>
          )}
          {kind === 'consumer' && (
            <>
              <Stat label={tr('Now')}>
                <KeyValue value={fmt(t.loadKw)} unit="kW" />
              </Stat>
              <Stat label={tr('Today')}>
                <KeyValue value={fmt(today.loadKwh, 0)} unit="kWh" />
              </Stat>
              <Stat label={tr('Not covered')}>
                <KeyValue value={fmt(t.shedKw)} unit="kW" />
              </Stat>
            </>
          )}
        </div>
      </div>
    </UnitPopup>
  )
}

export default EnergyFieldScene
