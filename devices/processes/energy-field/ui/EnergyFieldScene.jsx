import React, { useState } from 'react'
import {
  CButton,
  CFormCheck,
  CFormLabel,
  CFormSwitch,
  CFormInput,
  CFormSelect,
  CModal,
  CModalBody,
  CModalFooter,
  CModalHeader,
  CModalTitle,
  CTable,
  CTableBody,
  CTableDataCell,
  CTableRow,
} from '@coreui/react'
import { api, request } from 'src/api/client'
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

// the middle row: the centre's least width (its four day figures side by side), the scene's
// width under which the row stacks (the side blocks, the flows' figures and the centre no longer fit)
const MID_MIN_PX = 440
const MID_STACK_PX = 1080

const LAYOUT_CSS = `
.ef-scene { container-type: inline-size; display: flex; flex-direction: column; gap: 14px; color: var(--ef-ink) }
.ef-card { border: 1px solid var(--ef-line); border-radius: 12px; background: var(--ef-card); padding: 14px 18px }
.ef-row2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px }
/* the side blocks as wide as their content, the centre 42 % of the row - the flows share the rest
   equally, each midway between its blocks (the user, 2026-10-23); the centre its former share */
/* the flows never narrower than their figures, the centre than its four day figures - else they
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
.ef-ops .form-check, .ef-ops label { margin-bottom: 0; display: flex; align-items: center; gap: 0.4rem; white-space: nowrap }
.ef-ops .form-check { min-height: 0; padding-top: 0 }
.ef-ops .form-check-input { margin-top: 0 }
.ef-ops input[type=range] { margin: 0; vertical-align: middle }
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
@container (max-width: ${MID_STACK_PX}px) {
  .ef-mid { grid-template-columns: minmax(0, 1fr) }
  .ef-hflow { transform: rotate(90deg) }
}
`

// the generation's power over its icon - the key figure, close to it (the user's mockup
// images/generation-devices-icons-power.png)
// the energy flows between the blocks (the user's mockup images/energy-streams.png - larger;
// the side ones centred between their neighbours by the grid's flexible columns)
const FLOW_SIZE = 84
// the top / bottom flows' side slots - the big figures beside the chevrons
const FLOW_SIDE = 200
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

const FOR_CHOICES = [
  ['', 'Until changed'],
  ['20', '20 minutes'],
  ['60', '1 hour'],
  ['240', '4 hours'],
  ['eod', 'Until the end of the day'],
  ['other', 'Other...'],
]
const durationText = (min) => (min < 60 ? `${Math.round(min)} min` : `${+(min / 60).toFixed(1)} h`)

/**
 * An operating change asked about (the user, 2026-10-25): why (optional - the command log, a day note the
 * AI reads), for how long (the process puts the previous value back itself at the time), and whether to
 * adapt the batteries' plan now.
 */
