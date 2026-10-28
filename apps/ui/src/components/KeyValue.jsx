import React from 'react'

/**
 * A key value in text (AGENTS.md "Key values", 2026-10-22) - the figure a
 * person looks for first: bold, larger, tabular digits; its unit smaller
 * and regular (`.kv` / `.kv-unit`, scss/style.scss). `value` - a number
 * (formatted to `decimals`) or a ready string; `unit` - optional; `color` -
 * the figure's own (e.g. green for generation); `title` - what it is.
 *
 *   <KeyValue value={10.7} unit="kW" decimals={1} /> PV + <KeyValue value={8.9} unit="kW" /> wind
 */
const KeyValue = ({ value, unit, decimals, color, title, className = '' }) => {
  const text =
    value === null || value === undefined || (typeof value === 'number' && Number.isNaN(value))
      ? '-'
      : typeof value === 'number' && decimals !== undefined
        ? value.toFixed(decimals)
        : String(value)
  return (
    <span className={`kv ${className}`} style={color ? { color } : undefined} title={title}>
      {text}
      {unit && <span className="kv-unit">{unit}</span>}
    </span>
  )
}

export default KeyValue
