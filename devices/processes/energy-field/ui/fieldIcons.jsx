import React, { useId } from 'react'
import {
  PV_PANEL,
  PV_VIEW,
  TURBINE_HUB,
  TURBINE_ROTOR,
  TURBINE_TOWER,
  TURBINE_VIEW,
} from './genIcons/genIconPaths'

// The Energy Field's pictures in one style (images/AQUARIUM V16-V19.png,
// the reviewed mockup 2026-10-19): filled shapes with a currentColor
// outline, the state in the colour - natural, grey (no flow / off), red
// (a fault, out of range). Colours are CSS variables (SCENE_CSS) with a
// dark-theme set; the animations (a rotor, a flow, a pulsing voltage sign)
// are CSS too.

// the sky picture is the weather package's (it takes the --wx-* colours below)
export { SkyIcon } from '../../weather-control/ui/SkyIcon'
// the anemometer too - its frames from the user's video (weather-control/ui/anemometer)
export { default as AnemometerIcon } from '../../weather-control/ui/anemometer/AnemometerIcon'

export const SCENE_CSS = `
.ef-scene, .ef-colors {
  --ef-gen: #1f9d63; --ef-grid: #1d6fd8; --ef-batt: #0f9a96; --ef-cons: #e8760a;
  --ef-off: #a3adb8; --ef-bad: #d93b3b; --ef-warn: #f2b705; --ef-volt: #e0479e;
  --ef-panel: #1f3550; --ef-panel-grid: #8fb4e0; --ef-sun: #f6b73c; --ef-cloud: #e9eef3; --ef-cloud-edge: #9aa8b6;
  --wx-sun: var(--ef-sun); --wx-cloud: var(--ef-cloud); --wx-cloud-edge: var(--ef-cloud-edge); --wx-moon: var(--ef-panel-grid);
  --ef-sun-line: #e8590c; --ef-wind-line: #1c7ed6;
  --ef-card: var(--cui-body-bg); --ef-line: var(--cui-border-color); --ef-muted: var(--cui-secondary-color); --ef-ink: var(--cui-body-color);
  /* the flows - three colours only (the user, 2026-10-25): orange - against us (import, supply, discharge),
     green - for us (generation, export, charge), light grey - no flow (--ef-off); their figures and words too */
  --ef-cost: var(--ef-cons); --ef-gain: var(--ef-gen);
  /* a battery's figures over its charge - dark in both themes */
  --ef-charge-ink: #212631;
}
[data-coreui-theme='dark'] .ef-scene, [data-coreui-theme='dark'] .ef-colors {
  --ef-gen: #4cc38a; --ef-grid: #5aa2ff; --ef-batt: #2fc4c0; --ef-cons: #ff9a3c;
  --ef-off: #55606d; --ef-bad: #ff6b6b; --ef-volt: #ff8fd0; --ef-panel: #22364f; --ef-panel-grid: #7da7da;
  --ef-cloud: #c9d3de; --ef-cloud-edge: #8c99a8;
  --ef-sun-line: #ffb347; --ef-wind-line: #74c0fc;
}
@keyframes ef-chev { 0% { opacity: .15 } 35% { opacity: 1 } 70%, 100% { opacity: .15 } }
@keyframes ef-pulse { 0%, 100% { opacity: 1 } 50% { opacity: .7 } }
@keyframes ef-spin { to { transform: rotate(360deg) } }
@keyframes ef-blink { 0%, 100% { opacity: 1 } 50% { opacity: .3 } }
.ef-flow { animation: ef-pulse 3s ease-in-out infinite }
.ef-flow polyline { animation-name: ef-chev; animation-iteration-count: infinite; animation-timing-function: linear }
.ef-flow.ef-idle, .ef-flow.ef-idle polyline { animation: none; opacity: 1 }
/* a rotor turns about its hub - the hub's point in the icon's viewBox (ROTOR_HUB), never its blades' bounding box */
.ef-rotor { transform-box: view-box; animation: ef-spin linear infinite }
.ef-blink { animation: ef-blink 1s ease-in-out infinite }
@media (prefers-reduced-motion: reduce) { .ef-flow, .ef-flow polyline, .ef-rotor, .ef-blink { animation: none } }
`

