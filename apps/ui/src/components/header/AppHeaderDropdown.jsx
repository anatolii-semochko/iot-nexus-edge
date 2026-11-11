import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import {
  CAvatar,
  CDropdown,
  CDropdownDivider,
  CDropdownHeader,
  CDropdownItem,
  CDropdownMenu,
  CDropdownToggle,
  useColorModes,
} from '@coreui/react'
import {
  cilAccountLogout,
  cilCheckAlt,
  cilContrast,
  cilGlobeAlt,
  cilLockLocked,
  cilMoon,
  cilSun,
  cilUser,
} from '@coreui/icons'
import CIcon from '@coreui/icons-react'
import { userInitials, userTitle } from '../../utils/format'
import { api } from '../../api/client'
import { markRoleSwitch } from '../../roleSwitch'
import { HOME_HOST, homeUrl } from '../../homeSite'
import ProfileForm from './ProfileForm'
import { Flag, useLanguageChoice } from './LanguageSelector'
import { useTranslation } from 'react-i18next'

/**
 * The logged-in-user menu (AGENTS.md section 13). Replaces the CoreUI demo
 * dropdown's fake Updates/Messages/Tasks/Comments/Payments/Projects items -
 * those had nothing to do with a real account menu and would look broken
 * sitting next to a working Logout button.
 */
