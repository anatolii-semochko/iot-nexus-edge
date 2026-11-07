/**
 * AppHeader Component
 *
 * Main application header with theme switcher and user menu.
 * Features include:
 * - Sidebar toggle button
 * - Theme switcher (light/dark/auto)
 * - User dropdown menu
 * - Breadcrumb navigation
 * - Sticky positioning with scroll shadow effect
 *
 * @component
 * @example
 * return (
 *   <AppHeader />
 * )
 */

import { useHideSimulation } from '../presentation'
import React, { useEffect, useRef } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { useMenu } from './useMenu'
import { Link } from 'react-router-dom'
import BrandMark from './BrandMark'
import { HOME_HOST, homeUrl } from '../homeSite'
import { PROJECT_NAME } from '../projectName'
import { MESSAGES_PAGE, pageShown } from '../access'
import {
  CBadge,
  CContainer,
  CDropdown,
  CDropdownItem,
  CDropdownMenu,
  CDropdownToggle,
  CHeader,
  CHeaderNav,
  CHeaderToggler,
  useColorModes,
} from '@coreui/react'
import CIcon from '@coreui/icons-react'
import { cilContrast, cilMenu, cilMoon, cilSun } from '@coreui/icons'

import { useAnyNodeSimulated } from '../api/useLiveNode'
import { IS_PRODUCTION } from '../appEnv'
import { AppHeaderDropdown } from './header/index'
import NotificationCenter from './header/NotificationCenter'
import SystemTickIndicator from './header/SystemTickIndicator'
import LanguageSelector from './header/LanguageSelector'
import { useTranslation } from 'react-i18next'

/**
 * AppHeader functional component
 *
 * Manages header UI including:
 * - Redux integration for sidebar state
 * - Theme management with CoreUI useColorModes hook
 * - Scroll-based shadow effect
 * - Responsive navigation
 *
 * @returns {React.ReactElement} Header component with navigation and controls
 */
const AppHeader = ({ bleed = false }) => {
  const headerRef = useRef()
  const { colorMode, setColorMode } = useColorModes('coreui-free-react-admin-template-theme')
  const { t, i18n } = useTranslation()

  const dispatch = useDispatch()
  const sidebarShow = useSelector((state) => state.sidebarShow)
  const anyNodeSimulated = useAnyNodeSimulated()
  const hideSimulation = useHideSimulation()
  // no menu (only the Dashboard) - no menu button; the messages - when the role shows them
  const { hidden: noMenu } = useMenu()
  const showMessages = pageShown(
    useSelector((state) => state.access),
    MESSAGES_PAGE,
  )

  useEffect(() => {
    const handleScroll = () => {
      headerRef.current &&
        headerRef.current.classList.toggle('shadow-sm', document.documentElement.scrollTop > 0)
    }

    document.addEventListener('scroll', handleScroll)
    return () => document.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <CHeader position="sticky" className={`${bleed ? '' : 'mb-4 '}p-0`} ref={headerRef}>
      <CContainer className="border-bottom px-2 px-sm-3 px-md-4 app-header-row" fluid>
        {noMenu &&
          // no menu - the brand (else in the sidebar)
          // the project's website when it has one (homeSite.js), else the app's start
          (HOME_HOST ? (
            <a
              href={homeUrl(i18n.resolvedLanguage)}
              title={HOME_HOST}
              className="d-flex align-items-center text-decoration-none text-body fw-semibold"
            >
              <BrandMark size={28} className="me-2" />
              {PROJECT_NAME}
            </a>
          ) : (
            <Link
              to="/"
              className="d-flex align-items-center text-decoration-none text-body fw-semibold"
            >
              <BrandMark size={28} className="me-2" />
              {PROJECT_NAME}
            </Link>
          ))}
        {!noMenu && (
          <CHeaderToggler
            onClick={() => dispatch({ type: 'set', sidebarShow: !sidebarShow })}
            style={{ marginInlineStart: '-14px' }}
          >
            <CIcon icon={cilMenu} size="lg" />
          </CHeaderToggler>
        )}
        <CHeaderNav className="ms-auto">
          {anyNodeSimulated && !hideSimulation && (
            <li className="nav-item d-flex align-items-center py-1 me-1 me-sm-3">
              {/* Blinks only in production, where a node left in
                  simulation is an operational problem worth attention;
                  in development simulation is the normal working state,
                  so the badge is shown steady (AGENTS_TO_DO.md
                  2026-09-25). */}
              <CBadge
                color="primary"
                className={`${IS_PRODUCTION ? 'wem-blink-ring ' : ''}rounded-pill px-2 px-sm-3 py-2 me-sm-2`}
                role="status"
                title={t('At least one node is in simulation mode')}
              >
                {/* a phone's header has no room for a word - a dot (its title and the hidden text say it) */}
                <span className="d-none d-sm-inline">{t('Simulation')}</span>
                <span className="d-sm-none visually-hidden">{t('Simulation')}</span>
              </CBadge>
            </li>
          )}
          {/* a phone - left out: the header fits one row with the menu button (2026-11-07) */}
          <li className="nav-item d-none d-sm-flex align-items-center py-1 me-2 me-sm-3">
            <SystemTickIndicator />
          </li>
          {showMessages && (
            <li className="nav-item d-flex align-items-center py-1">
              <NotificationCenter />
            </li>
          )}
          <li className="nav-item py-1 d-none d-sm-block">
            <div className="vr h-100 mx-2 text-body text-opacity-75"></div>
          </li>
          <LanguageSelector />
          {/* a phone - in the user's menu (AppHeaderDropdown.jsx) */}
          <CDropdown variant="nav-item" placement="bottom-end" className="d-none d-sm-block">
            <CDropdownToggle caret={false}>
              {colorMode === 'dark' ? (
                <CIcon icon={cilMoon} size="lg" />
              ) : colorMode === 'auto' ? (
                <CIcon icon={cilContrast} size="lg" />
              ) : (
                <CIcon icon={cilSun} size="lg" />
              )}
            </CDropdownToggle>
            <CDropdownMenu>
              <CDropdownItem
                active={colorMode === 'light'}
                className="d-flex align-items-center"
                as="button"
                type="button"
                onClick={() => setColorMode('light')}
              >
                <CIcon className="me-2" icon={cilSun} size="lg" /> {t('Light')}
              </CDropdownItem>
              <CDropdownItem
                active={colorMode === 'dark'}
                className="d-flex align-items-center"
                as="button"
                type="button"
                onClick={() => setColorMode('dark')}
              >
                <CIcon className="me-2" icon={cilMoon} size="lg" /> {t('Dark')}
              </CDropdownItem>
              <CDropdownItem
                active={colorMode === 'auto'}
                className="d-flex align-items-center"
                as="button"
                type="button"
                onClick={() => setColorMode('auto')}
              >
                <CIcon className="me-2" icon={cilContrast} size="lg" /> {t('Auto')}
              </CDropdownItem>
            </CDropdownMenu>
          </CDropdown>
          <li className="nav-item py-1 d-none d-sm-block">
            <div className="vr h-100 mx-2 text-body text-opacity-75"></div>
          </li>
          <AppHeaderDropdown />
        </CHeaderNav>
      </CContainer>
    </CHeader>
  )
}

export default AppHeader