// how a rotor turns on the screen: the real rpm slowed (a 200 rpm rotor
// would only blur) - one turn per `ROTOR_SLOWDOWN` x the real period
const ROTOR_SLOWDOWN = 6
// the hubs the rotors turn about, in their icons' viewBox units
const ROTOR_HUB = { turbine: `${TURBINE_HUB.x}px ${TURBINE_HUB.y}px` }
export const rotorPeriod = (rpm) =>
  rpm > 0 ? `${((60 / rpm) * ROTOR_SLOWDOWN).toFixed(2)}s` : null

// The generation's icons - the user's own silhouettes (images/fix-panel-windtower.png,
// 2026-10-23; traced - genIcons/README.md): the PV panel and the turbine one height, the pylon's
// and the consumer's; one colour (currentColor), grey when off. The turbine - its tower and its
// rotor, the rotor turning about its hub.
export const GEN_ICON_HEIGHT = 104

export const PvIcon = ({ height = GEN_ICON_HEIGHT, on = true }) => (
  <svg
    width={(height * PV_VIEW.w) / PV_VIEW.h}
    height={height}
    viewBox={`0 0 ${PV_VIEW.w} ${PV_VIEW.h}`}
    aria-hidden="true"
    style={{ color: on ? 'var(--ef-ink)' : 'var(--ef-off)' }}
  >
    <path transform={PV_PANEL.transform} d={PV_PANEL.d} fill="currentColor" />
  </svg>
)

// rotates about its hub (ROTOR_HUB.turbine), its speed - the real rpm slowed down;
// the tower is masked out under the blades - the ink colour is translucent
// (CoreUI's body colour), so where both were drawn the tower showed through
export const TurbineIcon = ({ height = GEN_ICON_HEIGHT, rpm = 0, state = 'running' }) => {
  const mask = `ef-rotor-${useId().replace(/:/g, '')}`
  const color =
    state === 'off'
      ? 'var(--ef-off)'
      : state === 'storm'
        ? 'var(--ef-warn)'
        : state === 'fault'
          ? 'var(--ef-bad)'
          : 'var(--ef-ink)'
  const period = state === 'running' || state === 'idle' ? rotorPeriod(rpm) : null
  const rotor = (fill) => (
    <g
      className={period ? 'ef-rotor' : undefined}
      style={period ? { animationDuration: period, transformOrigin: ROTOR_HUB.turbine } : undefined}
    >
      <path transform={TURBINE_ROTOR.transform} d={TURBINE_ROTOR.d} fill={fill} />
    </g>
  )
  return (
    <svg
      width={(height * TURBINE_VIEW.w) / TURBINE_VIEW.h}
      height={height}
      viewBox={`0 0 ${TURBINE_VIEW.w} ${TURBINE_VIEW.h}`}
      aria-hidden="true"
      style={{ color }}
    >
      <mask
        id={mask}
        maskUnits="userSpaceOnUse"
        x="0"
        y="0"
        width={TURBINE_VIEW.w}
        height={TURBINE_VIEW.h}
      >
        <rect width={TURBINE_VIEW.w} height={TURBINE_VIEW.h} fill="#fff" />
        {rotor('#000')}
      </mask>
      {/* the mask's user space - the viewBox (a group: the path's own transform would scale it) */}
      <g mask={`url(#${mask})`}>
        <path transform={TURBINE_TOWER.transform} d={TURBINE_TOWER.d} fill="currentColor" />
      </g>
      {rotor('currentColor')}
    </svg>
  )
}

/** Today's money: a coin with the euro sign - green when the day is in profit, red when it costs. */
/**
 * The generation as a whole (its popup - the user, 2026-10-25; a composite, may be replaced): the sun and the
 * wind over a PV panel and a turbine.
 */
export const GenerationIcon = ({ height = 150, on = true, rpm = 0 }) => (
  <span className="d-inline-flex flex-column align-items-center" aria-hidden="true">
    <svg width={height * 0.9} height={height * 0.28} viewBox="0 0 90 28">
      <circle cx="18" cy="14" r="8" fill={on ? 'var(--ef-sun)' : 'var(--ef-off)'} />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
        <line
          key={a}
          x1={18 + Math.cos((a * Math.PI) / 180) * 11}
          y1={14 + Math.sin((a * Math.PI) / 180) * 11}
          x2={18 + Math.cos((a * Math.PI) / 180) * 14}
          y2={14 + Math.sin((a * Math.PI) / 180) * 14}
          stroke={on ? 'var(--ef-sun)' : 'var(--ef-off)'}
          strokeWidth="2"
          strokeLinecap="round"
        />
      ))}
      {[8, 15, 22].map((y, i) => (
        <path
          key={y}
          d={`M${46 + i * 3} ${y} q10 -4 20 0 t20 0`}
          fill="none"
          stroke="var(--ef-wind-line)"
          strokeWidth="2"
          strokeLinecap="round"
        />
      ))}
    </svg>
    <span className="d-inline-flex align-items-end" style={{ gap: height * 0.04 }}>
      <PvIcon height={height * 0.62} on={on} />
      <TurbineIcon height={height * 0.72} rpm={rpm} state={rpm > 0 ? 'running' : 'idle'} />
    </span>
  </span>
)

