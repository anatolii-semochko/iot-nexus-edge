import React, { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'

import { CSpinner } from '@coreui/react'
import { api } from '../api/client'
import { accountFromUrl, clearAccountFromUrl } from '../accountLink'

/**
 * Wraps the whole authenticated app shell (AGENTS.md section 13 and
 * "Access control"). Loads the person with their access (`/auth/me` - with
 * the guest on, a browser without a session gets a guest session there; a
 * `?account=` link opens a group - accountLink.js). On mount, checks for an
 * existing session (`GET /auth/me` - the httpOnly cookie set at login rides
 * along automatically) so a page refresh doesn't force a re-login; redirects
 * to `/login` if there isn't one. Once `user` is already in the store (set
 * directly by Login.jsx right after a successful login, or already present
 * from an earlier mount), the check is skipped entirely rather than
 * re-verified - not because it's unnecessary, but because Login.jsx already
 * has the freshest possible answer for that case.
 */
const AuthGate = ({ children }) => {
  const user = useSelector((state) => state.user)
  const access = useSelector((state) => state.access)
  const dispatch = useDispatch()
  // the last check found no session (and no guest) - the sign-in page; while a check runs - a spinner
  const [failed, setFailed] = useState(false)

  // checked again whenever the person is gone from the store (a sign-out - with the guest on, the guest's
  // session starts here and the application stays; else the sign-in page)
  const signedOut = !user || !access
  useEffect(() => {
    const account = accountFromUrl()
    if (!signedOut && !account) return
    // the person and what they may do (access.js); `guest` - the guest's session (the menu offers signing in)
    api
      .getCurrentUser(account)
      .then(({ user: currentUser, access: currentAccess, guest, contexts, context }) => {
        if (account) clearAccountFromUrl()
        setFailed(false)
        dispatch({
          type: 'set',
          user: currentUser,
          access: currentAccess,
          // the groups the person may act in and the one now (G1 - the header's menu)
          accessContexts: contexts ?? [],
          accessContext: context ?? null,
          guest: Boolean(guest),
        })
      })
      .catch(() => {
        // No session (never logged in, expired, or logged out elsewhere) -
        // the redirect below handles it, nothing to surface as an error.
        setFailed(true)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedOut])

  if (!user || !access) {
    if (failed) return <Navigate to="/login" replace />
    return (
      <div className="pt-3 text-center">
        <CSpinner color="primary" variant="grow" />
      </div>
    )
  }

  return children
}

export default AuthGate
