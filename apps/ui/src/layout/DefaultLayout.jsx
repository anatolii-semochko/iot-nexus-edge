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

import React, { useState } from 'react'
import { matchPath, useLocation } from 'react-router-dom'
import { AppContent, AppSidebar, AppFooter, AppHeader } from '../components/index'
import { AiPanelProvider } from '../components/ai/AiPanel'
import { routes } from '../routes'
import { useScrollRestoration } from '../hooks/useScrollRestoration'

/**
 * DefaultLayout functional component
 *
 * Renders the main application layout - an application shell (2026-11-09): the window's height, the
 * header in it as an ordinary block, under it the one area that scrolls (the page's content and the
 * footer). The header never takes part in a scroll - a sticky header was put back in place a frame after
 * the compositor scrolled the page and shook on a phone. The sidebar - fixed, beside it.
 *
 * A route marked `bleed` (routes.js - the AI Assistant, 2026-10-24) takes the whole room under the
 * header: no side or bottom padding, no footer, exactly the window's height (its own parts scroll).
 * The AI Assistant's side panel (components/ai/AiPanel) is open to every page under it. Scroll
 * restoration - hooks/useScrollRestoration.js (the scrolling element is not the window).
 *
 * @returns {React.ReactElement} Complete application layout
 */
const DefaultLayout = () => {
  const { pathname } = useLocation()
  const bleed = routes.some((r) => r.bleed && matchPath({ path: r.path, end: true }, pathname))
  // the scrolling area - the header's shadow follows it; a new page starts at its top, Back returns
  const [scroller, setScroller] = useState(null)
  useScrollRestoration(scroller)
  return (
    <AiPanelProvider>
      <AppSidebar />
      <div className="wrapper app-shell d-flex flex-column">
        <AppHeader bleed={bleed} scroller={scroller} />
        <div ref={setScroller} className={`app-scroll${bleed ? ' is-bleed' : ''}`}>
          <div
            className={`body flex-grow-1${bleed ? ' d-flex flex-column' : ''}`}
            style={bleed ? { minHeight: 0 } : undefined}
          >
            <AppContent bleed={bleed} />
          </div>
          {!bleed && <AppFooter />}
        </div>
      </div>
    </AiPanelProvider>
  )
}

export default DefaultLayout
