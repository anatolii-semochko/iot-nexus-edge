/**
 * DefaultLayout Component
 *
 * Main application layout wrapper that composes the primary UI structure
 * for authenticated/protected routes.
 *
 * Layout structure:
 * - AppSidebar: Collapsible navigation sidebar
 * - AppHeader: Top navigation bar with user menu and theme switcher
 * - AppContent: Main content area with route rendering
 * - AppFooter: Footer with links and copyright
 *
 * This layout is used for all routes defined in routes.js, providing
 * a consistent structure across the application.
 *
 * @component
 * @example
 * // Used in App.js for protected routes
 * <Route path="*" element={<DefaultLayout />} />
 */

import React from 'react'
import { matchPath, useLocation } from 'react-router-dom'
import { AppContent, AppSidebar, AppFooter, AppHeader } from '../components/index'
import { AiPanelProvider } from '../components/ai/AiPanel'
import { routes } from '../routes'

/**
 * DefaultLayout functional component
 *
 * Renders the main application layout with:
 * - Fixed sidebar navigation
 * - Sticky header
 * - Flexible content area
 * - Footer at bottom
 *
 * A route marked `bleed` (routes.js - the AI Assistant, 2026-10-24) takes the whole room under the
 * header: no side or bottom padding, no footer, exactly the window's height (its own parts scroll).
 * The AI Assistant's side panel (components/ai/AiPanel) is open to every page under it.
 *
 * @returns {React.ReactElement} Complete application layout
 */
const DefaultLayout = () => {
  const { pathname } = useLocation()
  const bleed = routes.some((r) => r.bleed && matchPath({ path: r.path, end: true }, pathname))
  return (
    <AiPanelProvider>
      <AppSidebar />
      <div className={`wrapper d-flex flex-column ${bleed ? 'vh-100' : 'min-vh-100'}`}>
        <AppHeader bleed={bleed} />
        <div
          className={`body flex-grow-1${bleed ? ' d-flex flex-column' : ''}`}
          style={bleed ? { minHeight: 0 } : undefined}
        >
          <AppContent bleed={bleed} />
        </div>
        {!bleed && <AppFooter />}
      </div>
    </AiPanelProvider>
  )
}

export default DefaultLayout
