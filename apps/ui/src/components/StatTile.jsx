import React from 'react'

/**
 * A labelled figure in a row of readings (a unit popup's Status, the
 * Ledger's KPIs - AGENTS.md "Key values", 2026-10-22): the label small and
 * muted, the value under it - its figures as `KeyValue` (bold, larger,
 * tabular digits), the rest of the text semibold with tabular digits too
 * (`.kv-tile`, scss/style.scss). `hint` - what it is (the tooltip).
 *
 *   <StatTile label="Power" hint="Now"><KeyValue value={12.4} decimals={1} unit="kW" /></StatTile>
 */
const StatTile = ({ label, hint, children }) => (
  <div title={hint}>
    <div className="small text-body-secondary">{label}</div>
    <div className="kv-tile">{children}</div>
  </div>
)

export default StatTile
