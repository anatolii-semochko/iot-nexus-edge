import React, { useId } from 'react'
import RoundGauge from 'src/components/indicators/RoundGauge'

// Heating / cooling pictures (the user's mockups images/heating-pump.png,
// water-cylinder.png, fancoil.png; the reviewed icon canvas 2026-10-20):
// light equipment drawings, layered - a fan is its own layer turning while
// it runs (an SVG animation, its speed from the real rpm), the grille and
// the body are static. Gauges - the core's RoundGauge.

// The gauges' coloured limits (the user, 2026-10-24 - only where they mean something):
// the supply water - too hot for the heat pump in heating, near freezing in cooling; the scales
const WATER_RANGE = { heating: { min: 10, max: 70 }, cooling: { min: 0, max: 30 } }
const SUPPLY_LIMITS = {
  heating: { warnHigh: 55, errHigh: 62 },
  cooling: { errLow: 4, warnLow: 6 },
}
/** A water temperature scale; `supply` - the supply water's limits on it. */
export const waterLimits = (mode, supply = false) => {
  const key = mode === 'cooling' ? 'cooling' : 'heating'
  return supply ? { ...WATER_RANGE[key], ...SUPPLY_LIMITS[key] } : WATER_RANGE[key]
}
// a unit switched off - dimmed a little (the user, 2026-10-29), still readable
export const OFF_STYLE = { opacity: 0.55, filter: 'saturate(0.5)' }
const FAN_SLOWDOWN = 4 // a 650 rpm fan would only blur - one turn per 4 real turns
const fanPeriod = (rpm) => (rpm > 0 ? Math.max(0.25, (60 / rpm) * FAN_SLOWDOWN) : null)

const Gradients = ({ id }) => (
  <defs>
    <linearGradient id={`${id}body`} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stopColor="#f6f7f8" />
      <stop offset="1" stopColor="#dcdfe2" />
    </linearGradient>
    <linearGradient id={`${id}blade`} x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stopColor="#6d737a" />
      <stop offset="1" stopColor="#454a50" />
    </linearGradient>
  </defs>
)

/** Three broad swept blades and the hub, turning about (cx, cy) while `rpm` > 0. */
const Fan = ({ id, cx, cy, r, rpm }) => {
  const k = r / 70
  const p = (v) => (v * k).toFixed(1)
  const blade = `M0 ${p(-12)} C${p(20)} ${p(-22)} ${p(52)} ${p(-40)} ${p(50)} ${p(-60)} C${p(40)} ${p(-72)} ${p(12)} ${p(-70)} ${p(-6)} ${p(-58)} C${p(-16)} ${p(-46)} ${p(-14)} ${p(-26)} ${p(-12)} ${p(-8)} Z`
  const period = fanPeriod(rpm)
  return (
    <g>
      {period && (
        <animateTransform
          attributeName="transform"
          type="rotate"
          from={`0 ${cx} ${cy}`}
          to={`360 ${cx} ${cy}`}
          dur={`${period.toFixed(2)}s`}
          repeatCount="indefinite"
        />
      )}
      <g transform={`translate(${cx} ${cy})`}>
        {[0, 120, 240].map((a) => (
          <path
            key={a}
            d={blade}
            transform={`rotate(${a})`}
            fill={`url(#${id}blade)`}
            stroke="#2a2e33"
            strokeWidth={1.2 * k}
          />
        ))}
        <circle r={16 * k} fill="#cfd3d7" stroke="#6b7178" strokeWidth={1.5 * k} />
        <circle r={5 * k} fill="#9aa0a6" />
      </g>
    </g>
  )
}

const svgId = (raw) => raw.replace(/[^a-zA-Z0-9_-]/g, '')

/**
 * A fan's guard grille - its own layer over the turning fan (clip it to the
 * opening): horizontal wires every `stepY`, vertical ones every `stepX`
 * through the centre, within radius `r`.
 */
