import React from 'react'
import { formatSmartDateTime, smartDateTimeParts } from 'src/utils/format'

// Tables on a narrow screen (a phone - below Bootstrap's md, 768 px): a table keeps the columns a person
// looks for first (the name, the main value, the actions) and hides the rest; the hidden ones are shown in
// the row's expanded part, as label - value lines (NarrowFields). No sideways scroll that one has to know
// about. A row without an expanded part of its own gets a toggle seen only on a phone (ExpandToggleButton
// with className={NARROW_ONLY}) and a row of NarrowFields under it.

/** A header / data cell seen only on a wide screen (md and up). */
export const WIDE_ONLY = 'd-none d-md-table-cell'
/** Anything seen only on a narrow screen: a toggle, a row, an inline short form of a value. */
export const NARROW_ONLY = 'd-md-none'
/** An inline element seen only on a wide screen. */
export const WIDE_ONLY_INLINE = 'd-none d-md-inline'

/** The class names joined, empty ones dropped - `cx(WIDE_ONLY, expanded && 'border-bottom-0')`. */
export const cx = (...names) => names.filter(Boolean).join(' ') || undefined

/**
 * The columns a narrow screen hides, as label - value lines, for a row's expanded part. Seen only on a
 * narrow screen (a wide one shows them in their columns). `fields` - [{ label, value }]; an empty value
 * is left out.
 */
export function NarrowFields({ fields, className }) {
  const shown = fields.filter(
    (f) => f && f.value !== null && f.value !== undefined && f.value !== '',
  )
  if (!shown.length) return null
  return (
    <dl className={cx(NARROW_ONLY, 'ne-narrow-fields', className)}>
      {shown.map((f) => (
        <React.Fragment key={f.label}>
          <dt>{f.label}</dt>
          <dd>{f.value}</dd>
        </React.Fragment>
      ))}
    </dl>
  )
}

/**
 * A row under a table row holding only its NarrowFields - for a table whose rows have no expanded part
 * of their own. `colSpan` - the table's column count (a larger one is harmless).
 */
export function NarrowFieldsRow({ fields, colSpan = 20 }) {
  return (
    <tr className={NARROW_ONLY}>
      <td colSpan={colSpan} className="pt-0">
        <NarrowFields fields={fields} />
      </td>
    </tr>
  )
}

/**
 * A date-time in a table: "Today, 14:30" / "20 Oct 2026, 14:30" on a wide screen; on a narrow one the
 * day in digits over the time ("20.10.2026" / "14:30") - a column as narrow as it can be.
 */
export function SmartDateTime({ iso }) {
  return (
    <>
      <span className={cx(WIDE_ONLY_INLINE, 'text-nowrap')}>{formatSmartDateTime(iso)}</span>
      <span className={cx(NARROW_ONLY, 'small text-nowrap')}>
        {smartDateTimeParts(iso, { numeric: true }).map((part, i) => (
          <span key={i} className="d-block">
            {part}
          </span>
        ))}
      </span>
    </>
  )
}
