import React from 'react'

/**
 * A block's summary line (the user, 2026-10-24): its name, then its key figures with their words -
 * "Generation 7.9 kW PV + 0.2 kW wind", "Batteries 84 % - 169 of 268 kWh". Three classes
 * (scss/style.scss): `.sum-title` the name, `.sum-value` a figure (bold, 1.5em, tabular digits, the
 * block's colour), `.sum-text` the words (grey) - a figure's unit right after it `.sum-unit` (grey,
 * slanted; 2026-10-25). `items` - in order: `{ v }` a figure (a ready string,
 * null - "-"), a string - words; `color` - the figures' colour (the block's; the words stay grey),
 * the name keeps the text colour; `title` - the name, `hint` - what it is (a tooltip); `children` -
 * anything after (muted words).
 *
 *   <SummaryLine title="Generation" color="var(--ef-gen)"
 *     items={[{ v: '7.9' }, 'kW PV +', { v: '0.2' }, 'kW wind']} />
 */
// a unit the words after a figure start with
const UNIT = /^(kWh|kWp|kW|W\/m²|m\/s|ct\/kWh|°C|%|€|EUR|V|Hz|A|l|h)(?=\s|$|[,.;:)-])/

/** The words after a figure: its unit slanted, the rest plain - both grey. */
const Words = ({ text, afterFigure }) => {
  const m = afterFigure ? text.match(UNIT) : null
  if (!m) return <span className="sum-text">{text}</span>
  return (
    <span className="sum-text">
      <span className="sum-unit">{m[1]}</span>
      {text.slice(m[1].length)}
    </span>
  )
}

const SummaryLine = ({ title, items = [], color, hint, className = '', children }) => (
  <div className={`sum-line ${className}`} title={hint}>
    {title && <span className="sum-title">{title}</span>}
    <span className="sum-figures" style={color ? { color } : undefined}>
      {items.map((it, i) =>
        typeof it === 'string' ? (
          <Words key={i} text={it} afterFigure={i > 0 && typeof items[i - 1] !== 'string'} />
        ) : (
          <span key={i} className="sum-value">
            {it.v === null || it.v === undefined ? '-' : it.v}
          </span>
        ),
      )}
    </span>
    {children}
  </div>
)

export default SummaryLine
