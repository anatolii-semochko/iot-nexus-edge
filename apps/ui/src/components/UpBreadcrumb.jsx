import React from 'react'
import { CBreadcrumb, CBreadcrumbItem } from '@coreui/react'
import upIcon from '../assets/images/up.png'
import { t } from 'src/i18n'

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
const UpBreadcrumb = ({ trail, onNavigate, rootLabel = t('Root') }) => {
  // the path as the Dashboard's breadcrumbs (the user, 2026-10-31): semibold, links without underline,
  // the open level not a link
  const crumbs = [{ id: null, name: rootLabel }, ...trail]
  return (
    <div className="mb-2 d-flex align-items-center">
      <img
        src={upIcon}
        alt={t('Up')}
        onClick={trail.length ? () => onNavigate(trail[trail.length - 2]?.id ?? null) : undefined}
        style={{
          opacity: trail.length ? 1 : 0.4,
          cursor: trail.length ? 'pointer' : 'default',
          width: 20,
          height: 20,
        }}
      />
      <CBreadcrumb className="mb-0 ms-2 fw-semibold">
        {crumbs.map((crumb, i) =>
          i === crumbs.length - 1 ? (
            <CBreadcrumbItem key={crumb.id ?? 'root'} active>
              {crumb.name}
            </CBreadcrumbItem>
          ) : (
            <CBreadcrumbItem key={crumb.id ?? 'root'}>
              <a
                href="#"
                className="link-primary text-decoration-none"
                onClick={(e) => {
                  e.preventDefault()
                  onNavigate(crumb.id)
                }}
              >
                {crumb.name}
              </a>
            </CBreadcrumbItem>
          ),
        )}
      </CBreadcrumb>
    </div>
  )
}

export default UpBreadcrumb