const Grille = ({ cx, cy, r, stepX, stepY, width }) => {
  const wire = { stroke: '#25292e', strokeWidth: width, strokeOpacity: 0.8 }
  const lines = []
  for (let y = cy - r + 4; y < cy + r; y += stepY)
    lines.push(<line key={`h${y}`} x1={cx - r - 4} y1={y} x2={cx + r + 4} y2={y} {...wire} />)
  const n = Math.floor((r - stepX / 2) / stepX)
  for (let k = -n; k <= n; k++) {
    const x = cx + k * stepX
    lines.push(<line key={`v${k}`} x1={x} y1={cy - r - 4} x2={x} y2={cy + r + 4} {...wire} />)
  }
  return <g>{lines}</g>
}

// the heat pump's grille (viewBox units; the scene draws the pump 140 px high - a 4.6 x 14.4 px cell)
const PUMP_GRILLE = { stepX: 22, stepY: 7, width: 1.3 }
// the fan coil's (the user's request 2026-10-23: the pump's cell 1 px lower and 10 % narrower -
// 3.6 x 13 px at the scene's 300 px wide fan coil, 0.68 px per unit; the wire as thin as the pump's)
const COIL_GRILLE = { stepX: 19, stepY: 5.25, width: 1.25 }

/**
 * The heat pump's outdoor unit with its two dual gauges on the right:
 * flow (big) / return (small) temperature, heat (big) / electric (small)
 * power; the COP (EER when cooling) on the body. `gauges` false - the body
 * only (the Dashboard card).
 */
export const HeatPumpIcon = ({ pump, mode, height = 120, gauges = true }) => {
  const id = svgId(useId())
  const running = pump.running && pump.on
  const cooling = mode === 'cooling'
  const state = pump.on ? 'active' : 'inactive'
  const rated = pump.ratedHeatKw ?? 12
  const copLabel = cooling ? 'EER' : 'COP'
  const viewW = gauges ? 432 : 310
  const width = (height * viewW) / 214
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${viewW} 214`}
      role="img"
      aria-label={`${pump.name} - heat pump`}
      style={pump.on === false ? OFF_STYLE : undefined}
    >
      <title>
        {`${pump.name}${pump.model ? ` (${pump.model})` : ''}: ${!pump.on ? 'switched off' : running ? `running at ${Math.round(pump.modulation * 100)} %` : 'standby'}`}
      </title>
      <Gradients id={id} />
      <clipPath id={`${id}grille`}>
        <circle cx="105" cy="104" r="76" />
      </clipPath>
      <rect
        x="30"
        y="196"
        width="44"
        height="14"
        rx="2"
        fill="#9aa0a6"
        stroke="#6b7178"
        strokeWidth="1.5"
      />
      <rect
        x="226"
        y="196"
        width="44"
        height="14"
        rx="2"
        fill="#9aa0a6"
        stroke="#6b7178"
        strokeWidth="1.5"
      />
      <rect
        x="290"
        y="56"
        width="16"
        height="38"
        rx="3"
        fill="#d6d9dc"
        stroke="#6b7178"
        strokeWidth="1.5"
      />
      <rect
        x="290"
        y="132"
        width="16"
        height="44"
        rx="3"
        fill="#d6d9dc"
        stroke="#6b7178"
        strokeWidth="1.5"
      />
      <rect
        x="6"
        y="8"
        width="288"
        height="190"
        rx="10"
        fill={`url(#${id}body)`}
        stroke="#5f656c"
        strokeWidth="2.5"
      />
      <path d="M12 22 H288" stroke="#a7adb3" strokeWidth="1.5" />
      <circle cx="105" cy="104" r="84" fill="#e3e6e9" stroke="#7d838a" strokeWidth="2" />
      <circle cx="105" cy="104" r="77" fill="#3a3f45" stroke="#5f656c" strokeWidth="2" />
      <g clipPath={`url(#${id}grille)`}>
        <Fan id={id} cx={105} cy={104} r={62} rpm={running ? pump.fanRpm : 0} />
        <Grille cx={105} cy={104} r={76} {...PUMP_GRILLE} />
      </g>
      <circle cx="105" cy="104" r="77" fill="none" stroke="#4a4f55" strokeWidth="3" />
      <rect
        x="204"
        y="36"
        width="80"
        height="152"
        rx="7"
        fill="#f1f3f4"
        stroke="#5f656c"
        strokeWidth="2"
      />
      <g>
        <title>{`${copLabel} - the heat ${cooling ? 'taken' : 'given'} per unit of electricity`}</title>
        <RoundGauge
          x={244}
          y={76}
          r={27}
          value={running ? pump.cop : null}
          limits={{ min: 1, max: 6, errLow: 2, warnLow: 2.8 }}
          decimals={1}
          label={copLabel}
          state={running ? 'active' : 'inactive'}
        />
      </g>
      {[124, 140, 156, 172].map((y) => (
        <rect
          key={y}
          x="214"
          y={y}
          width="60"
          height="8"
          rx="4"
          fill="#eef0f2"
          stroke="#6b7178"
          strokeWidth="1.6"
        />
      ))}
      {gauges && (
        <>
          <g>
            <title>{`Flow ${pump.flowC} C (big) / return ${pump.returnC} C (small, blue) - the water to and from the tanks`}</title>
            <RoundGauge
              x={384}
              y={55}
              r={45}
              value={pump.flowC}
              limits={waterLimits(mode, true)}
              unit="°C"
              inner={{
                value: pump.returnC,
                limits: waterLimits(mode),
                unit: '°C',
                color: '#1d6fd8',
              }}
              state={state}
            />
          </g>
          <g>
            {/* one way - the heat or the cold it makes, both counted up from zero (the user, 2026-10-25) */}
            <title>{`${cooling ? 'Cold' : 'Heat'} ${Math.abs(pump.heatKw).toFixed(1)} kW (big) / electricity ${pump.electricKw.toFixed(1)} kW (small, magenta)${cooling ? '' : ' - the heat is the electricity plus the heat from the air'}`}</title>
            <RoundGauge
              x={384}
              y={151}
              r={45}
              value={Math.abs(pump.heatKw)}
              limits={{
                min: 0,
                max: Math.ceil(rated * 1.3),
                warnHigh: rated * 1.1,
                errHigh: rated * 1.25,
              }}
              unit="kW"
              inner={{
                value: pump.electricKw,
                limits: { min: 0, max: Math.ceil(rated / 2.5) },
                unit: 'kW',
                color: '#b8329e',
              }}
              state={state}
            />
          </g>
        </>
      )}
    </svg>
  )
}

