import React, { useId } from 'react'
import lineSpots from './factory-line.json'
import shopSpots from './factory-shop.json'

// The baths' front walls (2026-11-20, the user): on each bath's front - its heater's coil, as on the aquarium's
// panel (the coil alone, no cap): grey at rest, glowing orange while it heats (the cooled anodize bath - its
// cooling coil, glowing blue while it cools); on the right the service marks - the level's tube (blue, yellow
// under the warning's level, its tick) and, on a dosed bath, the concentration's drop (green in its band, yellow
// out of it, a white plus while its pump doses). The fronts - the render's hot spots `fronts` (each bath's front
// wall: left-bottom, right-bottom, right-top, left-top). Static SVG - nothing inside it is animated.

const SPOTS = { line: lineSpots, shop: shopSpots }
const COIL = {
  idle: { front: '#9aa0a6', back: '#7b828a' },
  hot: { front: '#ffb02e', back: '#e0531a', glow: '#ff8a1f', shine: '#fff3b0' },
  cold: { front: '#7cc8ff', back: '#1683d8', glow: '#3aa0ff', shine: '#e6f6ff' },
}
const LEVEL = { ok: '#3d8fd6', low: '#f0a500', tube: 'rgba(255, 255, 255, 0.85)', edge: '#6b7680' }
const DROP = { ok: '#1f9d6b', off: '#f0a500' }

/** The coil: `x` its middle, from `y0` to `y1`, `rx` its half width; `kind` - 'idle' | 'hot' | 'cold'. */
const Coil = ({ x, y0, y1, rx, kind, glowId }) => {
  const p = COIL[kind]
  const ry = rx * 0.22
  const turns = 4
  const top = y0 + (y1 - y0) * 0.38
  const step = (y1 - ry - top) / (turns - 1)
  const ys = Array.from({ length: turns }, (_, k) => top + k * step)
  const arc = (cy, front) => `M${x - rx} ${cy} A${rx} ${ry} 0 0 ${front ? 0 : 1} ${x + rx} ${cy}`
  const w = Math.max(1, rx * 0.17)
  return (
    <g>
      {kind !== 'idle' && (
        <ellipse
          cx={x}
          cy={(top + y1) / 2}
          rx={rx * 1.9}
          ry={(y1 - top) * 0.75}
          fill={p.glow}
          opacity={0.45}
          filter={`url(#${glowId})`}
        />
      )}
      {/* the rods from the rim down to the coil */}
      <path
        d={`M${x - rx * 0.25} ${y0} V${ys[0]} M${x + rx * 0.25} ${y0} V${ys[0] - ry}`}
        stroke={p.front}
        strokeWidth={w}
        strokeLinecap="round"
      />
      {ys.map((cy) => (
        <path
          key={`b${cy}`}
          d={arc(cy, false)}
          fill="none"
          stroke={p.back}
          strokeWidth={w * 0.85}
          strokeLinecap="round"
        />
      ))}
      {ys.map((cy) => (
        <path
          key={`f${cy}`}
          d={arc(cy, true)}
          fill="none"
          stroke={p.front}
          strokeWidth={w}
          strokeLinecap="round"
        />
      ))}
      {kind !== 'idle' &&
        ys.map((cy) => (
          <path
            key={`h${cy}`}
            d={arc(cy, true)}
            fill="none"
            stroke={p.shine}
            strokeWidth={w * 0.3}
            strokeLinecap="round"
            opacity={0.9}
          />
        ))}
    </g>
  )
}

