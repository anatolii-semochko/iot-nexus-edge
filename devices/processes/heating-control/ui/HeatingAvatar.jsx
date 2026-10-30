import React, { useId } from 'react'
import KeyValue from 'src/components/KeyValue'
import { FanCoilIcon, HeatPumpIcon, TankIcon } from './heatIcons'
import { useHeatingData, fmt } from './useHeatingData'

// The heating's Dashboard card picture (the user's mockups images/fix-heating-icon-component.png,
// 2026-10-23, and fix-heating-avatar-1.png, 2026-10-29): the scene's own heat pump, tank and fan coil,
// each standing for its whole block (the block's averages / sums), the figures on the right. The tank
// in the middle of the icon column, an arrow on each side - the heat in (left, from the heat pumps)
// and out (right, to the rooms), only while it flows: yellow - heat, blue - cold. The heat pumps -
// their power and the mode (the COP only when there is one); the tanks - in / out (kW) on the left,
// % over kWh on the right; the rooms - the power they get. Drawn at its natural size - an unframed
// card scales it to the block's edges.

const avg = (xs) => (xs.length ? xs.reduce((a, v) => a + v, 0) / xs.length : null)
const avgOf = (items, key) => avg(items.map((x) => x[key]).filter((v) => v != null))

// the mockup's sizes (half its pixels): the pump and the fan coil as wide as the icon column, the tank
// in its middle with an arrow on each side
const ICON_COLUMN = 122
const PUMP_HEIGHT = (ICON_COLUMN * 214) / 310 // HeatPumpIcon without gauges: 310 x 214
const TANK_HEIGHT = 84
const ARROW = { w: 30, h: 28 }
const BIG = 31
const SMALL = 23
// the flows' colours - the heat's and the cold's (as the heating overview's)
const FLOW = {
  heat: ['#ffd43b', '#f2b705', '#b8860b'],
  cold: ['#74c0fc', '#1c7ed6', '#1864ab'],
}
const FLOWING_KW = 0.05

/** An arrow pointing right (the heat's way through the tank); `cold` - blue, else yellow. */
const Arrow = ({ cold, visible, title }) => {
  const id = `ht-arrow-${useId().replace(/:/g, '')}`
  const [top, bottom, edge] = cold ? FLOW.cold : FLOW.heat
  return (
    <svg
      width={ARROW.w}
      height={ARROW.h}
      viewBox="0 0 40 37"
      role={visible ? 'img' : undefined}
      aria-hidden={visible ? undefined : 'true'}
      aria-label={visible ? title : undefined}
      style={{ visibility: visible ? 'visible' : 'hidden', flexShrink: 0 }}
    >
      {visible && <title>{title}</title>}
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={top} />
          <stop offset="1" stopColor={bottom} />
        </linearGradient>
      </defs>
      <path
        d="M1.5 10.5 H20 V1.5 L38.5 18.5 L20 35.5 V26.5 H1.5 Z"
        fill={`url(#${id})`}
        stroke={edge}
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  )
}

const Row = ({ icon, children }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 15 }}>
    <div
      style={{
        width: ICON_COLUMN,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
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
    ratedKw: coils.reduce((a, c) => a + (c.ratedKw ?? 0), 0) || undefined,
    roomC: avgOf(coils, 'roomC')?.toFixed(1) ?? null,
    humidityPct: avgOf(coils, 'humidityPct')?.toFixed(0) ?? null,
    setpointC: avgOf(coils, 'setpointC')?.toFixed(1) ?? null,
    fanW: Math.round(avgOf(working, 'fanW') ?? 0),
    fanRpm: avgOf(working, 'fanRpm') ?? 0,
    fanRatedW: avgOf(coils, 'fanRatedW') ?? undefined,
  }
  // the tanks' two heat exchangers - in from the heat pumps, out to the rooms (each by its size)
  const inKw = Math.abs(t.heatKw ?? 0)
  const outKw = Math.abs(t.consumersKw ?? 0)
  const what = cooling ? 'Cold' : 'Heat'
  const big = { fontSize: BIG }
  const pair = { display: 'grid', gridTemplateColumns: 'auto auto', columnGap: 18, rowGap: 0 }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: 4 }}>
      <Row icon={<HeatPumpIcon pump={pump} mode={m.mode} height={PUMP_HEIGHT} gauges={false} />}>
        <div style={big}>
          <KeyValue value={fmt(Math.abs(t.heatKw), 1)} unit="kW" />
          {t.cop != null && (
            <span style={{ marginLeft: 18 }}>
              <KeyValue value={fmt(t.cop, 1)} />
              <span style={{ marginLeft: 6 }}>{cooling ? 'EER' : 'COP'}</span>
            </span>
          )}
        </div>
        <Sub>{m.control === 'off' ? 'Off' : cooling ? 'Cooling' : 'Heating'}</Sub>
      </Row>
      <Row
        icon={
          <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Arrow
              cold={cooling}
              visible={inKw > FLOWING_KW}
              title={`${what} in from the heat pumps`}
            />
            <TankIcon tank={tank} height={TANK_HEIGHT} />
            <Arrow cold={cooling} visible={outKw > FLOWING_KW} title={`${what} out to the rooms`} />
          </div>
        }
      >
        <div style={{ ...big, ...pair }}>
          <span title={`${what} in from the heat pumps`}>
            <KeyValue value={fmt(inKw, 1)} unit="kW" />
          </span>
          <span title="The tanks' charge">
            <KeyValue value={fmt(t.tankPct, 0)} unit="%" />
          </span>
          <span title={`${what} out to the rooms`}>
            <KeyValue value={fmt(outKw, 1)} unit="kW" />
          </span>
          <span title="The heat stored in the tanks">
            <KeyValue value={fmt(t.storedKwh, 0)} unit="kWh" />
          </span>
        </div>
      </Row>
      <Row icon={<FanCoilIcon coil={coil} mode={m.mode} width={ICON_COLUMN} />}>
        <div style={big} title={`${what} to the rooms now`}>
          <KeyValue value={fmt(outKw, 1)} unit="kW" />
        </div>
      </Row>
    </div>
  )
}

export default HeatingAvatar
