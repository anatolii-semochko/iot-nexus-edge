import React from 'react'
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
} from '@coreui/react'
import { cilAccountLogout, cilCheckAlt, cilLockLocked } from '@coreui/icons'
import CIcon from '@coreui/icons-react'
import { userInitials, userTitle } from '../../utils/format'
import { api } from '../../api/client'
import { markRoleSwitch } from '../../roleSwitch'

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
  const dispatch = useDispatch()
  const navigate = useNavigate()

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
        accessContext: null,
        guest: false,
      })
      navigate(guestEnabled ? '/' : '/login')
    }
  }

  return (
    <CDropdown variant="nav-item">
      <CDropdownToggle placement="bottom-end" className="py-0 pe-0" caret={false}>
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
            <div className="px-3 pb-1 small text-body-secondary">Act as</div>
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
        <CDropdownItem onClick={handleLogout} style={{ cursor: 'pointer' }}>
          <CIcon icon={guest ? cilAccountLogout : cilLockLocked} className="me-2" />
          {guest ? 'Sign in' : 'Logout'}
        </CDropdownItem>
      </CDropdownMenu>
    </CDropdown>
  )
}

export default AppHeaderDropdown
