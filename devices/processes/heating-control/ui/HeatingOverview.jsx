import React, { useEffect, useState } from 'react'
import { CSpinner } from '@coreui/react'
import { api, request } from 'src/api/client'
import { useProcessesLiveState } from 'src/api/useLiveProcess'
import KeyValue from 'src/components/KeyValue'
import { Flow, GridIcon, SCENE_CSS } from '../../energy-field/ui/fieldIcons'
import { SkyIcon } from '../../weather-control/ui/SkyIcon'
import { currentHour } from '../../weather-control/ui/WeatherWidgets'
import { FanCoilCompactIcon, HeatPumpIcon, TankIcon } from './heatIcons'
import { fmt } from './useHeatingData'

// The heating's overview - a MOCKUP (iot AGENTS_TO_DO.md 2026-10-29: the heating's logic is to be
// reworked, the overview finished in this package then): a Dashboard component (no process - every
// heating system the person sees, together) drawn at a folder's full width under its blocks. One row on a
// wide screen, a column on a narrow one: the outdoors in two floors (the user, 2026-10-30 - as the
// energy's overview) - the weather (the air the heat pumps take the heat from / give it to) over the
// electricity they take, each with its own flow to them; one heat pump, one tank, one fan coil - each
// standing for all of them; the heat's flows between them - yellow while heating (to the rooms), blue
// while cooling (back out), the electricity's - its own colour. Systems in different modes -
// both flows, each its own systems' sum. Powers and energy - sums; temperatures - averages; the COP - the
// heat over the electricity (weighted); the modes - counts.

const STACK_PX = 900
const FLOW_SIZE = 52
const BLOCK_ICON = 96
// the outdoors' two small blocks - their icons, the info to the right
const SIDE_ICON = 56
// the rooms' fan coil - as large to the eye as the heat pump and the tank (the user, 2026-10-30)
const COIL_WIDTH = BLOCK_ICON * 1.2

const CSS = `
.ho { container-type: inline-size; --ho-heat: #f2b705; --ho-cool: #1c7ed6; --ho-elec: #b8329e; }
[data-coreui-theme='dark'] .ho { --ho-cool: #74c0fc; --ho-elec: #e070c8; }
.ho-row { display: grid; grid-template-columns: minmax(0, 1fr) max-content minmax(0, 1fr) max-content minmax(0, 1fr) max-content minmax(0, 1fr); gap: 8px; align-items: stretch }
.ho-block { display: flex; flex-direction: column; align-items: center; justify-content: space-between; gap: 6px; padding: 12px; border: 1px solid var(--ef-line); border-radius: 12px; background: var(--ef-card); text-align: center }
.ho-block .kv.ho-main { font-size: 1.35rem }
.ho-side, .ho-side-flows { display: grid; grid-template-rows: 1fr 1fr; gap: 8px }
.ho-side-flows { align-items: center; justify-items: center }
.ho-mini { display: flex; align-items: center; gap: 12px; padding: 10px 14px; border: 1px solid var(--ef-line); border-radius: 12px; background: var(--ef-card) }
.ho-mini .kv.ho-main { font-size: 1.2rem }
.ho-icon { height: ${BLOCK_ICON}px; display: flex; align-items: center; justify-content: center }
.ho-flows { display: flex; flex-direction: column; justify-content: center; align-items: center; gap: 4px }
.ho-flow { display: flex; flex-direction: column; align-items: center; line-height: 1.1 }
@container (max-width: ${STACK_PX}px) {
  .ho-row { grid-template-columns: minmax(0, 1fr) }
  .ho-flows, .ho-side-flows { display: flex; flex-direction: row; gap: 24px; justify-content: center }
  .ho-flows svg { transform: rotate(90deg) }
}
`

const sum = (xs) => xs.reduce((a, v) => a + (v ?? 0), 0)
const avg = (xs) => {
  const v = xs.filter((x) => x != null)
  return v.length ? sum(v) / v.length : null
}

/**
 * One flow's chevrons and its power: heating - to the right, cooling - to the left; `color` - its own
 * (the electricity's), else the heat's / the cold's.
 */
const FlowCell = ({ kw, cooling, color: own, word }) => {
  const color = own ?? (cooling ? 'var(--ho-cool)' : 'var(--ho-heat)')
  return (
    <div className="ho-flow mx-3">
      <Flow
        dir={cooling ? 'left' : 'right'}
        kw={Math.abs(kw)}
        scaleKw={50}
        color={color}
        size={FLOW_SIZE}
        label={`${word ?? (cooling ? 'Cooling' : 'Heating')} ${fmt(Math.abs(kw), 1)} kW`}
      />
      <KeyValue value={fmt(Math.abs(kw), 1)} unit="kW" color={color} />
    </div>
  )
}

