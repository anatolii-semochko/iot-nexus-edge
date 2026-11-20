import React from 'react'
import StepTimer, { TIMER_CSS, useClock } from './StepTimer'
import cncSpots from './factory-cnc.json'
import shopSpots from './factory-shop.json'

// The CNC machines over their picture (2026-11-19, iot AGENTS_TO_DO.md - the CNC stage): the picture has the
// machines with their windows open; each machine's door and spindle head are sprites rendered with the same camera
// (factory-<view>-cnc-<door|head>-<k>.webp - each the picture's full frame), moved by transforms only
// (compositor-only animation, iot memory). The places - the render's hot spots `cnc` (each machine's door lift and
// the head's travel as vectors, the window's corners, the status light, the timer's place - in the picture's
// shares). By the machine's state (the machining process's metrics):
//  - run: the door closed, the head working behind the glass (a loop along x with plunges);
//  - setup, alarm: the door raised, the head still;
//  - idle, off: the door closed, the head still.
// The status light glows the state's colour (an alarm blinks); over the window - the state's timer (the cycle,
// the setup, the tool's change), counted to the metrics' `endAt` on the panel's clock. Two views: the CNC zone's
// popup ("cnc") and the shop's plan ("shop"). The operator in front of the first machine - his own sprite
// (factory-<view>-cnc-front-0.webp) over the doors (the user, 2026-11-19: his head went under the door).

const SPRITES = import.meta.glob('./factory-*-cnc-{door,head,front}-*.webp', {
  eager: true,
  import: 'default',
})
const SPOTS = { cnc: cncSpots.cnc ?? [], shop: shopSpots.cnc ?? [] }
// a client clock further off the server's than this is corrected by the update's own time (`at`)
const SKEW_MS = 60_000
// the status light's colour by the state (none - not lit)
const LIGHT = { run: '#22c55e', setup: '#f0a500', alarm: '#e5484d' }
// by the view: the status light's width (% of the picture) and the timer's (of the window's width) - the
// plan is far smaller than the zone's picture
const SIZES = { cnc: { light: 1.4, timer: 0.42 }, shop: { light: 0.7, timer: 0.55 } }
// the door's travel, s
const DOOR_S = 1.6
// the head's loop, s; its travel - shares of the render's vectors (x: 0.12 m, z: 0.05 m of the machine's scale)
const RUN_S = 7
const RUN_PATH = [
  [0, 0, 0],
  [12, -1.3, 0],
  [20, -1.3, -1],
  [45, 1.3, -1],
  [53, 1.3, 0],
  [62, 0.6, 0],
  [68, 0.6, -1.4],
  [76, 0.6, 0],
  [86, -0.6, 0],
  [91, -0.6, -1.4],
  [96, -0.6, 0],
  [100, 0, 0],
]

const pct = (v) => `${(v * 100).toFixed(3)}%`
const CSS = `
.ms-cnc { position: absolute; inset: 0; pointer-events: none; overflow: hidden }
.ms-cnc img { position: absolute; left: 0; top: 0; width: 100%; height: auto; will-change: transform }
.ms-cnc .ms-cnc-window { position: absolute; inset: 0 }
.ms-cnc .ms-cnc-door { transition: transform ${DOOR_S}s ease-in-out }
.ms-cnc .ms-cnc-run { animation: ms-cnc-run ${RUN_S}s linear infinite }
.ms-cnc .ms-cnc-light { position: absolute; aspect-ratio: 1; border-radius: 50%; transform: translate(-50%, -50%);
  will-change: opacity }
.ms-cnc .ms-cnc-blink { animation: ms-cnc-blink 1s steps(2, jump-none) infinite }
@keyframes ms-cnc-run {
${RUN_PATH.map(
  ([at, x, z]) =>
    `  ${at}% { transform: translate(calc(var(--hx) * ${x} + var(--zx) * ${z}), calc(var(--hy) * ${x} + var(--zy) * ${z})) }`,
).join('\n')}
}
@keyframes ms-cnc-blink { 0% { opacity: 1 } 100% { opacity: 0.25 } }
@media (prefers-reduced-motion: reduce) { .ms-cnc .ms-cnc-run, .ms-cnc .ms-cnc-blink { animation: none } }
`

const CncMachines = ({ m, view = 'cnc' }) => {
  const spots = SPOTS[view] ?? []
  const machines = m?.machines ?? []
  const local = useClock(null)
  if (!local || !spots.length || !machines.length) return null
  const skew = m.at && Math.abs(local - m.at) > SKEW_MS ? local - m.at : 0
  const t = local - skew
  const sprite = (name, k) => SPRITES[`./factory-${view}-cnc-${name}-${k}.webp`]
  const placed = spots.slice(0, machines.length).map((sp, k) => ({ sp, k, x: machines[k] }))
  return (
    <div className="ms-cnc" aria-hidden="true">
      <style>{CSS + TIMER_CSS}</style>
      {placed.map(({ sp, k, x }) =>
        sprite('head', k) ? (
          <div
            key={`h${k}`}
            className="ms-cnc-window"
            style={{
              clipPath: `polygon(${sp.window.map((p) => `${pct(p[0])} ${pct(p[1])}`).join(', ')})`,
            }}
          >
            <img
              src={sprite('head', k)}
              alt=""
              className={x.state === 'run' ? 'ms-cnc-run' : undefined}
              style={{
                '--hx': pct(sp.headX[0]),
                '--hy': pct(sp.headX[1]),
                '--zx': pct(sp.headZ[0]),
                '--zy': pct(sp.headZ[1]),
                // each machine its own pace and phase - two heads in step looked staged (the user, 2026-11-20)
                animationDuration: `${RUN_S * (1 + 0.23 * k)}s`,
                animationDelay: `${-RUN_S * 0.41 * k}s`,
              }}
            />
          </div>
        ) : null,
      )}
      {placed.map(({ sp, k, x }) =>
        sprite('door', k) ? (
          <img
            key={`d${k}`}
            src={sprite('door', k)}
            alt=""
            className="ms-cnc-door"
            style={{
              transform:
                x.state === 'setup' || x.state === 'alarm'
                  ? `translate(${pct(sp.door[0])}, ${pct(sp.door[1])})`
                  : 'none',
            }}
          />
        ) : null,
      )}
      {/* what stands in front of the machines (the operator) - over the doors */}
      {sprite('front', 0) && <img src={sprite('front', 0)} alt="" />}
      {placed.map(({ sp, k, x }) =>
        LIGHT[x.state] ? (
          <div
            key={`l${k}`}
            className={`ms-cnc-light${x.state === 'alarm' ? ' ms-cnc-blink' : ''}`}
            style={{
              left: pct(sp.light[0]),
              width: `${SIZES[view].light}%`,
              top: pct(sp.light[1]),
              background: LIGHT[x.state],
              boxShadow: `0 0 0.6em 0.25em ${LIGHT[x.state]}`,
            }}
          />
        ) : null,
      )}
      {placed.map(({ sp, k, x }) => {
        if (!Number.isFinite(x.endAt) || !(x.spanS > 0)) return null
        const size = Math.abs(sp.window[1][0] - sp.window[0][0]) * SIZES[view].timer
        return (
          <StepTimer
            key={`t${k}`}
            at={sp.timer}
            size={size}
            leftS={Math.max(0, (x.endAt - t) / 1000)}
            needS={x.spanS}
          />
        )
      })}
    </div>
  )
}

export default CncMachines