const HOT = '#ff2d0a'
const WARM = '#e0341a'
const COLD = '#0b2f6e'
const ICE = '#123f8f'

// the tank's four water ports (the user's mockup fix-water-cylinder.png): evenly
// spaced, the lowest one's bottom level with the indicator's bottom edge (y 284)
const PORTS_Y = [232, 248, 264, 280]

/**
 * A buffer tank: even light, the central graduated column - hot water on top, cold below; the
 * indicator symmetric about the column's middle (the user, 2026-10-29): the average temperature
 * (small) over the % (big) over the stored kWh (small).
 */
export const TankIcon = ({ tank, height = 200 }) => {
  const id = svgId(useId())
  const pct = Math.max(0, Math.min(100, tank.pct ?? 0))
  const x = 45
  const y = 66
  const w = 70
  const h = 214
  const boundary = y + (h * pct) / 100
  const s0 = Math.max(0, (boundary - 13 - y) / h)
  const s1 = Math.min(1, (boundary + 13 - y) / h)
  const ticks = []
  for (let i = 1; i < 10; i++) {
    const ty = y + (h * i) / 10
    const len = i % 5 === 0 ? 14 : 7
    const sw = i % 5 === 0 ? 1.6 : 1
    ticks.push(
      <line
        key={`l${i}`}
        x1={x}
        y1={ty}
        x2={x + len}
        y2={ty}
        stroke="#fff"
        strokeOpacity="0.85"
        strokeWidth={sw}
      />,
    )
    ticks.push(
      <line
        key={`r${i}`}
        x1={x + w - len}
        y1={ty}
        x2={x + w}
        y2={ty}
        stroke="#fff"
        strokeOpacity="0.85"
        strokeWidth={sw}
      />,
    )
  }
  return (
    <svg
      width={(height * 160) / 334}
      height={height}
      viewBox="0 0 160 334"
      role="img"
      aria-label={`${tank.name} - ${pct.toFixed(0)} percent`}
    >
      <title>{`${tank.name}: ${tank.storedKwh} of ${tank.fullKwh} kWh stored (${pct.toFixed(0)} %) - top ${tank.topC} C, middle ${tank.avgC} C, bottom ${tank.bottomC} C`}</title>
      <defs>
        <linearGradient id={`${id}tank`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#e4e7ea" />
          <stop offset="0.5" stopColor="#ffffff" />
          <stop offset="1" stopColor="#e4e7ea" />
        </linearGradient>
        <linearGradient id={`${id}cap`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#1b1d20" />
          <stop offset="0.5" stopColor="#3a3d42" />
          <stop offset="1" stopColor="#1b1d20" />
        </linearGradient>
        <linearGradient id={`${id}col`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={HOT} />
          <stop offset={s0} stopColor={pct > 15 ? WARM : '#c0392b'} />
          <stop offset={(s0 + s1) / 2} stopColor="#6d3f7a" />
          <stop offset={s1} stopColor={ICE} />
          <stop offset="1" stopColor={COLD} />
        </linearGradient>
      </defs>
      <rect
        x="10"
        y="10"
        width="140"
        height="316"
        rx="28"
        fill={`url(#${id}tank)`}
        stroke="#c4c9ce"
        strokeWidth="1.5"
      />
      <path d="M10 52 V38 Q10 10 38 10 H122 Q150 10 150 38 V52 Z" fill={`url(#${id}cap)`} />
      <path d="M10 292 V298 Q10 326 38 326 H122 Q150 326 150 298 V292 Z" fill={`url(#${id}cap)`} />
      {PORTS_Y.map((py) => (
        <circle key={py} cx="26" cy={py} r="4" fill="#3a3d42" />
      ))}
      <rect x={x - 4} y={y - 4} width={w + 8} height={h + 8} rx="9" fill="#2a2e33" />
      <rect x={x} y={y} width={w} height={h} rx="5" fill={`url(#${id}col)`} />
      {ticks}
      {[
        [
          y + h / 2 - 26,
          13,
          600,
          tank.avgC == null ? '- °C' : `${Number(tank.avgC).toFixed(1)} °C`,
        ],
        [y + h / 2 + 34, 13, 600, `${Number(tank.storedKwh ?? 0).toFixed(1)} kWh`],
      ].map(([ty, size, weight, text]) => (
        <text
          key={ty}
          x="80"
          y={ty}
          textAnchor="middle"
          fontWeight={weight}
          fontSize={size}
          fill="#fff"
          stroke="#00000055"
          strokeWidth="2.5"
          style={{ paintOrder: 'stroke' }}
        >
          {text}
        </text>
      ))}
      <text
        x="80"
        y={y + h / 2 + 9}
        textAnchor="middle"
        fontWeight="700"
        fontSize="26"
        fill="#fff"
        stroke="#00000055"
        strokeWidth="3"
        style={{ paintOrder: 'stroke' }}
      >
        {pct.toFixed(0)}
        <tspan fontSize="14" dx="2">
          %
        </tspan>
      </text>
    </svg>
  )
}

/**
 * A buffer tank's two gauges, as big as a heat pump's at `pumpHeight` (the user, 2026-10-29 - its two
 * heat exchangers work at once): on top the heat in (from the heat pumps), below the heat out (to the
 * fan coils), each one way from zero to `maxKw`; the temperatures - in the tank's indicator.
 */
export const TankGauges = ({ tank, mode, maxKw, pumpHeight = 120 }) => {
  const cooling = mode === 'cooling'
  const what = cooling ? 'Cold' : 'Heat'
  const R = 45 // the pump's gauge radius in its viewBox (214 high)
  const W = 2 * R + 8
  const H = 196 // the pump's two gauges: 96 apart
  const scale = pumpHeight / 214
  const end = Math.max(1, Math.ceil(maxKw))
  const gauges = [
    [R + 4, tank.inKw ?? 0, `${what} in from the heat pumps`],
    [R + 4 + 96, tank.outKw ?? 0, `${what} out to the fan coils`],
  ]
  return (
    <svg
      width={W * scale}
      height={H * scale}
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`${tank.name} - the heat in and out`}
    >
      {gauges.map(([cy, kw, text]) => (
        <g key={cy}>
          <title>{`${text}: ${Number(kw).toFixed(1)} kW`}</title>
          <RoundGauge
            x={W / 2}
            y={cy}
            r={R}
            value={kw}
            limits={{ min: 0, max: end, warnHigh: end * 0.9 }}
            unit="kW"
            state={tank.avgC == null ? 'absent' : kw > 0.05 ? 'active' : 'inactive'}
          />
        </g>
      ))}
    </svg>
  )
}

/** The valve switch of a fan coil - the user's sample: ON green / OFF red, a grey knob. */
const Toggle = ({ id, on }) => {
  const [c0, c1, edge] = on ? ['#22d12a', '#0d8f14', '#0a6e10'] : ['#ff2a2a', '#a80d0d', '#7a0909']
  return (
    <g>
      <defs>
        <linearGradient id={`${id}tg`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={c0} />
          <stop offset="1" stopColor={c1} />
        </linearGradient>
      </defs>
      <rect
        x="1"
        y="1"
        width="60"
        height="30"
        rx="5"
        fill={`url(#${id}tg)`}
        stroke={edge}
        strokeWidth="1.5"
      />
      <rect
        x="3"
        y="3"
        width="56"
        height="26"
        rx="4"
        fill="none"
        stroke="#fff"
        strokeOpacity="0.35"
      />
      <rect
        x={on ? 32 : 4}
        y="4"
        width="26"
        height="24"
        rx="4"
        fill="#d5d7da"
        stroke="#9ea3a8"
        strokeWidth="2"
      />
      <text
        x={on ? 17 : 44}
        y="20.5"
        textAnchor="middle"
        fontWeight="800"
        fontSize="10"
        fill="#fff"
      >
        {on ? 'ON' : 'OFF'}
      </text>
    </g>
  )
}

/** The fan coil's front - the switch area (viewBox units) for an overlaid button. */
const FAN_COIL_SWITCH_X = 22
const FAN_COIL_SWITCH_W = 62
export const FAN_COIL_SWITCH = { x: FAN_COIL_SWITCH_X, y: 14, w: FAN_COIL_SWITCH_W, h: 32 }
// the fan's grey ring (r 30.5, its stroke 3) - the grille fills its inner edge
const COIL_GRILLE_R = 29
// the name's block: as far from the fan opening (x 272) as from the switch (its right edge 84)
const NAME_X = 98
const NAME_FONT = 21
const NAME_WIDTH = 306 - 34 - (NAME_X - (FAN_COIL_SWITCH_X + FAN_COIL_SWITCH_W)) - NAME_X

let measureCtx = null
/** `text` cut with an ellipsis to fit `width` at `fontSize` (the page's font; a rough estimate without a canvas). */
const fitText = (text, width, fontSize) => {
  if (!text) return ''
  if (!measureCtx && typeof document !== 'undefined')
    measureCtx = document.createElement('canvas').getContext('2d')
  const family = typeof document !== 'undefined' ? getComputedStyle(document.body).fontFamily : ''
  const measure = (t) => {
    if (!measureCtx) return t.length * fontSize * 0.55
    measureCtx.font = `${fontSize}px ${family}`
    return measureCtx.measureText(t).width
  }
  if (measure(text) <= width) return text
  let cut = text.length
  while (cut > 1 && measure(`${text.slice(0, cut).trimEnd()}…`) > width) cut--
  return `${text.slice(0, cut).trimEnd()}…`
}

export const FAN_COIL_VIEW = { w: 440, h: 168 }

/** A wall-mounted fan coil: the valve switch, the room, its temperature and humidity, the fan, the power gauge. */
export const FanCoilIcon = ({ coil, mode, width = 330 }) => {
  const id = svgId(useId())
  const running = coil.on && coil.fan > 0
  const louvres = [
    [118, 3],
    [127, 2.4],
    [135, 1.8],
  ]
  // the gauge - the heat it gives the room (the user, 2026-10-29; the fan's watts - in the popup)
  const ratedKw = coil.ratedKw ?? 5
  const heat = Math.abs(coil.heatKw ?? 0)
  return (
    <svg
      width={width}
      height={(width * FAN_COIL_VIEW.h) / FAN_COIL_VIEW.w}
      viewBox="0 0 440 168"
      role="img"
      aria-label={`${coil.name} - fan coil`}
      style={coil.on ? undefined : OFF_STYLE}
    >
      <title>
        {`${coil.name}: room ${coil.roomC ?? '-'} C, humidity ${coil.humidityPct ?? '-'} %, setpoint ${coil.setpointC ?? '-'} C; ${!coil.on ? 'valve closed' : running ? `${mode === 'cooling' ? 'cooling' : 'heating'} ${Math.abs(coil.heatKw).toFixed(1)} kW, fan ${Math.round(coil.fan * 100)} %` : 'idle - the room is at its setpoint'}`}
      </title>
      <Gradients id={id} />
      <radialGradient id={`${id}hole`} cx="0.5" cy="0.5" r="0.5">
        <stop offset="0.8" stopColor="#c3c8ce" />
        <stop offset="1" stopColor="#a9afb6" />
      </radialGradient>
      <clipPath id={`${id}hc`}>
        <circle cx="306" cy="52" r="31.5" />
      </clipPath>
      <clipPath id={`${id}hg`}>
        <circle cx="306" cy="52" r={COIL_GRILLE_R} />
      </clipPath>
      <rect
        x="4"
        y="4"
        width="432"
        height="158"
        rx="16"
        fill={`url(#${id}body)`}
        stroke="#b9bec4"
        strokeWidth="1.5"
      />
      <path d="M14 98 H426" stroke="#b9bec4" strokeWidth="1.5" />
      <path d="M14 101 H426" stroke="#fff" strokeWidth="1.5" />
      <rect x="36" y="110" width="338" height="34" rx="5" fill="#2b2f34" />
      {louvres.map(([y, w]) => (
        <line key={y} x1="40" y1={y} x2="370" y2={y} stroke="#c9ced3" strokeWidth={w} />
      ))}
      {[60, 200, 340].map((x) => (
        <rect key={x} x={x} y="114" width="8" height="24" rx="2" fill="#eceef0" stroke="#9aa0a6" />
      ))}
      <circle cx="404" cy="118" r="2.2" fill={running ? '#3cb371' : '#a3adb8'} />
      <circle cx="404" cy="126" r="2.2" fill="#a3adb8" />
      <rect x="394" y="136" width="20" height="8" rx="2" fill="#e8eaec" stroke="#b9bec4" />
      <g transform={`translate(${FAN_COIL_SWITCH.x} ${FAN_COIL_SWITCH.y})`}>
        <Toggle id={id} on={coil.on} />
      </g>
      <text x={NAME_X} y="38" fontSize={NAME_FONT} fill="#1d2430">
        {fitText(coil.name, NAME_WIDTH, NAME_FONT)}
      </text>
      <text x="22" y="84" fontSize="31" fontWeight="700" fill={coil.on ? '#1d2430' : '#5d6878'}>
        {`${coil.roomC ?? '-'} °C`}
        <tspan dx="12">{`${coil.humidityPct ?? '-'} %`}</tspan>
      </text>
      <circle cx="306" cy="52" r="34" fill={`url(#${id}hole)`} stroke="#9ea4ab" strokeWidth="1.5" />
      <circle
        cx="306"
        cy="52"
        r="30.5"
        fill="none"
        stroke="#8d939a"
        strokeOpacity="0.4"
        strokeWidth="3"
      />
      <g clipPath={`url(#${id}hc)`}>
        <Fan id={id} cx={306} cy={52} r={25} rpm={running ? coil.fanRpm : 0} />
      </g>
      <g clipPath={`url(#${id}hg)`}>
        <Grille cx={306} cy={52} r={COIL_GRILLE_R} {...COIL_GRILLE} />
      </g>
      <g>
        <title>{`${mode === 'cooling' ? 'Cold' : 'Heat'} to the room ${heat.toFixed(1)} kW (rated ${ratedKw} kW)`}</title>
        <RoundGauge
          x={384}
          y={52}
          r={34}
          value={heat}
          limits={{ min: 0, max: Math.ceil(ratedKw) }}
          unit="kW"
          decimals={1}
          state={coil.on ? (heat > 0.05 ? 'active' : 'inactive') : 'inactive'}
        />
      </g>
    </svg>
  )
}
