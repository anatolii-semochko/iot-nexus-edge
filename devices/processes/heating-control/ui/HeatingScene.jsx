import React, { useState } from 'react'
import { CButton, CButtonGroup } from '@coreui/react'
import { api } from 'src/api/client'
import { useCan } from 'src/access'
import RoundGauge from 'src/components/indicators/RoundGauge'
import KeyValue from 'src/components/KeyValue'
import SummaryLine from 'src/components/SummaryLine'
import { TemperatureWidget } from '../../weather-control/ui/WeatherWidgets'
import GridSupply from './GridSupply'
import DayNotes from 'src/components/dayNotes/DayNotes'
import AiButton from 'src/components/ai/AiButton'
import {
  FAN_COIL_SWITCH,
  FAN_COIL_VIEW,
  FanCoilIcon,
  HeatPumpIcon,
  TankGauges,
  waterLimits,
  TankIcon,
} from './heatIcons'
import HeatingPopup, { FlowPopup } from './HeatingPopup'
import HeatTrend from './HeatTrend'
import { fmt, useHeatingData } from './useHeatingData'
import { packageT } from 'src/i18n'
// the package's words (its own locales/, then the core's)
const tr = packageT('heating-control')

// Heating / cooling - the user's scene (Dashboard component; the user's
// mockup images/heating-condition-control-panel.png, the reviewed icons
// 2026-10-20): the weather on top (its own block - the widgets' common style, 2026-10-24), then
// three blocks top to bottom - the heat pumps,
// the heat storage (buffer tanks), the consumers (fan coils) - each by its
// groups (or one row without them); between the blocks the warm and the
// cold water lines with their temperatures (left, a dual gauge) and the heat
// they carry (right). Monitoring and basic control (the mode, a fan coil's
// valve - commands, processes.control); the technical config is the
// process's. Also the engineer's panel in the process row.

// the heat pumps' head stacks under this scene width (its two halves no longer fit side by side)
const HEAD_STACK_PX = 720
// a tank's gauges from the tank (was 16 px; the user's mockups -2, 2026-10-24)
const TANK_GAUGE_GAP = 8

const SCENE_CSS = `
.ht-scene { --ht-warm: #e5534b; --ht-cold: #1d6fd8; --ht-line: var(--cui-border-color); --ht-muted: var(--cui-secondary-color); }
[data-coreui-theme='dark'] .ht-scene { --ht-warm: #ff6b6b; --ht-cold: #5aa2ff; }
.ht-scene { --wx-sun: #f6b73c; --wx-cloud: #e9eef3; --wx-cloud-edge: #9aa8b6; --wx-moon: #8fb4e0; }
.ht-block { border: 1px solid var(--ht-line); border-radius: 10px; padding: 14px 16px; }
.ht-row { display: flex; flex-wrap: wrap; gap: 14px 22px; align-items: flex-start; }
.ht-unit { display: flex; flex-direction: column; align-items: center; gap: 2px; }
.ht-unit svg { max-width: 100%; height: auto; }
/* the heat pumps' head: the readings now and the mode on the left, the state and today's figures
   on the right; stacked on the left when narrow (the user, 2026-10-24) */
.ht-scene { container-type: inline-size; }
.ht-head { display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 12px 24px; }
.ht-head > div { display: flex; flex-direction: column; gap: 8px; }
/* the summary line on top, the mode's buttons under it at their own width (the user, 2026-10-24) */
.ht-head > div > .btn-group { align-self: flex-start; }
.ht-head-right { align-items: flex-end; text-align: right; }
.ht-head-right > .d-flex { justify-content: flex-end; }
/* the supply row (the user, 2026-11-07): the electricity from the grid on the left (GridSupply.jsx), the
   weather - the heat from outdoors - on the right, as wide; one column when narrow */
.ht-supply { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
.ht-supply .wx-widget { margin: 0; }
@container (max-width: ${HEAD_STACK_PX}px) {
  .ht-head-right { align-items: flex-start; text-align: left; }
  .ht-head-right > .d-flex { justify-content: flex-start; }
  .ht-supply { grid-template-columns: minmax(0, 1fr); }
}
/* a tank's gauges close to it (images/fix-water-tank-scales-distance.png); the next tank as far
   as before */
.ht-tank { display: flex; align-items: center; gap: ${TANK_GAUGE_GAP}px; }
/* a water line's gauges on the left (their rim on the cards' border line), its heat over time
   stretched to the right (images/fix-heat-streams.png, 2026-10-24); the chart under them when narrow */
.ht-stream { display: flex; align-items: stretch; gap: 16px; flex-wrap: wrap; }
/* the line's gauges open its popup (the power today, big - 2026-10-29) */
.ht-stream > .ht-lines-open { flex: 0 1 auto; min-width: 0; max-width: 100%; display: flex; border: 0; padding: 0; background: transparent; cursor: pointer; border-radius: 8px; }
.ht-stream > .ht-lines-open:focus-visible { outline: 2px solid var(--cui-primary); outline-offset: 2px; }
.ht-lines-open > .ht-lines { flex: 0 1 auto; min-width: 0; display: flex; }
.ht-stream > .ht-trend { flex: 1 1 240px; padding: 10px 0 6px; }
.ht-tank-unit { margin-right: ${16 - TANK_GAUGE_GAP}px; }
.ht-caption { font-size: .8rem; color: var(--ht-muted); }
@keyframes ht-dash { to { stroke-dashoffset: -28 } }
.ht-flow { stroke-dasharray: 6 8; animation: ht-dash 1.2s linear infinite; }
@media (prefers-reduced-motion: reduce) { .ht-flow { animation: none } }
.ht-open { border: 0; padding: 0; background: transparent; cursor: pointer; border-radius: 8px; display: block; }
.ht-open:focus-visible { outline: 2px solid var(--cui-primary); outline-offset: 2px; }
.ht-switch { position: absolute; border: 0; padding: 0; background: transparent; cursor: pointer; border-radius: 4px; }
.ht-switch:focus-visible { outline: 2px solid var(--cui-primary); outline-offset: 2px; }
.ht-switch:disabled { cursor: default; }
`