export const MoneyIcon = ({ height = 40, positive = true }) => (
  <svg width={height} height={height} viewBox="0 0 40 40" aria-hidden="true">
    <circle
      cx="20"
      cy="20"
      r="17"
      fill="none"
      stroke={positive ? 'var(--ef-gen)' : 'var(--ef-bad)'}
      strokeWidth="3.5"
    />
    <path
      d="M25.5 13.5 A8 8 0 1 0 25.5 26.5 M11 18 H22 M11 22.5 H21"
      fill="none"
      stroke={positive ? 'var(--ef-gen)' : 'var(--ef-bad)'}
      strokeWidth="3"
      strokeLinecap="round"
    />
  </svg>
)

/**
 * `level` 0-100 (null - unknown), `state` ok | off | fault, `charging` - the bolt; `kwh` - the
 * stored energy. The charge's figures inside (the user, 2026-10-24): the % on the first line
 * with a small pink bolt left of it while charging (it stands out on the green / yellow charge),
 * the stored kWh on the second, the figures dark; the charge's colour - its level; "off" when
 * switched off.
 * `figures` false (a small icon - the Dashboard's card) - no figures, a big bolt while charging.
 */
export const BatteryIcon = ({
  width = 150,
  level,
  state = 'ok',
  charging = false,
  kwh,
  figures = false,
}) => {
  const off = state === 'off' || level === null || level === undefined
  const lv = Math.max(0, Math.min(100, level ?? 0))
  // the charge inside the case with one gap all round (the case's inner edge 10.5..139.5 x 14.5..97.5,
  // the fill 16..134 x 20..92 - 5.5 on every side at 100 %)
  const h = Math.round((72 * lv) / 100)
  const fillTop = 92 - h
  const edge = state === 'fault' ? 'var(--ef-bad)' : off ? 'var(--ef-off)' : 'var(--ef-ink)'
  // the charge's colour - its level (green / yellow / red)
  const fill = off
    ? 'var(--ef-off)'
    : lv < 20
      ? 'var(--ef-bad)'
      : lv < 40
        ? 'var(--ef-warn)'
        : 'var(--ef-gen)'
  // the figures dark (the user, 2026-10-24): the page's text colour over the empty case, the
  // light theme's dark text over the fill - dark on the orange in the dark theme too
  const ink = (middle) => (middle >= fillTop ? 'var(--ef-charge-ink)' : 'var(--ef-ink)')
  const pct = `${Math.round(lv)}`
  // the bolt left of the %, its height the digits' (the first line's cap height ~ 19 units);
  // the line's width estimated from the tabular digits (0.6 em) and the smaller unit
  const pctW = pct.length * 26 * 0.6 + 0.8 * 26 * 0.75
  // the bolt's own width and a small gap before the % (the user, 2026-10-24)
  const boltW = charging ? 19 : 0
  const x0 = 75 - (pctW + boltW) / 2
  return (
    <svg width={width} height={(width * 104) / 150} viewBox="0 0 150 104" aria-hidden="true">
      <rect x="26" y="2" width="22" height="10" rx="2" fill={edge} />
      <rect x="102" y="2" width="22" height="10" rx="2" fill={edge} />
      <rect
        x="8"
        y="12"
        width="134"
        height="88"
        rx="8"
        fill="var(--ef-card)"
        stroke={edge}
        strokeWidth="5"
      />
      <rect x="16" y={fillTop} width="118" height={h} rx="3" fill={fill} />
      {!figures && charging && !off && (
        <path
          d="M80 24 l-16 28 h11 l-5 22 l18 -30 h-11 z"
          fill="#ffffff"
          stroke={edge}
          strokeWidth="2"
          strokeLinejoin="round"
        />
      )}
      {!figures ? null : off ? (
        <text x="75" y="64" textAnchor="middle" fontSize="22" fontWeight="600" fill="var(--ef-off)">
          off
        </text>
      ) : (
        <g style={{ fontVariantNumeric: 'tabular-nums lining-nums' }}>
          {charging && (
            <path d={`M${x0 + 9} 33 l-8 11 h5 l-2 9 l9 -12 h-5 z`} fill="var(--ef-volt)" />
          )}
          <text x={x0 + boltW} y="53" fontSize="26" fontWeight="700" fill={ink(43)}>
            {pct}
            <tspan fontSize="20" fontWeight="400" dx="2">
              %
            </tspan>
          </text>
          {kwh !== undefined && kwh !== null && (
            <text x="75" y="78" textAnchor="middle" fontSize="19" fontWeight="700" fill={ink(71)}>
              {kwh >= 100 ? kwh.toFixed(0) : kwh.toFixed(1)}
              <tspan fontSize="15" fontWeight="400" dx="2">
                kWh
              </tspan>
            </text>
          )}
        </g>
      )}
    </svg>
  )
}