const AppHeaderDropdown = () => {
  const user = useSelector((state) => state.user)
  // the guest's session (2026-10-27): "Sign in" instead of "Logout"
  const guest = useSelector((state) => state.guest)
  // the roles the person may act in (G1 2026-10-26; roles without groups 2026-10-27): one at a time -
  // the menu, the pages, the processes, the Dashboard and the AI show only what it allows; remembered
  // for the next sign-in
  const contexts = useSelector((state) => state.accessContexts) ?? []
  const context = useSelector((state) => state.accessContext)
  // the role acted in now - shown beside the avatar (the user, 2026-10-31: seen without opening the menu)
  const contextName = useSelector((state) => state.accessContextName)
  const { t, i18n } = useTranslation()
  const dispatch = useDispatch()
  // the language and the theme - here on a phone (their own buttons in the header from sm up; the theme's
  // storage key - AppHeader.jsx's)
  const { colorMode, setColorMode } = useColorModes('coreui-free-react-admin-template-theme')
  const { languages, current: currentLanguage, choose: chooseLanguage } = useLanguageChoice()
  const navigate = useNavigate()
  // the person's own profile (2026-10-28) - not the guest's
  const [profileOpen, setProfileOpen] = useState(false)

  if (!user) return null

  const switchTo = async (key) => {
    if (key === context) return
    await api.setAccessContext(key)
    // every list, page and right reloaded in the new role; a page it doesn't open - left (roleSwitch.js)
    markRoleSwitch()
    window.location.reload()
  }

  const handleLogout = async () => {
    // the guest keeps its session until someone signs in (Login.jsx)
    if (guest) return navigate('/login')
    let guestEnabled = false
    try {
      await api.logout()
      // the guest on - back to the Dashboard as the guest (AuthGate starts its session), else the sign-in
      guestEnabled = (await api.getSignInInfo()).guestEnabled
    } finally {
      dispatch({
        type: 'set',
        user: null,
        access: null,
        accessContexts: [],
        accessContextName: null,
        accessContext: null,
        guest: false,
      })
      navigate(guestEnabled ? '/' : '/login')
    }
  }

  return (
    <>
      <CDropdown variant="nav-item">
        <CDropdownToggle
          placement="bottom-end"
          className="py-0 pe-0 d-flex align-items-center"
          caret={false}
        >
          {contextName && (
            <span
              className="d-none d-md-inline small text-body-secondary me-2 text-truncate"
              style={{ maxWidth: '12rem' }}
              title={t('Your role now')}
            >
              {contextName}
            </span>
          )}
          {/* the toggle doesn't pass a title on - the avatar's own wrapper does */}
          <span title={userTitle(user)}>
            {user.avatar_path ? (
              <CAvatar src={`/api/uploads/avatars/${user.avatar_path}`} size="md" />
            ) : (
              <CAvatar color="secondary" textColor="white" size="md">
                {userInitials(user)}
              </CAvatar>
            )}
          </span>
        </CDropdownToggle>
        <CDropdownMenu className="pt-0" placement="bottom-end">
          <CDropdownHeader className="bg-body-secondary fw-semibold mb-2">
            {user.display_name ?? user.username}
          </CDropdownHeader>
          {contexts.length > 1 && (
            <>
              <div className="px-3 pb-1 small text-body-secondary">{t('Act as')}</div>
              {contexts.map((c) => (
                <CDropdownItem
                  key={c.key}
                  onClick={() => switchTo(c.key)}
                  active={c.key === context}
                  style={{ cursor: 'pointer' }}
                >
                  <CIcon
                    icon={cilCheckAlt}
                    className="me-2"
                    style={{ visibility: c.key === context ? 'visible' : 'hidden' }}
                  />
                  {c.name}
                </CDropdownItem>
              ))}
              <CDropdownDivider />
            </>
          )}
          {!guest && (
            <>
              <CDropdownItem onClick={() => setProfileOpen(true)} style={{ cursor: 'pointer' }}>
                <CIcon icon={cilUser} className="me-2" />
                {t('Profile')}
              </CDropdownItem>
              <CDropdownDivider />
            </>
          )}
          {HOME_HOST && (
            <>
              {/* the project's website (homeSite.js) - the way back from the demo on a phone too */}
              <CDropdownItem href={homeUrl(i18n.resolvedLanguage)}>
                <CIcon icon={cilGlobeAlt} className="me-2" />
                {HOME_HOST}
              </CDropdownItem>
              <CDropdownDivider />
            </>
          )}
          <div className="d-sm-none">
            {languages.length > 1 && (
              <>
                <div className="px-3 pb-1 small text-body-secondary">{t('Language')}</div>
                {languages.map((l) => (
                  <CDropdownItem
                    key={l.code}
                    as="button"
                    type="button"
                    lang={l.code}
                    active={l.code === currentLanguage.code}
                    className="d-flex align-items-center gap-2"
                    onClick={() => chooseLanguage(l.code)}
                  >
                    <Flag code={l.code} name={l.name} selected /> {l.name}
                  </CDropdownItem>
                ))}
                <CDropdownDivider />
              </>
            )}
            <div className="px-3 pb-1 small text-body-secondary">{t('Theme')}</div>
            {[
              ['light', cilSun, 'Light'],
              ['dark', cilMoon, 'Dark'],
              ['auto', cilContrast, 'Auto'],
            ].map(([mode, icon, label]) => (
              <CDropdownItem
                key={mode}
                as="button"
                type="button"
                active={colorMode === mode}
                className="d-flex align-items-center"
                onClick={() => setColorMode(mode)}
              >
                <CIcon icon={icon} className="me-2" />
                {t(label)}
              </CDropdownItem>
            ))}
            <CDropdownDivider />
          </div>
          <CDropdownItem onClick={handleLogout} style={{ cursor: 'pointer' }}>
            <CIcon icon={guest ? cilAccountLogout : cilLockLocked} className="me-2" />
            {guest ? t('Sign in') : t('Logout')}
          </CDropdownItem>
        </CDropdownMenu>
      </CDropdown>
      {profileOpen && (
        <ProfileForm
          onClose={() => setProfileOpen(false)}
          onSaved={(p) => {
            setProfileOpen(false)
            dispatch({
              type: 'set',
              user: {
                ...user,
                display_name: p.display_name,
                email: p.email,
                avatar_path: p.avatar_path,
              },
            })
          }}
        />
      )}
    </>
  )
}

export default AppHeaderDropdown
