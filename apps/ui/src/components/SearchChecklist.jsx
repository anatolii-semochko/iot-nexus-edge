import React, { useState } from 'react'
import { CFormCheck, CFormInput, CFormSwitch } from '@coreui/react'

/**
 * A long list of checkboxes (2026-10-27 - every long list in a form gets it): a search by a part of a
 * word (the label and the detail), "Selected only" and the count selected. `items` - [{key, label,
 * detail?, depth?}] (`depth` - an indent, a tree's level); `selected` - the keys; `onToggle(key)`.
 */
const SearchChecklist = ({
  id,
  items,
  selected,
  onToggle,
  disabled,
  label,
  maxHeight = '14rem',
  empty = 'Nothing yet.',
}) => {
  const [query, setQuery] = useState('')
  const [selectedOnly, setSelectedOnly] = useState(false)
  const chosen = new Set(selected)
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const shown = items.filter(
    (x) =>
      (!selectedOnly || chosen.has(x.key)) &&
      words.every((w) => `${x.label} ${x.detail ?? ''}`.toLowerCase().includes(w)),
  )
  return (
    <div>
      <div className="d-flex gap-2 align-items-center mb-1 flex-wrap">
        {label && <span className="small fw-semibold">{label}</span>}
        <span className="small text-body-secondary">
          {items.filter((x) => chosen.has(x.key)).length} of {items.length} selected
        </span>
        <CFormInput
          size="sm"
          type="search"
          placeholder="Search"
          aria-label={`Search${label ? ` - ${label}` : ''}`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ maxWidth: '14rem' }}
          className="ms-auto"
        />
        <CFormSwitch
          id={`${id}-selected`}
          label="Selected only"
          checked={selectedOnly}
          onChange={(e) => setSelectedOnly(e.target.checked)}
          className="mb-0 small"
        />
      </div>
      <div className="border rounded p-2" style={{ maxHeight, overflow: 'auto' }}>
        {shown.map((x) => (
          // a tree's level - the row indented (not the box - CFormCheck styles its input)
          <div key={x.key} style={x.depth ? { paddingLeft: `${x.depth * 1.25}rem` } : undefined}>
            <CFormCheck
              id={`${id}-${x.key}`}
              label={
                <>
                  {x.label}
                  {x.detail && <span className="text-body-secondary small"> - {x.detail}</span>}
                </>
              }
              checked={chosen.has(x.key)}
              disabled={disabled}
              onChange={() => onToggle(x.key)}
            />
          </div>
        ))}
        {shown.length === 0 && (
          <div className="small text-body-secondary">
            {items.length === 0
              ? empty
              : selectedOnly && !chosen.size
                ? 'None selected yet.'
                : 'Nothing matches.'}
          </div>
        )}
      </div>
    </div>
  )
}

export default SearchChecklist