// The tariff's gauge (the user, 2026-10-24, images/speedometer-gauges-low-medium-high-vector.avif):
// top left, the bolt's mirror - an arc over the top, one segment per tariff zone from green (the
// cheapest) to red (the dearest), the needle in the zone now; no figures (they are in its title).
const GAUGE = { cx: 19, cy: 16, r: 9, from: 210, sweep: 240, gapDeg: 5, needle: 7.5 }
const gaugePoint = (deg, r) => {
  const a = (deg * Math.PI) / 180
  return [GAUGE.cx + r * Math.cos(a), GAUGE.cy - r * Math.sin(a)]
}
// green -> yellow -> red by the zone's rank (hue 120 -> 0)
const zoneColor = (i, n) => `hsl(${n > 1 ? 120 - (120 * i) / (n - 1) : 120} 80% 45%)`

const TariffGauge = ({ index, count, title }) => {
  const step = GAUGE.sweep / count
  const needle = gaugePoint(GAUGE.from - step * (index + 0.5), GAUGE.needle)
  return (
    <g>
      <title>{title}</title>
      {/* the face - a hover target as big as the gauge */}
      <circle cx={GAUGE.cx} cy={GAUGE.cy} r={GAUGE.r + 3} fill="transparent" />
      {Array.from({ length: count }, (_, i) => {
        const gap = count > 1 ? GAUGE.gapDeg / 2 : 0
        const [x0, y0] = gaugePoint(GAUGE.from - step * i - gap, GAUGE.r)
        const [x1, y1] = gaugePoint(GAUGE.from - step * (i + 1) + gap, GAUGE.r)
        return (
          <path
            key={i}
            d={`M${x0.toFixed(2)} ${y0.toFixed(2)} A${GAUGE.r} ${GAUGE.r} 0 ${step - 2 * gap > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`}
            fill="none"
            stroke={zoneColor(i, count)}
            strokeWidth="4"
          />
        )
      })}
      <line
        x1={GAUGE.cx}
        y1={GAUGE.cy}
        x2={needle[0]}
        y2={needle[1]}
        stroke="var(--ef-ink)"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx={GAUGE.cx} cy={GAUGE.cy} r="2" fill="var(--ef-ink)" />
    </g>
  )
}

/**
 * `voltage` ok | bad | none - the sign: pink, red blinking, grey. `tariff` - { index, count,
 * title } the zone now among the tariff's zones (cheapest first), null - no gauge.
 */
export const GridIcon = ({
  height = 104,
  flow = 'none',
  voltage = 'ok',
  outage = false,
  tariff = null,
}) => (
  <svg
    width={(height * 88) / 104}
    height={height}
    viewBox="0 0 88 104"
    aria-hidden="true"
    style={{
      color: outage ? 'var(--ef-bad)' : flow === 'none' ? 'var(--ef-off)' : 'var(--ef-grid)',
    }}
  >
    <path
      d="M44 6 L26 100 M44 6 L62 100 M30 80 L58 80 M33 60 L55 60 M36 40 L52 40 M30 80 L55 60 M58 80 L33 60 M33 60 L52 40 M55 60 L36 40"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinejoin="round"
    />
    <path d="M12 28 H76 M18 46 H70" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    <path d="M14 28 v6 M74 28 v6 M20 46 v6 M68 46 v6" stroke="currentColor" strokeWidth="2.5" />
    <path
      className={voltage === 'bad' ? 'ef-blink' : undefined}
      d="M70 6 l-7 11 h5 l-3 9 l9 -12 h-5 z"
      fill={
        voltage === 'bad'
          ? 'var(--ef-bad)'
          : voltage === 'none'
            ? 'var(--ef-off)'
            : 'var(--ef-volt)'
      }
    />
    {tariff && tariff.count > 0 && tariff.index >= 0 && <TariffGauge {...tariff} />}
  </svg>
)