// a heat pump's picture height (the tanks' gauges are as big as its gauges)
const PUMP_HEIGHT = 140
// a fan coil's picture width; its valve switch is a real button over the drawn one
const COIL_WIDTH = 300
const COIL_SCALE = COIL_WIDTH / FAN_COIL_VIEW.w

const MODES = [
  ['auto', tr('Auto'), tr('Heating or cooling by the outdoor temperature')],
  ['heating', tr('Heating'), tr('Heat all the time, whatever the weather')],
  ['cooling', tr('Cooling'), tr('Cool all the time, whatever the weather')],
  ['off', tr('Off'), tr('Switch the heat pumps and the fan coils off')],
]

/**
 * The water lines between two blocks: the warm (red) and the cold (blue)
 * pipe, flowing while heat goes; left - the dual gauge of their
 * temperatures (warm big, cold small), right - the heat they carry.
 */
const Lines = ({ line, mode, maxKw, title }) => {
  const kw = line?.kw ?? 0
  const flowing = Math.abs(kw) > 0.05
  const cooling = mode === 'cooling'
  // the supply water's limits on its own needle - the warm one in heating, the cold one in cooling
  const warmRange = waterLimits(mode, !cooling)
  const coldRange = waterLimits(mode, cooling)
  const dT = line ? line.warmC - line.coldC : null
  // one picture (the user's mockups heating-streams-size.png, -connectors.png): the pipes run the
  // whole height between the blocks, the gauges' size kept, the connectors start on their rims
  // the gauges' size (fix-heat-stream-scales-size-2.png): the diameter ~0.74 of the blocks' gap
  const H = 170
  const R = Math.round(H * 0.37)
  const mid = H / 2
  const left = { cx: R + 4, cy: mid }
  const cold = left.cx + R + 12 // the pipes' left edges
  const warm = cold + 26
  const right = { cx: warm + 12 + 12 + R, cy: mid }
  const W = right.cx + R + 4
  const down = `M0 0 V${H}`
  const up = `M0 ${H} V0`
  return (
    // the left gauge's rim (r + 4 % - RoundGauge) on the cards' left border line
    // its own width at most, narrower with its block (a phone cut the right gauge - 2026-11-07)
    <div
      className="ht-lines"
      title={title}
      style={{ marginLeft: -(left.cx - R * 1.04), width: W, maxWidth: '100%' }}
    >
      <svg
        width="100%"
        style={{ display: 'block', height: 'auto' }}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={tr('The water lines between the blocks')}
      >
        <line
          x1={left.cx + R - 1}
          y1={mid - 8}
          x2={warm}
          y2={mid - 8}
          stroke="var(--ht-warm)"
          strokeWidth="5"
        />
        <line
          x1={left.cx + R - 1}
          y1={mid + 8}
          x2={cold}
          y2={mid + 8}
          stroke="var(--ht-cold)"
          strokeWidth="5"
        />
        <line
          x1={warm + 12}
          y1={mid}
          x2={right.cx - R + 1}
          y2={mid}
          stroke="var(--ht-muted)"
          strokeWidth="5"
        />
        <rect x={cold} y="0" width="12" height={H} fill="var(--ht-cold)" />
        <rect x={warm} y="0" width="12" height={H} fill="var(--ht-warm)" />
        {flowing && (
          <>
            <path
              className="ht-flow"
              transform={`translate(${cold + 6} 0)`}
              d={cooling ? down : up}
              stroke="#ffffff"
              strokeOpacity="0.8"
              strokeWidth="3"
              fill="none"
            />
            <path
              className="ht-flow"
              transform={`translate(${warm + 6} 0)`}
              d={cooling ? up : down}
              stroke="#ffffff"
              strokeOpacity="0.8"
              strokeWidth="3"
              fill="none"
            />
          </>
        )}
        <g>
          <title>
            {tr(
              'Warm {{fmt}} °C (big) / cold {{fmt2}} °C (small, blue) - the difference {{fmt22}} K',
              { fmt: fmt(line?.warmC), fmt2: fmt(line?.coldC), fmt22: fmt(dT) },
            )}
          </title>
          <RoundGauge
            x={left.cx}
            y={left.cy}
            r={R}
            value={line?.warmC}
            limits={warmRange}
            unit="°C"
            inner={{
              value: line?.coldC,
              limits: coldRange,
              unit: '°C',
              color: '#1d6fd8',
            }}
            state={line ? 'active' : 'absent'}
          />
        </g>
        <g>
          {/* one way - the heat or the cold carried, counted up from zero (the user, 2026-10-25) */}
          <title>
            {tr('{{v0}} carried now: {{fmt}} kW', {
              v0: cooling ? 'Cold' : 'Heat',
              fmt: fmt(Math.abs(kw)),
            })}
          </title>
          <RoundGauge
            x={right.cx}
            y={right.cy}
            r={R}
            value={Math.abs(kw)}
            limits={{
              min: 0,
              max: Math.max(1, Math.ceil(maxKw)),
              warnHigh: maxKw * 0.9,
            }}
            unit="kW"
            state={flowing ? 'active' : 'inactive'}
          />
        </g>
      </svg>
    </div>
  )
}

