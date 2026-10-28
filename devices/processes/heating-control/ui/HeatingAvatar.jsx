import React, { useId } from 'react'
import KeyValue from 'src/components/KeyValue'
import { FanCoilIcon, HeatPumpIcon, TankIcon } from './heatIcons'
import { useHeatingData, fmt } from './useHeatingData'

// The heating's Dashboard card picture (the user's mockup
// images/fix-heating-icon-component.png, 2026-10-23): the scene's own heat
// pump, tank and fan coil, each standing for its whole block (the block's
// averages / sums), the figures on the right; a green arrow by the tank -
// where the heat (the cold) goes, into the tanks or out of them. Drawn at
// its natural size - an unframed card scales it to the block's edges.

const avg = (xs) => (xs.length ? xs.reduce((a, v) => a + v, 0) / xs.length : null)
const avgOf = (items, key) => avg(items.map((x) => x[key]).filter((v) => v != null))

// the mockup's sizes and positions (half its pixels): the pump and the fan
// coil as wide as the icon column, the tank set in from its left edge, the
// arrow right after it
const ICON_COLUMN = 122
const PUMP_HEIGHT = (ICON_COLUMN * 214) / 310 // HeatPumpIcon without gauges: 310 x 214
const TANK_HEIGHT = 84
const TANK_LEFT = 20
const ARROW_LEFT = 69 // from the column's left edge
const ARROW = { w: 40, h: 37 }
const BIG = 31
const SMALL = 23

/** The arrow by the tank: right - out of the tanks, left - into them. */
const Arrow = ({ into }) => {
  const id = `ht-arrow-${useId().replace(/:/g, '')}`
  return (
    <svg width={ARROW.w} height={ARROW.h} viewBox="0 0 40 37" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5fd65a" />
          <stop offset="1" stopColor="#25a32a" />
        </linearGradient>
      </defs>
      <path
        d="M1.5 10.5 H20 V1.5 L38.5 18.5 L20 35.5 V26.5 H1.5 Z"
        transform={into ? 'rotate(180 20 18.5)' : undefined}
        fill={`url(#${id})`}
        stroke="#178a22"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  )
}

const Row = ({ icon, children }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 15 }}>
    <div style={{ width: ICON_COLUMN, display: 'flex', alignItems: 'center', flexShrink: 0 }}>
      {icon}
    </div>
    <div style={{ lineHeight: 1.15, whiteSpace: 'nowrap' }}>{children}</div>
  </div>
)

const Sub = ({ children }) => (
  <span className="text-body-secondary" style={{ fontSize: SMALL }}>
    {children}
  </span>
)

const HeatingAvatar = ({ process }) => {
  const { m } = useHeatingData(process)
  if (!m.totals) return null
  const t = m.totals
  const pumps = m.pumps ?? []
  const coils = m.consumers ?? []
  const cooling = m.mode === 'cooling'
  const running = pumps.filter((p) => p.running && p.on)
  const working = coils.filter((c) => c.on && c.working)
  // the blocks as one unit each - their averages
  const pump = {
    name: 'The heat pumps',
    on: pumps.some((p) => p.on),
    running: running.length > 0,
    modulation: avgOf(running, 'modulation') ?? 0,
    cop: t.cop,
    fanRpm: avgOf(running, 'fanRpm') ?? 0,
    flowC: avgOf(pumps, 'flowC'),
    returnC: avgOf(pumps, 'returnC'),
    heatKw: t.heatKw,
    electricKw: t.electricKw,
  }
  const tank = {
    name: 'The tanks',
    pct: t.tankPct,
    storedKwh: t.storedKwh,
    fullKwh: t.fullKwh,
    ...Object.fromEntries(['topC', 'avgC', 'bottomC'].map((k) => [k, avgOf(m.tanks ?? [], k)])),
  }
  const coil = {
    name: 'The rooms',
    on: coils.some((c) => c.on),
    fan: avgOf(working, 'fan') ?? 0,
    heatKw: t.consumersKw,
    roomC: avgOf(coils, 'roomC')?.toFixed(1) ?? null,
    humidityPct: avgOf(coils, 'humidityPct')?.toFixed(0) ?? null,
    setpointC: avgOf(coils, 'setpointC')?.toFixed(1) ?? null,
    fanW: Math.round(avgOf(working, 'fanW') ?? 0),
    fanRpm: avgOf(working, 'fanRpm') ?? 0,
    fanRatedW: avgOf(coils, 'fanRatedW') ?? undefined,
  }
  // + the tanks take heat (cold when cooling), - they give it
  const chargeKw = (t.heatKw - t.consumersKw) * (cooling ? -1 : 1)
  const moving = Math.abs(chargeKw) > 0.05
  const big = { fontSize: BIG }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: 4 }}>
      <Row icon={<HeatPumpIcon pump={pump} mode={m.mode} height={PUMP_HEIGHT} gauges={false} />}>
        <div style={big}>
          <KeyValue value={fmt(Math.abs(t.heatKw), 1)} unit="kW" />
          <span style={{ marginLeft: 18 }}>
            <KeyValue value={fmt(t.cop, 1)} />
            <span style={{ marginLeft: 6 }}>{cooling ? 'EER' : 'COP'}</span>
          </span>
        </div>
        <Sub>
          {cooling ? 'Cooling' : 'Heating'} · {running.length} of {pumps.length} running
        </Sub>
      </Row>
      <Row
        icon={
          <>
            <div style={{ marginLeft: TANK_LEFT, display: 'flex' }}>
              <TankIcon tank={tank} height={TANK_HEIGHT} />
            </div>
            <div
              style={{
                marginLeft: ARROW_LEFT - TANK_LEFT - (TANK_HEIGHT * 160) / 334,
                display: 'flex',
                visibility: moving ? 'visible' : 'hidden',
              }}
            >
              <Arrow into={chargeKw > 0} />
            </div>
          </>
        }
      >
        <div style={big}>
          <KeyValue value={fmt(t.storedKwh, 0)} unit="kWh" />
          <span style={{ marginLeft: 18 }}>
            <KeyValue value={fmt(t.tankPct, 0)} unit="%" />
          </span>
        </div>
        <Sub>
          {!moving
            ? 'Stored'
            : `${chargeKw > 0 ? 'Charging' : 'Drawing'} · ${fmt(Math.abs(chargeKw), 1)} kW`}
        </Sub>
      </Row>
      <Row icon={<FanCoilIcon coil={coil} mode={m.mode} width={ICON_COLUMN} />}>
        <div style={big} title="The heat delivered to the rooms today">
          <KeyValue value={fmt(m.today?.deliveredKwh, 0)} unit="kWh" />
          <Sub>
            {' '}
            · {working.length} of {coils.length} running
          </Sub>
        </div>
      </Row>
    </div>
  )
}

export default HeatingAvatar
