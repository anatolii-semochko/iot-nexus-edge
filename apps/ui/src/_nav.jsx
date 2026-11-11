/**
 * Sidebar Navigation Configuration
 *
 * Defines the structure and content of the sidebar navigation menu.
 * Supports multiple navigation component types from CoreUI React:
 * - CNavItem: Single navigation link
 * - CNavGroup: Collapsible group of links
 * - CNavTitle: Section title/divider
 *
 * @module _nav
 */

import React from 'react'
import CIcon from '@coreui/icons-react'
import {
  cilBell,
  cilBug,
  cilCog,
  cilDescription,
  cilDevices,
  cilHistory,
  cilLibrary,
  cilPeople,
  cilSettings,
  cilSitemap,
  cilSpeedometer,
} from '@coreui/icons'
import { CNavItem, CNavTitle } from '@coreui/react'
import AiBrainIcon from './components/AiBrainIcon'
import { tKey } from './i18n'

/**
 * Navigation menu structure array
 *
 * @type {Array<Object>}
 * @property {React.ComponentType} component - CoreUI nav component (CNavItem, CNavGroup, CNavTitle)
 * @property {string} name - Display text for the nav item
 * @property {string} [to] - Internal route path (for CNavItem with routing)
 * @property {React.ReactNode} [icon] - Icon element to display
 * Who sees an entry - by its route's permissions (access.js SECTION_PERMISSIONS, AppSidebar.jsx).
 */
const _nav = [
  {
    component: CNavItem,
    name: tKey('Dashboard'),
    to: '/dashboard',
    icon: <CIcon icon={cilSpeedometer} customClassName="nav-icon" />,
  },
  {
    component: CNavItem,
    name: tKey('AI Assistant'),
    to: '/ai-assistant',
    // the AI's mark (components/AiBrainIcon.jsx) - still in the menu (it turns everywhere else)
    icon: <AiBrainIcon size={20} className="nav-icon" still />,
  },
  {
    component: CNavTitle,
    name: tKey('Devices'),
  },
  {
    component: CNavItem,
    name: tKey('Nodes'),
    to: '/nodes',
    icon: <CIcon icon={cilSitemap} customClassName="nav-icon" />,
  },
  {
    component: CNavItem,
    name: tKey('Devices'),
    to: '/devices',
    icon: <CIcon icon={cilDevices} customClassName="nav-icon" />,
  },
  {
    component: CNavItem,
    name: tKey('Simulator'),
    to: '/simulator',
    icon: <CIcon icon={cilBug} customClassName="nav-icon" />,
  },
  {
    component: CNavTitle,
    name: tKey('Orchestration'),
  },
  {
    component: CNavItem,
    name: tKey('Processes'),
    to: '/processes',
    icon: <CIcon icon={cilSettings} customClassName="nav-icon" />,
  },
  {
    component: CNavTitle,
    name: tKey('Logs'),
  },
  {
    component: CNavItem,
    name: tKey('Live Events'),
    to: '/live-events',
    icon: <CIcon icon={cilBell} customClassName="nav-icon" />,
  },
  {
    component: CNavItem,
    name: tKey('Logs'),
    to: '/logs',
    icon: <CIcon icon={cilHistory} customClassName="nav-icon" />,
  },
  {
    component: CNavTitle,
    name: tKey('Settings'),
  },
  {
    component: CNavItem,
    name: tKey('Service'),
    to: '/service',
    icon: <CIcon icon={cilCog} customClassName="nav-icon" />,
    // Filtered out for non-admins in AppSidebar.jsx (AGENTS.md section 13) -
    // the server-side requireAdmin hook on its own routes is the real
    // guard (same pattern as Users below) - this Commands tab can shut
    // down or restart the host.
  },
  {
    component: CNavItem,
    name: tKey('Users'),
    to: '/users',
    icon: <CIcon icon={cilPeople} customClassName="nav-icon" />,
    // Filtered out for non-admins in AppSidebar.jsx (AGENTS.md section 13) -
    // the server-side 403 on /users is the real guard, this just avoids
    // showing a link that would fail for most signed-in users.
  },
  {
    component: CNavItem,
    name: tKey('Library'),
    to: '/library',
    icon: <CIcon icon={cilLibrary} customClassName="nav-icon" />,
  },
  {
    component: CNavItem,
    name: tKey('Docs'),
    to: '/docs',
    icon: <CIcon icon={cilDescription} customClassName="nav-icon" />,
  },
]

export default _nav