const byGroups = (groups, block, items) => {
  const own = groups.filter((g) => g.block === block)
  const rows = own.map((g) => ({
    key: g.key,
    name: g.name,
    items: items.filter((x) => x.group === g.key),
  }))
  const rest = items.filter((x) => !own.some((g) => g.key === x.group))
  if (rest.length)
    rows.push({
      key: null,
      name: own.length ? tr('Other') : null,
      items: rest,
    })
  return rows.filter((r) => r.items.length)
}

const Groups = ({ rows, render }) =>
  rows.map((g) => (
    <div key={g.key ?? 'none'} className="mb-2">
      {g.name && <div className="fw-semibold mb-2">{g.name}</div>}
      <div className="ht-row">{g.items.map(render)}</div>
    </div>
  ))

const HeatingScene = ({ process, params }) => {
  // a Dashboard page (its params given) - its own title; the process row's panel has the row's
  const can = useCan()
  const { m, forecast } = useHeatingData(process)
  const control = can('processes.control', { process: process.id })
  const [error, setError] = useState(null)
  const [popup, setPopup] = useState(null)
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
  const groups = m.groups ?? []
  const pumps = m.pumps ?? []
  const tanks = m.tanks ?? []
  const coils = m.consumers ?? []
  const ratedKw = pumps.reduce((a, p) => a + (p.ratedHeatKw ?? 0), 0)
  // a tank's power scale: its share of the heat pumps' rated heat
  const tankKw = (ratedKw * 1.2) / Math.max(1, tanks.length)
  const cooling = m.mode === 'cooling'
  // the summary lines' colour - the heat's or the cold's
  const tone = cooling ? 'var(--ht-cold)' : 'var(--ht-warm)'
  const modeText =
    m.control === 'off'
      ? tr('Off')
      : `${cooling ? tr('Cooling') : tr('Heating')} · ${m.control === 'auto' ? 'auto' : tr('set by hand')}`
  const saving =
    today.directEur != null && today.costEur != null ? today.directEur - today.costEur : null
  // the supply row: the heating's electricity from the grid (the heat pumps and the fans); the heat the
  // heat pumps take from the outdoor air (heating - their heat less their electricity) or give off to it
  // (cooling - the cold and their electricity); nothing while they stand
  const gridKw = (t.electricKw ?? 0) + (t.fansKw ?? 0)
  const pumpsHeat = Math.abs(t.heatKw ?? 0)
  const outdoorKw =
    pumpsHeat < 0.05
      ? null
      : cooling
        ? pumpsHeat + (t.electricKw ?? 0)
        : Math.max(0, pumpsHeat - (t.electricKw ?? 0))

  return (
    <div className="ht-scene d-flex flex-column gap-0">
      <style>{SCENE_CSS}</style>
      {/* the page's title with the AI's mark (the user, 2026-10-25) */}
      {params !== undefined && (
        <strong className="mb-3" style={{ fontSize: '1.4rem' }}>
          <AiButton
            subject={{ type: 'process', id: process.id }}
            label={process.name}
            size={30}
            className="me-2"
          />
          {process.name}
        </strong>
      )}
      {/* the heating's notes (maintenance of its plant, rooms closed) - first, above the weather */}
      <div className="mb-3">
        <DayNotes
          processId={process.id}
          kinds={['maintenance', 'room-closed', 'other']}
          title={tr('The heating today')}
          cardClass="ht-block"
          units={[
            ...(process.config?.heatPumps ?? []),
            ...(process.config?.tanks ?? []),
            ...(process.config?.consumers ?? []),
          ].map((u) => ({ nodeId: u.nodeId, name: u.name }))}
        />
      </div>
      <div className="ht-supply mb-3">
        <GridSupply process={process} kw={gridKw} cardClass="ht-block" />
        <TemperatureWidget
          cardClass="ht-block"
          forecast={forecast}
          outdoor={m.outdoor}
          weatherId={process.config?.weatherProcessId ?? null}
          extra={
            outdoorKw !== null && (
              <span
                title={tr(
                  cooling
                    ? 'The heat the heat pumps give off outdoors now - the cold made and their electricity'
                    : 'The heat the heat pumps take from the outdoor air now - their heat less their electricity',
                )}
              >
                {cooling ? tr('to outdoors') : tr('from outdoors')}{' '}
                <KeyValue value={fmt(outdoorKw)} unit="kW" color={tone} />
              </span>
            )
          }
        />
      </div>
      <section className="ht-block" aria-label={tr('The heat pumps')}>
        <div className="ht-head mb-3">
          <div>
            <SummaryLine
              title={tr('Heat pumps')}
              color={tone}
              hint={tr(
                "The heat pumps now: the {{v0}}, the heating's electricity (the heat pumps and the fan coils' fans), the {{v1}}",
                { v0: cooling ? 'cold' : 'heat', v1: cooling ? 'EER' : 'COP' },
              )}
              items={[
                { v: fmt(Math.abs(t.heatKw)) },
                tr('kW {{v0}} -', { v0: cooling ? 'cold' : 'heat' }),
                { v: fmt((t.electricKw ?? 0) + (t.fansKw ?? 0)) },
                tr('kW electricity - {{v0}}', { v0: cooling ? 'EER' : 'COP' }),
                { v: t.cop == null ? null : fmt(t.cop) },
              ]}
            />
            <CButtonGroup size="sm" role="group" aria-label={tr('The mode')}>
              {MODES.map(([key, label, hint]) => (
                <CButton
                  key={key}
                  color="primary"
                  variant={m.control === key ? undefined : 'outline'}
                  disabled={!control}
                  title={control ? hint : tr('{{hint}} - you may only watch', { hint })}
                  onClick={() => send('setMode', { mode: key })}
                >
                  {label}
                </CButton>
              ))}
            </CButtonGroup>
          </div>
          <div className="ht-head-right">
            <div className="small">
              <span
                className="fw-semibold"
                title={tr('The mode now - by the outdoor temperature (auto) or set by hand')}
              >
                {modeText}
              </span>
              {m.plan && m.plan.source === 'planner' && (
                <span
                  className="ms-2 badge bg-info"
                  title={tr("The heating planner's plan: {{units}} unit(s), {{heatKw}} kW{{v2}}", {
                    units: m.plan.units,
                    heatKw: m.plan.heatKw,
                    v2: m.plan.roomOffsetK
                      ? `, the rooms ${m.plan.roomOffsetK} K off their setpoint`
                      : '',
                  })}
                >
                  {tr('by the plan')}
                </span>
              )}
              {m.plan && m.plan.source === 'band' && m.plan.why && m.plan.why !== 'no planner' && (
                <span
                  className="ms-2 text-body-secondary"
                  title={tr('Not by the plan: {{why}}', { why: m.plan.why })}
                >
                  {tr('by the band')}
                </span>
              )}
              {m.charging && (
                <span
                  className="ms-2 text-body-secondary"
                  title={tr('The heat pumps are charging the tanks to their stop temperature')}
                >
                  {tr('charging the tanks')}
                </span>
              )}
              {m.signal && m.signal !== 2 && (
                <span
                  className={`ms-2 badge ${m.signal === 3 ? 'bg-danger' : 'bg-secondary'}`}
                  title={
                    m.signal === 3
                      ? tr(
                          "The Energy Ledger's signal (SG-Ready 3): energy is cheap or the sun gives more than the site takes - the tanks store more heat now",
                        )
                      : tr(
                          "The Energy Ledger's signal (SG-Ready 1): energy is dear - the heat pumps hold off, the tanks carry the rooms",
                        )
                  }
                >
                  {m.signal === 3
                    ? tr('storing heat - cheap energy')
                    : tr('holding off - dear energy')}
                </span>
              )}
            </div>
            <div className="d-flex gap-3 small text-body-secondary flex-wrap">
              <span title={tr('Today: the heat (or cold) the rooms got')}>
                {tr('today')}{' '}
                <KeyValue value={fmt(today.deliveredKwh, 0)} unit="kWh" color={tone} />{' '}
                {tr('to the rooms')}
              </span>
              <span title={tr("Today: the heating's electricity at the slots' prices")}>
                {tr('cost')} <KeyValue value={fmt(today.costEur, 2)} unit="€" />
              </span>
              {saving !== null && (
                <span
                  title={tr('Direct electric heating would have cost {{fmt}} € today', {
                    fmt: fmt(today.directEur, 2),
                  })}
                >
                  {tr('saved')}{' '}
                  <KeyValue value={fmt(saving, 2)} unit="€" className="text-success" />
                </span>
              )}
            </div>
          </div>
        </div>
        <Groups
          rows={byGroups(groups, 'pumps', pumps)}
          render={(p) => (
            <div key={p.nodeId} className="ht-unit">
              <button
                type="button"
                className="ht-open"
                title={tr("{{name}} - the details, today's chart, the model", {
                  name: p.name,
                })}
                onClick={() => setPopup({ kind: 'pump', nodeId: p.nodeId })}
              >
                <HeatPumpIcon pump={p} mode={m.mode} height={PUMP_HEIGHT} />
              </button>
              <span className="ht-caption">{p.name}</span>
            </div>
          )}
        />
      </section>

      <div className="ht-stream">
        <button
          type="button"
          className="ht-lines-open"
          aria-label={tr('The power to the tanks today - the details')}
          onClick={() => setPopup({ kind: 'flow', flow: 'pumpsTanks' })}
        >
          <Lines
            line={m.lines?.pumpsTanks}
            mode={m.mode}
            maxKw={ratedKw * 1.2}
            title={tr("The heat pumps' water to and from the tanks")}
          />
        </button>
        <HeatTrend
          seriesKey={`process:${process.id}:heat.heatKw`}
          label={cooling ? tr('Cold produced') : tr('Heat produced')}
          color="var(--ht-warm)"
        />
      </div>

      <section className="ht-block" aria-label={tr('The heat storage')}>
        <SummaryLine
          className="mb-2"
          title={tr('Heat storage')}
          color={tone}
          hint={tr('The heat stored in all the tanks above their lowest useful temperature')}
          items={[
            { v: fmt(t.tankPct, 0) },
            '% -',
            { v: fmt(t.storedKwh, 1) },
            tr('of {{fmt}} kWh', { fmt: fmt(t.fullKwh, 0) }),
          ]}
        />
        <Groups
          rows={byGroups(groups, 'tanks', tanks)}
          render={(x) => (
            <div key={x.nodeId} className="ht-unit ht-tank-unit">
              <div className="ht-tank">
                <button
                  type="button"
                  className="ht-open"
                  title={tr("{{name}} - the details, today's chart, the model", { name: x.name })}
                  onClick={() => setPopup({ kind: 'tank', nodeId: x.nodeId })}
                >
                  <TankIcon tank={x} height={170} />
                </button>
                <TankGauges tank={x} mode={m.mode} maxKw={tankKw} pumpHeight={PUMP_HEIGHT} />
              </div>
              <span className="ht-caption">{x.name}</span>
            </div>
          )}
        />
      </section>

      <div className="ht-stream">
        <button
          type="button"
          className="ht-lines-open"
          aria-label={tr('The power to the rooms today - the details')}
          onClick={() => setPopup({ kind: 'flow', flow: 'tanksConsumers' })}
        >
          <Lines
            line={m.lines?.tanksConsumers}
            mode={m.mode}
            maxKw={coils.length * 6}
            title={tr("The tanks' water to and from the consumers")}
          />
        </button>
        <HeatTrend
          seriesKey={`process:${process.id}:heat.consumersKw`}
          label={cooling ? tr('Cold used') : tr('Heat used')}
          color="var(--ht-warm)"
        />
      </div>

      <section className="ht-block" aria-label={tr('The consumers')}>
        <SummaryLine
          className="mb-2"
          title={tr('Consumers')}
          color={tone}
          hint={tr(
            'The fan coils now: the {{v0}} they give the rooms, how many have their valve open',
            { v0: cooling ? 'cold' : 'heat' },
          )}
          items={[
            { v: fmt(Math.abs(t.consumersKw ?? 0)) },
            tr('kW {{v0}} to the rooms -', { v0: cooling ? 'cold' : 'heat' }),
            { v: String(coils.filter((c) => c.on).length) },
            tr('of {{length}} on', { length: coils.length }),
          ]}
        />
        <Groups
          rows={byGroups(groups, 'consumers', coils)}
          render={(c) => (
            <div
              key={c.nodeId}
              className="ht-unit"
              style={{ position: 'relative', width: COIL_WIDTH }}
            >
              <button
                type="button"
                className="ht-open"
                title={tr("{{name}} - the details, the setpoint, today's chart, the model", {
                  name: c.name,
                })}
                onClick={() => setPopup({ kind: 'coil', nodeId: c.nodeId })}
              >
                <FanCoilIcon coil={c} mode={m.mode} width={COIL_WIDTH} />
              </button>
              <button
                type="button"
                className="ht-switch"
                disabled={!control || m.control === 'off'}
                aria-pressed={c.on}
                aria-label={tr('{{name}}: the valve {{v1}}', {
                  name: c.name,
                  v1: c.on ? 'open - close it' : 'closed - open it',
                })}
                title={
                  !control
                    ? tr('The valve is {{v0}} - you may only watch', {
                        v0: c.on ? 'open' : 'closed',
                      })
                    : m.control === 'off'
                      ? tr('The heating is off - switch it on with the mode first')
                      : c.on
                        ? tr('Close the valve - switch this fan coil off remotely')
                        : tr('Open the valve - switch this fan coil on')
                }
                style={{
                  left: FAN_COIL_SWITCH.x * COIL_SCALE,
                  top: FAN_COIL_SWITCH.y * COIL_SCALE,
                  width: FAN_COIL_SWITCH.w * COIL_SCALE,
                  height: FAN_COIL_SWITCH.h * COIL_SCALE,
                }}
                onClick={() => send('setEnabled', { nodeId: c.nodeId, enabled: !c.on })}
              />
            </div>
          )}
        />
      </section>
      {error && <div className="text-danger small mt-2">{error}</div>}
      {popup?.kind === 'flow' && (
        <FlowPopup flow={popup.flow} process={process} m={m} onClose={() => setPopup(null)} />
      )}
      {popup && popup.kind !== 'flow' && (
        <HeatingPopup
          popup={popup}
          process={process}
          m={m}
          control={control}
          send={send}
          onClose={() => setPopup(null)}
        />
      )}
    </div>
  )
}

export default HeatingScene