/** The level's tube: `x` its middle, from `y0` to `y1`, `w` its width; the tick at the warning's level. */
const Level = ({ x, y0, y1, w, pct, lowPct }) => {
  const h = y1 - y0
  const fill = (h * Math.min(100, Math.max(0, pct))) / 100
  const low = lowPct != null && pct < lowPct
  return (
    <g>
      <rect
        x={x - w / 2}
        y={y0}
        width={w}
        height={h}
        rx={w / 2}
        fill={LEVEL.tube}
        stroke={LEVEL.edge}
        strokeWidth={w * 0.12}
      />
      <rect
        x={x - w / 2 + w * 0.18}
        y={y1 - fill + w * 0.18}
        width={w * 0.64}
        height={Math.max(0, fill - w * 0.36)}
        rx={w * 0.3}
        fill={low ? LEVEL.low : LEVEL.ok}
      />
      {lowPct != null && (
        <line
          x1={x - w * 0.8}
          x2={x + w * 0.8}
          y1={y1 - (h * lowPct) / 100}
          y2={y1 - (h * lowPct) / 100}
          stroke={LEVEL.edge}
          strokeWidth={w * 0.14}
          strokeLinecap="round"
        />
      )}
    </g>
  )
}

/** The concentration's drop at (`x`, `y` - its tip's bottom), `s` its height; a plus while its pump doses. */
const Drop = ({ x, y, s, ok, dosing }) => {
  const r = s * 0.32
  const cy = y - r
  return (
    <g>
      <path
        d={`M${x} ${y - s} C${x + r * 0.4} ${y - s * 0.72} ${x + r} ${cy - r * 0.4} ${x + r} ${cy} A${r} ${r} 0 1 1 ${x - r} ${cy} C${x - r} ${cy - r * 0.4} ${x - r * 0.4} ${y - s * 0.72} ${x} ${y - s} Z`}
        fill={ok ? DROP.ok : DROP.off}
        stroke="#fff"
        strokeWidth={s * 0.06}
      />
      {dosing && (
        <path
          d={`M${x - r * 0.5} ${cy} H${x + r * 0.5} M${x} ${cy - r * 0.5} V${cy + r * 0.5}`}
          stroke="#fff"
          strokeWidth={s * 0.1}
          strokeLinecap="round"
        />
      )}
    </g>
  )
}

/** The fronts over a line's picture: `m` - the line's metrics, `cfg` - its config, `chem` - the chemistry's
 * metrics (the dosing; optional), `view` - 'line' | 'shop'. */
const BathFronts = ({ m, cfg, chem, view = 'line' }) => {
  const glowId = useId()
  const spots = SPOTS[view]
  const fronts = spots?.fronts
  if (!fronts?.length || !m?.baths) return null
  const [W, H] = spots.size
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
      }}
    >
      <defs>
        <filter id={glowId} x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation={view === 'shop' ? 2.5 : 5} />
        </filter>
      </defs>
      {m.baths.map((b, k) => {
        const q = fronts[k]
        if (!q) return null
        const [lb, rb, , lt] = q.map(([x, y]) => [x * W, y * H])
        const fw = rb[0] - lb[0]
        const y0 = lt[1] + (lb[1] - lt[1]) * 0.1
        const y1 = lt[1] + (lb[1] - lt[1]) * 0.88
        const bc = cfg?.baths?.find((c) => c.name === b.name) ?? cfg?.baths?.[k]
        const coil =
          bc?.heaterKw > 0
            ? b.heating
              ? 'hot'
              : 'idle'
            : bc?.coolerKw > 0
              ? b.cooling
                ? 'cold'
                : 'idle'
              : null
        const dose = chem?.dosing?.find((d) => d.bath === b.name)
        const lw = Math.max(2.5, fw * 0.075)
        return (
          <g key={b.name}>
            {coil && (
              <Coil
                x={lb[0] + fw * 0.16}
                y0={y0}
                y1={y1}
                rx={fw * 0.1}
                kind={coil}
                glowId={glowId}
              />
            )}
            {Number.isFinite(b.levelPct) && (
              <Level
                x={rb[0] - fw * 0.1}
                y0={y0}
                y1={y1}
                w={lw}
                pct={b.levelPct}
                lowPct={m.lowLevelPct}
              />
            )}
            {dose && (
              <Drop
                x={rb[0] - fw * 0.22}
                y={y1}
                s={(y1 - y0) * 0.55}
                ok={dose.gl >= dose.targetGl - dose.bandGl}
                dosing={dose.pump}
              />
            )}
          </g>
        )
      })}
    </svg>
  )
}

export default BathFronts
