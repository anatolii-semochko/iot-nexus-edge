/**
 * AppContent Component
 *
 * Main content area that renders routes defined in routes.js.
 * Handles lazy loading with Suspense and provides a loading spinner
 * while components are being loaded.
 *
 * Features:
 * - Dynamic route rendering from routes configuration
 * - Suspense boundary for lazy-loaded components
 * - Automatic redirect from root to dashboard
 * - Loading spinner fallback during component load
 *
 * @component
 * @example
 * return (
 *   <AppContent />
 * )
 */

import React, { Suspense } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useSelector } from 'react-redux'
import { CAlert, CContainer, CSpinner } from '@coreui/react'
import { canOpen } from '../access'
import { isSwitchLanding } from '../roleSwitch'
import { useMenu } from './useMenu'

// routes config
import { routes } from '../routes'

/**
 * AppContent functional component
 *
 * Renders all application routes within a container with:
 * - Suspense for lazy-loaded route components
 * - Spinner shown during component loading
 * - Default redirect to dashboard
 *
 * Memoized to prevent unnecessary re-renders when parent updates.
 *
 * @returns {React.ReactElement} Content container with routed views
 */
// a section the person can't open (access.js) - said, not a broken page
const NoAccess = () => (
  <CAlert color="warning" className="mt-3">
    You don&apos;t have access to this section. Ask an administrator if you need it.
  </CAlert>
)

// `bleed` - the page takes the whole room (DefaultLayout): no padding, the full height
const AppContent = ({ bleed = false }) => {
  const access = useSelector((state) => state.access)
  // right after a role switch the page it was on - if the new role doesn't open it, its first page
  // instead (roleSwitch.js); only that one page, only that once
  const { pathname } = useLocation()
  const firstPage = useMenu().items.find((item) => item.to)?.to ?? '/dashboard'
  const closed = (path) =>
    isSwitchLanding(pathname) && firstPage !== path ? (
      <Navigate to={firstPage} replace />
    ) : (
      <NoAccess />
    )
  return (
    <CContainer className={bleed ? 'px-0 page-content page-bleed' : 'px-4 page-content'} lg>
      <Suspense fallback={<CSpinner color="primary" />}>
        <Routes>
          {routes.map((route, idx) => {
            return (
              route.element && (
                <Route
                  key={idx}
                  path={route.path}
                  exact={route.exact}
                  name={route.name}
                  element={canOpen(access, route.path) ? <route.element /> : closed(route.path)}
                />
              )
            )
          })}
          <Route path="/" element={<Navigate to="dashboard" replace />} />
        </Routes>
      </Suspense>
    </CContainer>
  )
}

export default React.memo(AppContent)
