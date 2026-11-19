import React, { useEffect, useState } from 'react'

// The metal shop's step timer (2026-11-19, the line's bars, the CNC machines' cycles): a ring with a cut at its
// start, done (green) and left (yellow) on a white track, the seconds left in the middle - over the picture, the
// highest layer. The clock it counts on re-renders at a given moment and each second.

export const TIMER_CSS = `
.ms-timer { position: absolute; aspect-ratio: 1; transform: translate(-50%, -50%); overflow: visible; pointer-events: none }
.ms-timer text { font: 700 30px system-ui, sans-serif; fill: #1f2933; stroke: #fff; stroke-width: 7px; paint-order: stroke; stroke-linejoin: round }
`

// the step timer's ring: the cut at its start (degrees), its colours (done, left), its track
const RING = { cut: 36, done: '#1f9d6b', left: '#f0a500', track: 'rgba(255, 255, 255, 0.6)' }
const R = 40
const ARC = 2 * Math.PI * R
/** A ring's arc from `a` to `b` (shares of the ring without its cut) - nothing when too short to see (a round
 * cap of a zero-length dash would still draw a dot). */
const Arc = ({ a, b, color, width = 9 }) => {
  const arc = ARC * (1 - RING.cut / 360)
  const len = arc * (b - a)
  if (len < 0.5) return null
  return (
    <circle
      cx="50"
      cy="50"
      r={R}
      stroke={color}
      strokeWidth={width}
      strokeDasharray={`${len} ${ARC}`}
      strokeDashoffset={-arc * a}
    />
  )
}

/** A bar's step timer at `at` (the picture's shares), `size` - its width in the picture's shares. */
const StepTimer = ({ at, size, leftS, needS }) => {
  const p = needS > 0 ? Math.min(1, Math.max(0, 1 - leftS / needS)) : 1
  return (
    <svg
      className="ms-timer"
      viewBox="0 0 100 100"
      style={{ left: `${at[0] * 100}%`, top: `${at[1] * 100}%`, width: `${size * 100}%` }}
    >
      <g transform={`rotate(${-90 + RING.cut / 2} 50 50)`} fill="none" strokeLinecap="round">
        <Arc a={0} b={1} color={RING.track} width={15} />
        <Arc a={0} b={p} color={RING.done} />
        <Arc a={p} b={1} color={RING.left} />
      </g>
      <text
        x="50"
        y="51"
        textAnchor="middle"
        dominantBaseline="central"
        textLength={leftS >= 1000 ? 64 : undefined}
        lengthAdjust="spacingAndGlyphs"
      >
        {Math.ceil(leftS)}
      </text>
    </svg>
  )
}

/** The clock (ms) - re-rendered at `nextAt` (a phase's end, a station's half-way point) and each second. */
export const useClock = (nextAt) => {
  const [now, setNow] = useState(0)
  useEffect(() => {
    // the first tick at once (the clock starts at 0 - render stays pure)
    const wait = now ? Math.max(16, Math.min(1000, (nextAt ?? Infinity) - Date.now())) : 0
    const timer = setTimeout(() => setNow(Date.now()), wait)
    return () => clearTimeout(timer)
  }, [now, nextAt])
  return now
}

export default StepTimer