/** `state` on | idle (no consumption) | bad (not covered). */
export const ConsumerIcon = ({ height = 104, state = 'on' }) => {
  const color =
    state === 'bad' ? 'var(--ef-bad)' : state === 'idle' ? 'var(--ef-off)' : 'var(--ef-cons)'
  return (
    <svg width={(height * 88) / 104} height={height} viewBox="0 0 88 104" aria-hidden="true">
      <path
        d="M44 6 a30 30 0 0 1 18 54 c-3 3 -4 7 -4 12 v4 H30 v-4 c0 -5 -1 -9 -4 -12 A30 30 0 0 1 44 6 Z"
        fill={color}
      />
      <rect x="31" y="80" width="26" height="6" rx="2" fill={color} />
      <rect x="34" y="89" width="20" height="6" rx="2" fill={color} />
      <path
        d="M36 22 v12 M52 22 v12 M31 34 h26 v6 a13 13 0 0 1 -26 0 Z M44 53 v14"
        fill="none"
        stroke="#fff"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

const CHEVRONS = {
  down: [
    [10, 8, 30, 22, 50, 8],
    [10, 26, 30, 40, 50, 26],
    [10, 44, 30, 58, 50, 44],
  ],
  up: [
    [10, 56, 30, 42, 50, 56],
    [10, 38, 30, 24, 50, 38],
    [10, 20, 30, 6, 50, 20],
  ],
  right: [
    [8, 10, 22, 30, 8, 50],
    [26, 10, 40, 30, 26, 50],
    [44, 10, 58, 30, 44, 50],
  ],
  left: [
    [56, 10, 42, 30, 56, 50],
    [38, 10, 24, 30, 38, 50],
    [20, 10, 6, 30, 20, 50],
  ],
}

// No flow (the user, 2026-10-24 - one sign for the whole scene): three still grey dots where
// the chevrons run - the road is there, nothing moves on it; no direction (a flow that stopped
// has none), the same along either axis.
const NO_FLOW_DOTS = {
  vertical: [
    [32, 14],
    [32, 32],
    [32, 50],
  ],
  horizontal: [
    [14, 32],
    [32, 32],
    [50, 32],
  ],
}

/**
 * A flow - three chevrons running as a road the way the energy goes, faster
 * with more power, a slow gentle pulse; no power - the no-flow sign (three
 * still grey dots). `kw` - the power (>= 0), `scaleKw` - the power at the
 * fastest run.
 */
// `title` - the flow's state on hover (its errors too); `onClick` - its details (a popup) - the user, 2026-10-25
export const Flow = ({
  dir = 'down',
  kw = 0,
  scaleKw = 100,
  color,
  size = 56,
  label,
  title,
  onClick,
}) => {
  const idle = !(kw > 0.05)
  const duration = idle ? 0 : Math.max(0.45, 2.2 - 1.75 * Math.min(1, kw / Math.max(1, scaleKw)))
  const axis = dir === 'left' || dir === 'right' ? 'horizontal' : 'vertical'
  const svg = (
    <svg
      className={`ef-flow${idle ? ' ef-idle' : ''}`}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label={idle ? `${label ?? 'Flow'} - no flow` : label}
      style={{ color: idle ? 'var(--ef-off)' : color }}
    >
      {idle
        ? NO_FLOW_DOTS[axis].map(([cx, cy]) => (
            <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="5" fill="currentColor" />
          ))
        : CHEVRONS[dir].map((p, i) => (
            <polyline
              key={i}
              points={`${p[0]},${p[1]} ${p[2]},${p[3]} ${p[4]},${p[5]}`}
              fill="none"
              stroke="currentColor"
              strokeWidth="5"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{
                animationDuration: `${duration}s`,
                animationDelay: `${(duration / 3) * i}s`,
              }}
            />
          ))}
    </svg>
  )
  if (!onClick && !title) return svg
  return (
    <button
      type="button"
      className="ef-flow-btn"
      title={title}
      aria-label={title ?? label}
      onClick={onClick}
      disabled={!onClick}
    >
      {svg}
    </button>
  )
}
