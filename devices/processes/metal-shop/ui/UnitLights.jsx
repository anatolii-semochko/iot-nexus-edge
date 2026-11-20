import React from 'react'
import { packageT } from 'src/i18n'
// the package's words (its own locales/, then the core's)
const tr = packageT('metal-shop')

// The units' status lights (2026-11-20, the user): a small LED on the compressor's, the chiller's and the oven's
// panel - green blinking while the unit works, yellow while it stands by, red blinking on a fault, dark when off.
// Placed in each unit's hot spot (factory-<view>.json `items`) at a share of its box (LED_AT); only the LED's
// opacity is animated (compositor-only, iot memory).

export const LIGHTS_CSS = `
.ms-led { position: absolute; width: clamp(5px, .75%, 12px); aspect-ratio: 1; border-radius: 50%; transform: translate(-50%, -50%);
  pointer-events: none; border: 1px solid rgba(0, 0, 0, .35) }
.ms-led.run { background: #39d98a; box-shadow: 0 0 6px 2px rgba(57, 217, 138, .75); animation: ms-led 1.2s steps(1, end) infinite }
.ms-led.idle { background: #ffc531; box-shadow: 0 0 5px 1px rgba(255, 197, 49, .6) }
.ms-led.fault { background: #ff4d4d; box-shadow: 0 0 7px 2px rgba(255, 77, 77, .8); animation: ms-led .5s steps(1, end) infinite }
.ms-led.off { background: #4a5058 }
@keyframes ms-led { 0% { opacity: 1 } 50% { opacity: .25 } }
@media (prefers-reduced-motion: reduce) { .ms-led { animation: none } }
`

// the LED's place in each unit's box (shares of its width and height): the compressor's pump head, the chiller's
// panel by its display, the oven's control panel under its display
const LED_AT = {
  compressor: [0.78, 0.3],
  chiller: [0.92, 0.3],
  oven: [0.84, 0.75],
}
const WORDS = { run: 'running', idle: 'standing by', fault: 'fault', off: 'off' }

/** The utilities' units' states from their metrics. */
export const utilityLights = (m) => ({
  compressor:
    !m.onShift && m.compressor.state === 'off'
      ? 'off'
      : m.compressor.loadBar != null && m.compressor.bar < m.compressor.loadBar - 0.5
        ? 'fault'
        : m.compressor.state === 'loaded'
          ? 'run'
          : m.compressor.state === 'off'
            ? 'off'
            : 'idle',
  chiller: !m.chiller.running
    ? 'off'
    : m.chiller.setC != null && m.chiller.supplyC > m.chiller.setC + 3
      ? 'fault'
      : m.chiller.loadKw > 0
        ? 'run'
        : 'idle',
})

/** The oven's state from its metrics and config (`tolC` - its band). */
export const ovenLight = (m, cfg) => {
  const tol = cfg?.oven?.tolC ?? 4
  if ((m.drying?.length ?? 0) > 0 && m.tempC < m.setC - 2 * tol) return { oven: 'fault' }
  return { oven: m.heating || (m.drying?.length ?? 0) > 0 ? 'run' : 'idle' }
}

/** The LEDs over a picture: `spots` - its hot spots, `states` - { kind: 'run' | 'idle' | 'fault' | 'off' }. */
const UnitLights = ({ spots, states }) =>
  (spots?.items ?? []).map((it) => {
    const state = states[it.kind]
    const at = LED_AT[it.kind]
    if (!state || !at) return null
    const xs = it.poly.map((p) => p[0])
    const ys = it.poly.map((p) => p[1])
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
    return (
      <span
        key={it.kind}
        className={`ms-led ${state}`}
        title={tr(WORDS[state])}
        style={{
          left: `${(x0 + (x1 - x0) * at[0]) * 100}%`,
          top: `${(y0 + (y1 - y0) * at[1]) * 100}%`,
        }}
      />
    )
  })

export default UnitLights