/** The flows between two blocks - the heating systems' and the cooling ones', those that move heat. */
const Flows = ({ heat, cool }) => (
  <div className="ho-flows">
    {heat > 0.05 && <FlowCell kw={heat} />}
    {cool > 0.05 && <FlowCell kw={cool} cooling />}
    {!(heat > 0.05) && !(cool > 0.05) && (
      <div className="ho-flow mx-3">
        <Flow kw={0} dir="right" size={FLOW_SIZE} label="Heat" />
      </div>
    )}
  </div>
)

/** An outdoors' small block: its icon, the info to the right. */
const MiniBlock = ({ title, icon, children }) => (
  <div className="ho-mini">
    <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>{icon}</div>
    <div style={{ minWidth: 0 }}>
      <div className="fw-semibold">{title}</div>
      {children}
    </div>
  </div>
)

const Block = ({ title, icon, children }) => (
  <div className="ho-block">
    <div className="fw-semibold">{title}</div>
    <div className="ho-icon">{icon}</div>
    <div>{children}</div>
  </div>
)

/** Every heating system the person sees, with its live metrics; the first one's weather forecast. */
const useHeatingSystems = () => {
  const [processes, setProcesses] = useState(null)
  const [forecast, setForecast] = useState(null)
  const live = useProcessesLiveState()
  useEffect(() => {
    let cancelled = false
    api
      .listProcesses()
      .then((list) => !cancelled && setProcesses(list.filter((p) => p.kind === 'heating-control')))
      .catch(() => !cancelled && setProcesses([]))
    return () => {
      cancelled = true
    }
  }, [])
  const weatherId = processes?.find((p) => p.config?.weatherProcessId)?.config.weatherProcessId
  useEffect(() => {
    if (!weatherId) return undefined
    let cancelled = false
    request(`/weather-control/${weatherId}/forecast`)
      .then((d) => !cancelled && setForecast(d))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [weatherId])
  const systems = (processes ?? [])
    .map((p) => ({ process: p, m: live[p.id]?.metrics ?? p.metrics ?? {} }))
    .filter((s) => s.m.totals)
  return { loading: processes === null, systems, forecast }
}

const HeatingOverview = () => {
  const { loading, systems, forecast } = useHeatingSystems()
  if (loading) return <CSpinner size="sm" />
  if (systems.length === 0)
    return <div className="small text-body-secondary">No heating system to show.</div>
  const heating = systems.filter((s) => s.m.mode !== 'cooling')
  const cooling = systems.filter((s) => s.m.mode === 'cooling')
  const totals = (list, key) => sum(list.map((s) => Math.abs(s.m.totals[key] ?? 0)))
  // the heat taken from the air (heating: the heat less the electricity) / given to it (cooling: plus)
  const airHeat = totals(heating, 'heatKw') - totals(heating, 'electricKw')
  const airCool = totals(cooling, 'heatKw') + totals(cooling, 'electricKw')
  const pumps = systems.flatMap((s) => s.m.pumps ?? [])
  const coils = systems.flatMap((s) => s.m.consumers ?? [])
  const tanks = systems.flatMap((s) => s.m.tanks ?? [])
  const running = pumps.filter((p) => p.running && p.on)
  const working = coils.filter((c) => c.on && c.working)
  const heatKw = totals(systems, 'heatKw')
  const electricKw = totals(systems, 'electricKw')
  const storedKwh = sum(systems.map((s) => s.m.totals.storedKwh))
  const fullKwh = sum(systems.map((s) => s.m.totals.fullKwh))
  // the icons' mode - the most systems'
  const mode = cooling.length > heating.length ? 'cooling' : 'heating'
  const avgOf = (items, key) => avg(items.map((x) => x[key]))
  const pump = {
    name: 'The heat pumps',
    on: pumps.some((p) => p.on),
    running: running.length > 0,
    modulation: avgOf(running, 'modulation') ?? 0,
    cop: electricKw > 0.05 ? heatKw / electricKw : null,
    fanRpm: avgOf(running, 'fanRpm') ?? 0,
    flowC: avgOf(pumps, 'flowC'),
    returnC: avgOf(pumps, 'returnC'),
    heatKw,
    electricKw,
  }
  const tank = {
    name: 'The tanks',
    pct: fullKwh > 0 ? (storedKwh / fullKwh) * 100 : null,
    storedKwh,
    fullKwh,
    ...Object.fromEntries(['topC', 'avgC', 'bottomC'].map((k) => [k, avgOf(tanks, k)])),
  }
  const coil = {
    name: 'The rooms',
    on: coils.some((c) => c.on),
    fan: avgOf(working, 'fan') ?? 0,
    heatKw: totals(systems, 'consumersKw'),
    roomC: avgOf(coils, 'roomC')?.toFixed(1) ?? null,
    humidityPct: avgOf(coils, 'humidityPct')?.toFixed(0) ?? null,
    setpointC: avgOf(coils, 'setpointC')?.toFixed(1) ?? null,
    fanW: Math.round(avgOf(working, 'fanW') ?? 0),
    fanRpm: avgOf(working, 'fanRpm') ?? 0,
    fanRatedW: avgOf(coils, 'fanRatedW') ?? undefined,
    // the gauge's end - all the fan coils' rating together
    ratedKw: coils.reduce((a, c) => a + (c.ratedKw ?? 0), 0) || undefined,
  }
  const outdoorC = avg(systems.map((s) => s.m.outdoor?.temperatureC))
  const hour = currentHour(forecast)
  const modes = [
    [heating.filter((s) => s.m.mode !== 'off' && s.m.control !== 'off').length, 'heating'],
    [cooling.length, 'cooling'],
    [heating.filter((s) => s.m.mode === 'off' || s.m.control === 'off').length, 'off'],
  ].filter(([n]) => n > 0)
  return (
    <div className="ef-scene ho">
      <style>{SCENE_CSS + CSS}</style>
      <div className="ho-row">
        <div className="ho-side">
          <MiniBlock
            title="Outdoors"
            icon={
              <SkyIcon
                height={SIDE_ICON}
                radiation={hour?.radiationWm2 ?? 0}
                cloudPct={hour?.cloudCoverPct ?? 0}
                isDay={hour ? hour.isDay !== 0 : true}
              />
            }
          >
            <KeyValue value={fmt(outdoorC, 1)} unit="°C" className="ho-main" />
            <div className="small ef-muted">
              {mode === 'cooling' ? 'The air - takes the heat' : 'The air - gives the heat'}
            </div>
          </MiniBlock>
          <MiniBlock
            title="Electricity"
            icon={<GridIcon height={SIDE_ICON} flow={electricKw > 0.05 ? 'import' : 'none'} />}
          >
            <KeyValue value={fmt(electricKw, 1)} unit="kW" className="ho-main" />
            <div className="small ef-muted">The heat pumps take</div>
          </MiniBlock>
        </div>
        <div className="ho-side-flows">
          <Flows heat={airHeat} cool={airCool} />
          {electricKw > 0.05 ? (
            <FlowCell kw={electricKw} color="var(--ho-elec)" word="Electricity" />
          ) : (
            <div className="ho-flow mx-3">
              <Flow kw={0} dir="right" size={FLOW_SIZE} label="Electricity" />
            </div>
          )}
        </div>
        <Block
          title="Heat pumps"
          icon={<HeatPumpIcon pump={pump} mode={mode} height={BLOCK_ICON * 0.8} gauges={false} />}
        >
          <KeyValue value={fmt(heatKw, 1)} unit="kW" className="ho-main" />{' '}
          {/* one size with the heat, the word as a unit (the user, 2026-10-30) */}
          <KeyValue
            value={fmt(pump.cop, 1)}
            unit={mode === 'cooling' ? 'EER' : 'COP'}
            className="ho-main"
          />
          <div
            className="small ef-muted"
            title="The heat = the air's heat + the electricity; the COP = the heat over the electricity"
          >
            <KeyValue value={fmt(electricKw, 1)} unit="kW" /> electricity · {running.length} of{' '}
            {pumps.length} running
          </div>
        </Block>
        <Flows heat={totals(heating, 'heatKw')} cool={totals(cooling, 'heatKw')} />
        <Block title="Heat storage" icon={<TankIcon tank={tank} height={BLOCK_ICON} />}>
          <KeyValue value={fmt(storedKwh, 0)} unit="kWh" className="ho-main" />{' '}
          <KeyValue value={fmt(tank.pct, 0)} unit="%" />
          <div className="small ef-muted">of {fmt(fullKwh, 0)} kWh</div>
        </Block>
        <Flows heat={totals(heating, 'consumersKw')} cool={totals(cooling, 'consumersKw')} />
        <Block
          title="Rooms"
          icon={<FanCoilCompactIcon coil={coil} mode={mode} width={COIL_WIDTH} />}
        >
          <KeyValue value={coil.roomC ?? '-'} unit="°C" className="ho-main" />
          <div className="small ef-muted">
            {working.length} of {coils.length} fan coils running
          </div>
        </Block>
      </div>
      <div className="small ef-muted text-center mt-2">
        {systems.length} heating system{systems.length === 1 ? '' : 's'}
        {modes.length > 0 && ': '}
        {modes.map(([n, word]) => `${n} ${word}`).join(' · ')}
      </div>
    </div>
  )
}

export default HeatingOverview
