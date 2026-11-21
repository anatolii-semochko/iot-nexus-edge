import React from 'react'
import StepTimer, { TIMER_CSS, useClock } from './StepTimer'
import chemSpots from './factory-chem.json'

// The chemistry and wastewater zone's flows over its picture (2026-11-19, the user: "the pumps' work, the
// transfer, the press's cycle"): the render's pipes as polylines (factory-chem.json `flows`, in the picture's
// shares); dots run along a pipe while its pump works - a concentrate's dosing pump (its cap's colour, from the
// tank up and along the manifold to the line's wall), the transfer pump (the collection tank into the
// neutralization, on into the settler - water blue), the filter press (the settler's sludge into it, its cakes into
// the skip - brown). The dots move by transforms only (compositor-only animation, iot memory). The press's cycle -
// its timer (the metrics' `pressEndAt`), the highest layer.

const FLOWS = chemSpots.flows ?? {}
// a client clock further off the server's than this is corrected by the update's own time (`at`)
const SKEW_MS = 60_000
// the colours: each concentrate by its tank's cap (images/dashboard/v2 CHEM_TANKS), the water, the sludge
const COLOR = {
  acid: '#d93b3b',
  caustic: '#3f86c9',
  degreaser: '#2f9e5b',
  dye: '#a8326a',
  seal: '#5c636a',
  water: '#2e7fd0',
  sludge: '#7a5a3a',
}
// the dots' speed (picture widths a second) and their number on a pipe
const SPEED = 0.06
const DOTS = 5

const pct = (v) => `${(v * 100).toFixed(3)}%`
const length = (line) =>
  line.slice(1).reduce((a, p, k) => a + Math.hypot(p[0] - line[k][0], p[1] - line[k][1]), 0)

/** A flow's keyframes: along its polyline, each point at its share of the length. */
const keyframes = (name, line) => {
  const total = length(line) || 1
  let run = 0
  const steps = line.map((p, k) => {
    if (k > 0) run += Math.hypot(p[0] - line[k - 1][0], p[1] - line[k - 1][1])
    return `  ${((run / total) * 100).toFixed(2)}% { transform: translate(${cq(p[0], 'w')}, ${cq(p[1], 'h')}) }`
  })
  return `@keyframes ms-flow-${name} {\n${steps.join('\n')}\n}`
}

// a share of the picture in its container's units - each dot's wrapper is a point moved over the picture, not a
// full-frame layer (2026-11-21: full-frame layers per dot ran a GPU out of its layers' memory)
const cq = (v, axis) => `${(v * 100).toFixed(3)}cq${axis}`

const CSS = `
.ms-flows { position: absolute; inset: 0; pointer-events: none; overflow: hidden; container-type: size }
.ms-flows .ms-flow { position: absolute; left: 0; top: 0; width: 0; height: 0; animation-timing-function: linear;
  animation-iteration-count: infinite }
.ms-flows .ms-flow i { position: absolute; left: 0; top: 0; width: 0.9cqw; aspect-ratio: 1; border-radius: 50%;
  transform: translate(-50%, -50%); box-shadow: 0 0 0 1.5px rgba(255, 255, 255, 0.85) }
@media (prefers-reduced-motion: reduce) { .ms-flows .ms-flow { display: none } }
${Object.entries(FLOWS)
  .map(([name, line]) => keyframes(name.replace(':', '-'), line))
  .join('\n')}
`

/** The flows running now, each with its colour. */
const running = (m) => {
  const out = []
  for (const d of m.dosing ?? [])
    if (d.pump) out.push([`dose:${d.tank}`, COLOR[d.tank] ?? COLOR.water])
  const w = m.wastewater ?? {}
  if (w.pump) out.push(['transfer', COLOR.water], ['settle', COLOR.water])
  if (w.press) out.push(['sludge', COLOR.sludge], ['cake', COLOR.sludge])
  return out.filter(([name]) => FLOWS[name])
}

const ChemFlows = ({ m }) => {
  const local = useClock(null)
  if (!local || !m) return null
  const skew = m.at && Math.abs(local - m.at) > SKEW_MS ? local - m.at : 0
  const t = local - skew
  const w = m.wastewater ?? {}
  const cake = FLOWS.cake?.[0]
  return (
    <div className="ms-flows" aria-hidden="true">
      <style>{CSS + TIMER_CSS}</style>
      {running(m).flatMap(([name, color]) => {
        const secs = Math.max(1.5, length(FLOWS[name]) / SPEED)
        return Array.from({ length: DOTS }, (_, k) => (
          <div
            key={`${name}-${k}`}
            className="ms-flow"
            style={{
              animationName: `ms-flow-${name.replace(':', '-')}`,
              animationDuration: `${secs}s`,
              animationDelay: `${(-secs * k) / DOTS}s`,
            }}
          >
            <i style={{ background: color }} />
          </div>
        ))
      })}
      {w.press && Number.isFinite(w.pressEndAt) && w.pressSpanS > 0 && cake && (
        <StepTimer
          at={[cake[0], cake[1] - 0.12]}
          size={0.07}
          leftS={Math.max(0, (w.pressEndAt - t) / 1000)}
          needS={w.pressSpanS}
        />
      )}
    </div>
  )
}

export default ChemFlows