const ChangeModal = ({ label, canAdapt, onCancel, onConfirm }) => {
  const [reason, setReason] = useState('')
  const [choice, setChoice] = useState('')
  const [amount, setAmount] = useState('30')
  const [unit, setUnit] = useState('min')
  const minutes = (() => {
    if (choice === 'eod') {
      const end = new Date()
      end.setHours(24, 0, 0, 0)
      return Math.max(1, Math.round((end.getTime() - Date.now()) / 60_000))
    }
    if (choice === 'other') {
      const n = Number(amount)
      return Number.isFinite(n) && n > 0 ? Math.round(unit === 'h' ? n * 60 : n) : null
    }
    return choice ? Number(choice) : null
  })()
  const extra = { reason: reason.trim(), forMinutes: minutes }
  const invalid = choice === 'other' && !minutes
  return (
    <CModal visible alignment="center" onClose={onCancel}>
      <CModalHeader>
        <CModalTitle>{label}</CModalTitle>
      </CModalHeader>
      <CModalBody className="d-flex flex-column gap-3">
        <div>
          <CFormLabel className="small mb-1">Why (optional)</CFormLabel>
          <CFormInput
            value={reason}
            maxLength={200}
            placeholder="e.g. a storm coming, repairs on the inverter"
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
        <div>
          <CFormLabel className="small mb-1">For</CFormLabel>
          <div className="d-flex gap-2 flex-wrap">
            <CFormSelect
              value={choice}
              style={{ width: 'auto' }}
              onChange={(e) => setChoice(e.target.value)}
            >
              {FOR_CHOICES.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </CFormSelect>
            {choice === 'other' && (
              <>
                <CFormInput
                  type="number"
                  min={1}
                  value={amount}
                  style={{ width: 90 }}
                  aria-label="How long"
                  onChange={(e) => setAmount(e.target.value)}
                />
                <CFormSelect
                  value={unit}
                  style={{ width: 'auto' }}
                  aria-label="The unit"
                  onChange={(e) => setUnit(e.target.value)}
                >
                  <option value="min">min</option>
                  <option value="h">hours</option>
                </CFormSelect>
              </>
            )}
          </div>
          {minutes && (
            <div className="small text-body-secondary mt-1">
              Put back by itself in {durationText(minutes)}.
            </div>
          )}
        </div>
        {canAdapt && (
          <div className="small">
            Adapt the batteries&apos; plan to the new value now? Otherwise the value is switched and
            the plan follows it at its next update.
          </div>
        )}
      </CModalBody>
      <CModalFooter>
        <CButton color="secondary" variant="ghost" onClick={onCancel}>
          Cancel
        </CButton>
        <CButton
          color={canAdapt ? 'secondary' : 'primary'}
          variant={canAdapt ? 'outline' : undefined}
          disabled={invalid}
          onClick={() => onConfirm(false, extra)}
        >
          {canAdapt ? 'Only switch' : 'Switch'}
        </CButton>
        {canAdapt && (
          <CButton color="primary" disabled={invalid} onClick={() => onConfirm(true, extra)}>
            Adapt the plan
          </CButton>
        )}
      </CModalFooter>
    </CModal>
  )
}

const Stat = StatTile

/**
 * The tariff's gauge on the grid's icon: the purchase zones (the grid's config) ranked by price,
 * the zone now (its metrics) - null without zones or a zone now.
 */
const tariffOf = (purchase, gm) => {
  const zones = [...new Map((purchase?.zones ?? []).map((z) => [z.key, z])).values()].sort(
    (a, b) => a.priceCtKwh - b.priceCtKwh,
  )
  const index = zones.findIndex((z) => z.key === gm?.tariffZone)
  if (index < 0) return null
  const name = (z) => z.label ?? z.key
  const lines = [
    `Tariff zone now: ${name(zones[index])} (${index + 1} of ${zones.length}, cheapest first)`,
    ...zones.map((z) => `${name(z)}: ${z.from}-${z.to}, ${fmt(z.priceCtKwh, 1)} ct/kWh`),
  ]
  if (purchase?.mode === 'market' && gm?.buyCtKwh != null)
    lines.push(`Buying at the market price now: ${fmt(gm.buyCtKwh, 1)} ct/kWh`)
  return { index, count: zones.length, title: lines.join('\n') }
}

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
  // the operating parameters belong to the Energy Ledger (its plan keeps them): a change asks whether
  // to adapt the plan now (the user, 2026-10-25) - Adapt / Only switch / Cancel
  const ledgerId = process.config?.ledgerProcessId ?? null
  const sendLedger = (action, params) => {
    if (!ledgerId) return
    setError(null)
    api.sendProcessCommand(ledgerId, action, params).catch((err) => setError(err.message))
  }
  const [pending, setPending] = useState(null)
  // `apply(adapt, { reason, forMinutes })`; `noteOn` - the process whose day note tells why / for how long
  const ask = (label, apply, noteOn) => setPending({ label, apply, noteOn })
  const confirmChange = (adapt, { reason, forMinutes }) => {
    pending.apply(adapt, { ...(reason ? { reason } : {}), ...(forMinutes ? { forMinutes } : {}) })
    // the reason and the time - a day note of the process (the AI sees it), the window - the change's time
    if ((reason || forMinutes) && pending.noteOn) {
      const now = new Date()
      const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
      request(`/processes/${pending.noteOn}/day-notes`, {
        method: 'POST',
        body: JSON.stringify({
          day,
          kind: 'other',
          text: `${pending.label}${forMinutes ? ` for ${durationText(forMinutes)}` : ''}${reason ? ` - ${reason}` : ''}`,
          startsAt: now.toISOString(),
          endsAt: forMinutes ? new Date(now.getTime() + forMinutes * 60_000).toISOString() : null,
        }),
      }).catch((err) => setError(err.message))
    }
    setPending(null)
  }
  const [reserveDraft, setReserveDraft] = useState(null)
  const reserveChosen = (pct) => {
    if (pct === (m.strategy?.reservePct ?? 20)) return setReserveDraft(null)
    if (!ledgerId) {
      send('setReserve', { pct })
      return setReserveDraft(null)
    }
    ask(
      `Outage reserve ${pct} %`,
      (adapt, extra) => {
        sendLedger('setOperating', { reservePct: pct, replan: adapt, ...extra })
        setReserveDraft(null)
      },
      ledgerId,
    )
  }
  if (!m.totals)
    return (
      <div className="text-body-secondary small p-3">No state yet - the process hasn't run.</div>
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
    const shown = used ? [...own, { key: null, name: 'Other' }] : [{ key: null, name: null }]
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
  const tariff = tariffOf(grid?.config?.purchase, gridMetrics)
  const voltage =
    gridMetrics?.outage || !phases.length
      ? 'none'
      : phases.some((v) => v !== null && Math.abs(v - nominalV) > tolV)
        ? 'bad'
        : 'ok'
  const gridFlow = t.gridKw > 0.05 ? 'import' : t.gridKw < -0.05 ? 'export' : 'none'
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
  const balance = (gridMetrics?.today?.revenueEur ?? 0) - (gridMetrics?.today?.costEur ?? 0)
  // the next 24 h of prices, hour by hour (the mean of the hour's slots)
  const priceHours = (() => {
    const slots = (prices?.slots ?? []).filter(
      (s) => s.t + s.minutes * 60_000 > now - 3_600_000 && s.buyCtKwh !== null,
    )
    const byHour = new Map()
    for (const s of slots) {
      const h = Math.floor(s.t / 3_600_000) * 3_600_000
      if (!byHour.has(h)) byHour.set(h, [])
      byHour.get(h).push(s.buyCtKwh)
    }
    return [...byHour.entries()].slice(0, 24).map(([h, v]) => ({
      t: h,
      ct: v.reduce((a, b) => a + b, 0) / v.length,
      now: now >= h && now < h + 3_600_000,
    }))
  })()
  const ranked = [...priceHours].sort((a, b) => a.ct - b.ct)
  const cheapLimit = ranked[Math.floor(ranked.length * 0.25)]?.ct
  const dearLimit = ranked[Math.floor(ranked.length * 0.75)]?.ct
  const maxCt = Math.max(1, ...priceHours.map((p) => p.ct))

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
        <GridIcon
          height={180}
          flow={gridFlow}
          voltage={voltage}
          outage={gridMetrics?.outage}
          tariff={tariff}
        />
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
  const alertLine = (a) => (a ? `\n${a.level === 'critical' ? 'Error' : 'Warning'}: ${a.text}` : '')
  const unitsLine = (list) => (list.length ? `\nError: ${list.join('; ')}` : '')
  const more = "\nClick for the details and today's chart"
  const flowTitles = {
    generation:
      (generation > 0.05
        ? `Generation ${kwText(generation)} kW (PV ${kwText(t.pvKw ?? 0)}, wind ${kwText(t.windKw ?? 0)}) - for us`
        : 'No generation now') +
      unitsLine(genAlerts) +
      more,
    grid:
      (gridFlow === 'import'
        ? `Import ${kwText(t.gridKw)} kW from the grid at ${fmt(gridMetrics?.buyCtKwh, 1)} ct/kWh - against us`
        : gridFlow === 'export'
          ? `Export ${kwText(-t.gridKw)} kW to the grid at ${fmt(gridMetrics?.sellCtKwh, 1)} ct/kWh - for us`
          : 'No flow to or from the grid') +
      alertLine(alerts.grid) +
      more,
    supply:
      (t.loadKw > 0.05
        ? `The site's consumption ${kwText(t.loadKw)} kW - against us`
        : 'No consumption') +
      (t.shedKw > 0.05 ? `\nError: ${kwText(t.shedKw)} kW not covered` : '') +
      alertLine(alerts.load) +
      more,
    batteries:
      (batteryDir === 'charge'
        ? `The batteries charging ${kwText(-t.batteryKw)} kW - for us (stored)`
        : batteryDir === 'discharge'
          ? `The batteries discharging ${kwText(t.batteryKw)} kW - the stored energy spent`
          : 'The batteries idle') +
      ` - ${fmt(t.socPct, 0)} %` +
      unitsLine(batAlerts) +
      more,
  }
  const seriesKey = (k) => `process:${process.id}:field.${k}`
  const reserveShown = reserveDraft ?? m.strategy?.reservePct ?? 20

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
        title={`${b.name} - ${b.on ? `${fmt(b.socPct, 0)} %, ${fmt(b.kw)} kW` : 'switched off'}`}
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
              <span className="sum-unit">kWp</span> PV,
            </span>
            <span className="sum-value" style={{ color: 'var(--ef-gen)' }}>
              {fmt(capacity.windKw, 1)}
            </span>
            <span className="sum-text">
              <span className="sum-unit">kW</span> wind,
            </span>
            <span className="sum-value" style={{ color: 'var(--ef-batt)' }}>
              {fmt(capacity.kWh, 0)}
            </span>
            <span className="sum-text">
              <span className="sum-unit">kWh</span> storage
            </span>
          </span>
        </div>
        {error && <span className="small text-danger">{error}</span>}
      </div>

      {/* the plant's notes (the field's - technical: outages, maintenance) - first, above the weather */}
      <DayNotes
        processId={process.id}
        kinds={['outage', 'maintenance', 'other']}
        title="The plant today"
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
            title="Generation"
            color="var(--ef-gen)"
            hint="The generation now - the PV blocks and the wind turbines"
            items={[{ v: kwText(t.pvKw) }, 'kW PV +', { v: kwText(t.windKw) }, 'kW wind']}
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
                      wind
                    </>
                  )}
                  {g.pv.filter((x) => !x.on).length +
                    g.wind.filter((x) => x.state === 'off').length >
                    0 &&
                    ` - ${g.pv.filter((x) => !x.on).length + g.wind.filter((x) => x.state === 'off').length} off`}
                </span>
              </div>
            )}
            <div className="d-flex flex-wrap align-items-end" style={{ gap: '4px 2px' }}>
              {g.pv.map((x) => (
                <button
                  key={x.nodeId}
                  type="button"
                  className="ef-device"
                  title={`${x.name} - ${x.on ? `${fmt(x.kw, 2)} kW` : 'switched off'}${unitAlert(x.nodeId) ? ` - ${unitAlert(x.nodeId)}` : ''}`}
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
                  title={`${x.name} - ${x.state === 'off' ? 'switched off' : `${fmt(x.kw, 2)} kW, ${fmt(x.rpm, 0)} rpm`}${unitAlert(x.nodeId) ? ` - ${unitAlert(x.nodeId)}` : ''}`}
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
      </section>

      <div className="d-flex justify-content-center align-items-center gap-3">
        <span className="d-flex justify-content-end" style={{ width: FLOW_SIDE }}>
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
          label={`Generation ${kwText(generation)} kW`}
          title={flowTitles.generation}
          onClick={() => setPopup({ kind: 'generation' })}
        />
        <span style={{ width: FLOW_SIDE }} />
      </div>

      <div className="ef-mid">
        <button
          type="button"
          className="ef-device ef-side px-3"
          onClick={() => setPopup({ kind: 'grid' })}
          title="Grid connection - details"
        >
          <span className="ef-side-icon">
            <GridIcon
              flow={gridFlow}
              voltage={voltage}
              outage={gridMetrics?.outage}
              tariff={tariff}
            />
          </span>
          <span className="fw-semibold">Grid</span>
          <span className="small ef-muted text-center" style={{ lineHeight: 1.45 }}>
            {phases.length ? `${phases.map((v) => fmt(v, 0)).join(' / ')} V` : '-'} -{' '}
            {fmt(gridMetrics?.frequencyHz, 2)} Hz
            <br />
            {/* the tariff zone - the icon's gauge shows it (the user, 2026-10-25: the lines as the consumer's) */}
            buy <KeyValue value={fmt(gridMetrics?.buyCtKwh, 1)} color="var(--ef-grid)" /> - sell{' '}
            <KeyValue value={fmt(gridMetrics?.sellCtKwh, 1)} color="var(--ef-grid)" />{' '}
            <span className="kv-unit ms-0">ct/kWh</span>
          </span>
        </button>
        <div className="d-flex flex-column align-items-center gap-1">
          {gridFlow !== 'export' && <FlowFigure kw={Math.abs(t.gridKw)} color={gridColor} />}
          {gridFlow === 'export' && (
            <span className="ef-flow-word" style={{ color: 'var(--ef-gain)' }}>
              export
            </span>
          )}
          <span className="ef-hflow">
            <Flow
              dir={gridFlow === 'export' ? 'left' : 'right'}
              kw={Math.abs(t.gridKw)}
              scaleKw={scaleKw}
              color={gridColor}
              size={FLOW_SIZE}
              label={`Grid ${gridFlow} ${kwText(Math.abs(t.gridKw))} kW`}
              title={flowTitles.grid}
              onClick={() => setPopup({ kind: 'grid' })}
            />
          </span>
          {gridFlow === 'export' ? (
            <FlowFigure kw={Math.abs(t.gridKw)} color="var(--ef-gain)" />
          ) : (
            <span className="ef-flow-word" style={{ color: gridColor }} title={flowTitles.grid}>
              {gridFlow}
            </span>
          )}
        </div>

        <section
          className="ef-card"
          style={{ borderWidth: 2, borderColor: 'var(--ef-panel-grid)' }}
        >
          <div className="d-flex align-items-center justify-content-between gap-2 flex-wrap mb-2">
            <div className="btn-group" role="group" aria-label="Mode">
              {[
                ['auto', 'Auto', 'The batteries follow the prices and the surplus by themselves'],
                ['manual', 'Manual', 'The batteries at the power you set'],
                [
                  'island',
                  'Island',
                  'Off the grid - the site lives on its own generation and batteries',
                ],
              ].map(([key, label, hint]) => (
                <CButton
                  key={key}
                  color="primary"
                  variant={m.mode === key ? undefined : 'outline'}
                  disabled={!control}
                  title={control ? hint : `${hint} - you may only watch`}
                  aria-pressed={m.mode === key}
                  onClick={() => send('setMode', { mode: key })}
                >
                  {label}
                </CButton>
              ))}
            </div>
            <span className="small ef-muted">
              Self-sufficiency today{' '}
              <b style={{ color: 'var(--ef-ink)' }}>{fmt(today.selfSufficiencyPct, 0)} %</b>
            </span>
          </div>
          <div className="fw-semibold mb-2">{m.decision}</div>
          {priceHours.length > 0 && (
            <div className="mb-2">
              <div className="d-flex justify-content-between small ef-muted">
                <span>Prices, the next 24 hours</span>
                <span>ct/kWh</span>
              </div>
              <div
                className="d-flex align-items-end"
                style={{ gap: 2, height: 46 }}
                role="img"
                aria-label="Buy prices by hour"
              >
                {priceHours.map((p) => (
                  <div
                    key={p.t}
                    title={`${new Date(p.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${fmt(p.ct, 1)} ct/kWh`}
                    style={{
                      flex: '1 1 0',
                      height: `${Math.max(3, (p.ct / maxCt) * 44)}px`,
                      background: p.now
                        ? 'var(--ef-grid)'
                        : p.ct <= cheapLimit
                          ? 'var(--ef-batt)'
                          : p.ct >= dearLimit
                            ? 'var(--ef-cons)'
                            : 'var(--ef-panel-grid)',
                      outline: p.now ? '2px solid var(--ef-ink)' : undefined,
                      borderRadius: '2px 2px 0 0',
                    }}
                  />
                ))}
              </div>
              <div className="d-flex gap-3 small ef-muted flex-wrap mt-1">
                <span>
                  <span
                    style={{
                      display: 'inline-block',
                      width: 10,
                      height: 6,
                      background: 'var(--ef-batt)',
                    }}
                  />{' '}
                  cheap - charge
                </span>
                <span>
                  <span
                    style={{
                      display: 'inline-block',
                      width: 10,
                      height: 6,
                      background: 'var(--ef-cons)',
                    }}
                  />{' '}
                  dear - sell
                </span>
                <span>
                  now {fmt(gridMetrics?.buyCtKwh, 1)} / {fmt(gridMetrics?.sellCtKwh, 1)}
                </span>
              </div>
            </div>
          )}
          <div
            className="d-grid mb-2"
            style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8 }}
          >
            <Stat label="Generated">
              <KeyValue
                value={fmt((today.pvKwh ?? 0) + (today.windKwh ?? 0), 0)}
                unit="kWh"
                color="var(--ef-gain)"
              />
            </Stat>
            <Stat label="Bought">
              <KeyValue value={fmt(today.importKwh, 0)} unit="kWh" color="var(--ef-cost)" />
            </Stat>
            <Stat label="Sold">
              <KeyValue value={fmt(today.exportKwh, 0)} unit="kWh" color="var(--ef-gain)" />
            </Stat>
            <Stat label="Balance">
              <KeyValue
                value={`${balance >= 0 ? '+' : ''}${fmt(balance, 2)}`}
                unit="EUR"
                color={balance >= 0 ? 'var(--ef-gen)' : 'var(--ef-bad)'}
              />
            </Stat>
          </div>
          {/* one line, centred: the switches' own margin and the label's taken off (the user, 2026-10-25) */}
          <div className="d-flex gap-2 align-items-center justify-content-between small ef-ops">
            <CFormSwitch
              id={`ef-grid-${process.id}`}
              label="Grid connected"
              title="Connected to the grid - off switches the site to island mode"
              checked={m.mode !== 'island'}
              disabled={!control}
              onChange={(e) => {
                const mode = e.target.checked ? 'auto' : 'island'
                ask(
                  mode === 'island' ? 'Island mode - off the grid' : 'Back on the grid',
                  (adapt, extra) => {
                    send('setMode', { mode, ...extra })
                    if (adapt) sendLedger('replan', {})
                  },
                  process.id,
                )
              }}
            />
            <CFormSwitch
              id={`ef-export-${process.id}`}
              label="Selling allowed"
              title="The surplus may go to the grid at the sale price; off - it is stored or held back"
              checked={m.strategy?.exportAllowed ?? true}
              disabled={!control}
              onChange={(e) => {
                const allowed = e.target.checked
                if (!ledgerId) return send('setExport', { allowed })
                ask(
                  allowed ? 'Selling allowed' : 'Selling not allowed',
                  (adapt, extra) =>
                    sendLedger('setOperating', { exportAllowed: allowed, replan: adapt, ...extra }),
                  ledgerId,
                )
              }}
            />
            <label
              className="d-flex align-items-center gap-2 flex-grow-1 justify-content-end"
              htmlFor={`ef-reserve-${process.id}`}
              title="The outage reserve - the batteries' charge kept for an outage"
            >
              Reserve
              <input
                id={`ef-reserve-${process.id}`}
                type="range"
                min={0}
                max={80}
                step={5}
                value={reserveShown}
                disabled={!control}
                onChange={(e) => setReserveDraft(Number(e.target.value))}
                onMouseUp={(e) => reserveChosen(Number(e.target.value))}
                onKeyUp={(e) => reserveChosen(Number(e.target.value))}
                onTouchEnd={(e) => reserveChosen(Number(e.target.value))}
                style={{ flex: '1 1 auto', minWidth: 24, maxWidth: 110, width: 0 }}
              />
              <b className="text-nowrap">{reserveShown} %</b>
            </label>
          </div>
        </section>

        <div className="d-flex flex-column align-items-center gap-1">
          <FlowFigure kw={t.loadKw} color={loadColor} />
          <span className="ef-hflow">
            <Flow
              dir="right"
              kw={t.loadKw - (t.shedKw ?? 0)}
              scaleKw={scaleKw}
              color={loadColor}
              size={FLOW_SIZE}
              label={`Supply ${kwText(t.loadKw)} kW`}
              title={flowTitles.supply}
              onClick={() => setPopup({ kind: 'consumer' })}
            />
          </span>
          <span className="ef-flow-word" style={{ color: loadColor }} title={flowTitles.supply}>
            supply
          </span>
        </div>
        <button
          type="button"
          className="ef-device ef-side px-3"
          onClick={() => setPopup({ kind: 'consumer' })}
          title="Consumption - details"
        >
          <span className="ef-side-icon">
            <ConsumerIcon state={consumerState} />
          </span>
          <span className="fw-semibold text-center">{m.consumer?.name ?? 'Consumption'}</span>
          <span className="small ef-muted text-center" style={{ lineHeight: 1.45 }}>
            <KeyValue value={kwText(t.loadKw)} unit="kW" color="var(--ef-cons)" /> now
            {t.shedKw > 0.05 && (
              <>
                <br />
                <span style={{ color: 'var(--ef-bad)' }}>{kwText(t.shedKw)} kW not covered</span>
              </>
            )}
            <br />
            today <KeyValue value={fmt(today.loadKwh, 0)} unit="kWh" color="var(--ef-cons)" />
          </span>
        </button>
      </div>

      <div className="d-flex justify-content-center align-items-center gap-3">
        <span
          className="d-flex justify-content-end"
          style={{ width: FLOW_SIDE, color: batteryColor }}
        >
          {batteryDir === 'discharge' ? (
            <span className="ef-flow-word">discharging</span>
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
          label={`Batteries ${batteryDir} ${kwText(Math.abs(t.batteryKw))} kW`}
          title={flowTitles.batteries}
          onClick={() => setPopup({ kind: 'batteries' })}
        />
        <span className="d-flex" style={{ width: FLOW_SIDE, color: batteryColor }}>
          {batteryDir === 'discharge' ? (
            <FlowFigure kw={Math.abs(t.batteryKw)} color={batteryColor} />
          ) : (
            <span className="ef-flow-word">{batteryDir === 'charge' ? 'charging' : 'idle'}</span>
          )}
        </span>
      </div>

      <section className="ef-card">
        <SummaryLine
          className="mb-2"
          title="Batteries"
          color="var(--ef-batt)"
          hint="The batteries' charge - the share and the energy of their capacity"
          items={[
            { v: fmt(t.socPct, 0) },
            '% -',
            { v: fmt(batteryKwh, 0) },
            `of ${fmt(capacity.kWh, 0)} kWh`,
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
                  title="The group's charge, its stored energy, its power now"
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
                      'idle'
                    ) : (
                      <span style={{ color: kw < 0 ? 'var(--ef-gain)' : 'var(--ef-cost)' }}>
                        <KeyValue value={kwText(Math.abs(kw))} unit="kW" />{' '}
                        {kw < 0 ? 'charging' : 'discharging'}
                      </span>
                    )}
                    {g.items.length > on.length && ` - ${g.items.length - on.length} off`}
                  </span>
                </div>
              )}
              <div className="ef-batteries">{g.items.map((b) => batteryTile(b))}</div>
            </div>
          )
        })}
      </section>

      {pending && (
        <ChangeModal
          label={pending.label}
          canAdapt={!!ledgerId}
          onCancel={() => (setPending(null), setReserveDraft(null))}
          onConfirm={confirmChange}
        />
      )}
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
      ? 'Grid connection'
      : kind === 'consumer'
        ? (m.consumer?.name ?? 'Consumption')
        : kind === 'generation'
          ? 'Generation'
          : kind === 'batteries'
            ? 'Batteries'
            : item.name
  const t = m.totals ?? {}
  const today = m.today ?? {}
  const footer = (kind === 'pv' || kind === 'wind' || kind === 'battery') && (
    <div className="d-flex justify-content-between align-items-center border-top pt-2 mt-2 flex-wrap gap-2">
      <CFormCheck
        id={`ef-on-${item.nodeId}`}
        label={kind === 'battery' ? 'In operation (contactor closed)' : 'In operation'}
        title={control ? 'Switch this unit on or off' : 'You may only watch'}
        checked={!!on}
        disabled={!control}
        onChange={(e) => send('setEnabled', { nodeId: item.nodeId, enabled: e.target.checked })}
      />
      <span className="small text-body-secondary">
        Limits and parameters - in the process's configuration
      </span>
    </div>
  )
  return (
    <UnitPopup
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
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 12 }}
        >
          {kind === 'pv' && (
            <>
              <Stat label="Power">
                <KeyValue value={fmt(live?.kw, 2)} unit="kW" />
              </Stat>
              <Stat label="Size">
                {fmt(spec?.kWp, 1)} kWp / {fmt(spec?.acKw, 0)} kW AC
              </Stat>
              <Stat label="Yield factor">
                <KeyValue value={fmt(spec?.yieldFactor ?? 1, 2)} />
              </Stat>
            </>
          )}
          {kind === 'wind' && (
            <>
              <Stat label="Power">
                <KeyValue value={fmt(live?.kw, 2)} unit="kW" />
              </Stat>
              <Stat label="Rotor">
                <KeyValue value={fmt(live?.rpm, 0)} unit="rpm" />
              </Stat>
              <Stat label="State">{live?.state}</Stat>
              <Stat label="Rated">
                {fmt(spec?.ratedKw, 1)} kW at {fmt(spec?.ratedMs, 0)} m/s
              </Stat>
              <Stat label="Cut-in / out">
                {fmt(spec?.cutInMs, 0)} / {fmt(spec?.cutOutMs, 0)} m/s
              </Stat>
            </>
          )}
          {kind === 'battery' && (
            <>
              <Stat label="Charge">
                <KeyValue value={fmt(live?.socPct, 0)} unit="%" />
              </Stat>
              <Stat label="Power">
                {fmt(Math.abs(live?.kw ?? 0))} kW {live?.kw < 0 ? 'in' : live?.kw > 0 ? 'out' : ''}
              </Stat>
              <Stat label="DC">
                <KeyValue value={fmt(live?.voltage, 0)} unit="V" />
              </Stat>
              <Stat label="Current">
                <KeyValue value={fmt(live?.currentA, 1)} unit="A" />
              </Stat>
              <Stat label="Capacity">
                {fmt(spec?.capacityKwh, 0)} kWh / {fmt(spec?.maxChargeKw, 0)} kW
              </Stat>
            </>
          )}
          {kind === 'grid' && (
            <>
              <Stat label="Power">
                {fmt(Math.abs(gridMetrics?.powerKw ?? 0))} kW {gridMetrics?.flow}
              </Stat>
              <Stat label="Phases">
                {(gridMetrics?.phasesV ?? []).map((v) => fmt(v, 0)).join(' / ')} V
              </Stat>
              <Stat label="Frequency">
                <KeyValue value={fmt(gridMetrics?.frequencyHz, 2)} unit="Hz" />
              </Stat>
              <Stat label="Buy / sell">
                {fmt(gridMetrics?.buyCtKwh, 1)} / {fmt(gridMetrics?.sellCtKwh, 1)} ct
              </Stat>
              <Stat label="Today">
                {fmt(gridMetrics?.today?.costEur, 2)} / +{fmt(gridMetrics?.today?.revenueEur, 2)}{' '}
                EUR
              </Stat>
            </>
          )}
          {kind === 'generation' && (
            <>
              <Stat label="Now">
                <KeyValue value={fmt((t.pvKw ?? 0) + (t.windKw ?? 0))} unit="kW" />
              </Stat>
              <Stat label="PV / wind">
                {fmt(t.pvKw)} / {fmt(t.windKw)} kW
              </Stat>
              <Stat label="Today">
                <KeyValue value={fmt((today.pvKwh ?? 0) + (today.windKwh ?? 0), 0)} unit="kWh" />
              </Stat>
              <Stat label="Held back">
                <KeyValue value={fmt(t.curtailedKw)} unit="kW" />
              </Stat>
            </>
          )}
          {kind === 'batteries' && (
            <>
              <Stat label="Charge">
                <KeyValue value={fmt(t.socPct, 0)} unit="%" />
              </Stat>
              <Stat label="Power">
                {fmt(Math.abs(t.batteryKw ?? 0))} kW{' '}
                {t.batteryKw < -0.05 ? 'in' : t.batteryKw > 0.05 ? 'out' : ''}
              </Stat>
              <Stat label="Today in / out">
                {fmt(today.chargeKwh, 0)} / {fmt(today.dischargeKwh, 0)} kWh
              </Stat>
              <Stat label="Units on">
                {(m.batteries ?? []).filter((b) => b.on).length} of {(m.batteries ?? []).length}
              </Stat>
            </>
          )}
          {kind === 'consumer' && (
            <>
              <Stat label="Now">
                <KeyValue value={fmt(t.loadKw)} unit="kW" />
              </Stat>
              <Stat label="Today">
                <KeyValue value={fmt(today.loadKwh, 0)} unit="kWh" />
              </Stat>
              <Stat label="Not covered">
                <KeyValue value={fmt(t.shedKw)} unit="kW" />
              </Stat>
            </>
          )}
        </div>
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
              ? ["The field's PV today, kW (all blocks)"]
              : kind === 'wind'
                ? ["The field's wind today, kW (all turbines)"]
                : kind === 'generation'
                  ? ['PV today, kW', 'Wind today, kW']
                  : kind === 'battery' || kind === 'batteries'
                    ? [
                        'The array - state of charge, %',
                        'The array - power, kW (+ discharge / - charge)',
                      ]
                    : kind === 'grid'
                      ? ['The grid today, kW (+ import / - export)']
                      : ['Consumption today, kW']
          }
        />
      </div>
    </UnitPopup>
  )
}

export default EnergyFieldScene
