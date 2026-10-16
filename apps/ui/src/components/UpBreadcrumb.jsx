import React from 'react'
import upIcon from '../assets/images/up.png'

// Breadcrumb strip (AGENTS_TO_DO.md, 2026-08-01 discussion) - modeled on
// sevenstime-backoffice's web-interface/src/views/base-elements/
// Categories.js: the up-arrow image (copied verbatim, same asset) plus a
// "Root / Cat1 / Cat2" clickable path. Unlike that reference, this is
// read-only navigation only - no add/edit/delete category forms, since
// the Library Catalog's categories are managed by moving folders in git,
// not through this UI.
/**
 * `trail` - [{id, name}] from the root down to the open level (empty - the
 * root); `onNavigate(id | null)`. Shared by the Library and Service ->
 * Config -> Dashboard (2026-10-16); `rootLabel` - the root's name.
 */
const UpBreadcrumb = ({ trail, onNavigate, rootLabel = 'Root' }) => (
  <div className="mb-2 d-flex align-items-center">
    <img
      src={upIcon}
      alt="Up"
      onClick={trail.length ? () => onNavigate(trail[trail.length - 2]?.id ?? null) : undefined}
      style={{
        opacity: trail.length ? 1 : 0.4,
        cursor: trail.length ? 'pointer' : 'default',
        width: 20,
        height: 20,
      }}
    />
    <div className="ms-2">
      <a
        href="#"
        className={trail.length ? 'link-primary' : ''}
        onClick={(e) => {
          e.preventDefault()
          onNavigate(null)
        }}
      >
        {rootLabel}
      </a>
      {trail.map((crumb, i) => (
        <span key={crumb.id}>
          {' / '}
          {i === trail.length - 1 ? (
            <span>{crumb.name}</span>
          ) : (
            <a
              href="#"
              className="link-primary"
              onClick={(e) => {
                e.preventDefault()
                onNavigate(crumb.id)
              }}
            >
              {crumb.name}
            </a>
          )}
        </span>
      ))}
    </div>
  </div>
)

export default UpBreadcrumb
