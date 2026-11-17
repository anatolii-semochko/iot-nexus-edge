import React, { useState } from 'react'

// The hover line of an SVG chart (the user, 2026-11-17 - as the aquarium's History): a vertical line at
// the time under the pointer (or a finger), a dot on each curve and a small readout - the time, then the
// values in their curves' colours - beside the line, flipped to its left near the right edge. For the
// charts drawn on a time axis in a viewBox: the energy ledger's plan, the heating plan, the prices
// (SeriesChart has its own - one moment shared by its stacked charts).

/**
 * The moment under the pointer. `W` - the viewBox's width; `left` / `right` - the plot's margins in it;
 * `t0` / `t1` - the axis's ends; `last` - no later than this (the data's end), optional.
 * Returns [t | null, the svg's props].
 */
export function useChartHover({ W, left, right, t0, t1, last }) {
  const [t, setT] = useState(null)
  const props = {
    onPointerMove: (e) => {
      const r = e.currentTarget.getBoundingClientRect()
      const vx = ((e.clientX - r.left) / r.width) * W
      if (vx < left || vx > W - right) return setT(null)
      const at = t0 + ((vx - left) / (W - left - right)) * (t1 - t0)
      setT(last !== undefined && at > last ? null : at)
    },
    onPointerLeave: () => setT(null),
  }
  return [t, props]
}

/** A value as the readouts show it: 0-2 decimals by its size. */
export const hoverValue = (v) => {
  const a = Math.abs(v)
  return v.toFixed(a >= 100 ? 0 : a >= 10 ? 1 : 2)
}

/** "14:05" - the time's line of a readout; a date before it when `withDay`. */
export const hoverTime = (t, withDay = false) =>
  new Date(t).toLocaleString([], {
    ...(withDay ? { weekday: 'short' } : {}),
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })

/**
 * The line, the dots and the readout. `x` - the line's x; `top` / `bottom` - its ends; `W` / `right` -
 * where the readout flips; `title` - the readout's first line (the time); `rows` - [{ label, value
 * (text), color, y (a dot, optional) }].
 */
export const HoverMarks = ({ x, top, bottom, W, right, title, rows }) => {
  const texts = [title, ...rows.map((r) => (r.label ? `${r.label}: ${r.value}` : r.value))]
  const boxW = Math.max(...texts.map((tx) => tx.length)) * 6.2 + 14
  const boxH = texts.length * 14 + 8
  const bx = x + boxW + 10 > W - right ? x - boxW - 6 : x + 6
  return (
    <g pointerEvents="none">
      <line
        x1={x}
        x2={x}
        y1={top}
        y2={bottom}
        stroke="var(--cui-body-color)"
        strokeOpacity="0.45"
      />
      {rows
        .filter((r) => r.y !== undefined && r.y !== null)
        .map((r, i) => (
          <circle
            key={i}
            cx={x}
            cy={r.y}
            r="3"
            fill={r.color}
            stroke="var(--cui-body-bg)"
            strokeWidth="1"
          />
        ))}
      <rect
        x={bx}
        y={top + 2}
        width={boxW}
        height={boxH}
        rx="4"
        fill="var(--cui-body-bg)"
        stroke="var(--cui-border-color)"
        opacity="0.95"
      />
      {texts.map((tx, i) => (
        <text
          key={i}
          x={bx + 7}
          y={top + 15 + i * 14}
          fontSize="11"
          fontWeight={i === 0 ? 600 : 400}
          fill={i === 0 ? 'var(--cui-body-color)' : rows[i - 1].color}
        >
          {tx}
        </text>
      ))}
    </g>
  )
}
