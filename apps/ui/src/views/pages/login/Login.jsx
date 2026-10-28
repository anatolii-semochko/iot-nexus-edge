import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDispatch } from 'react-redux'
import {
  CAlert,
  CButton,
  CCard,
  CCardBody,
  CCol,
  CContainer,
  CForm,
  CFormInput,
  CInputGroup,
  CInputGroupText,
  CRow,
  CSpinner,
} from '@coreui/react'
import CIcon from '@coreui/icons-react'
import { cilLockLocked, cilUser } from '@coreui/icons'
import { api } from '../../../api/client'
import { accountFromUrl } from '../../../accountLink'
import { PROJECT_NAME } from '../../../projectName'

/**
 * Real login form (AGENTS.md section 13) - no self-registration link (the
 * previous CoreUI demo had one): accounts are admin-managed via the Users
 * page, not created by visitors. With the guest on (Users -> Guest) - "Continue
 * as a guest" back to the application; a `?account=` link's group is kept
 * for the sign-in (accountLink.js).
 */
const Login = () => {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [guestEnabled, setGuestEnabled] = useState(false)
  const dispatch = useDispatch()
  const navigate = useNavigate()

  useEffect(() => {
    api
      .getSignInInfo()
      .then((info) => setGuestEnabled(info.guestEnabled))
      .catch(() => {})
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api.login(username, password, accountFromUrl())
      // the guest's store gone - AuthGate loads the person with their access
      dispatch({
        type: 'set',
        user: null,
        access: null,
        accessContexts: [],
        accessContext: null,
        guest: false,
      })
      navigate('/')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="bg-body-tertiary min-vh-100 d-flex flex-row align-items-center">
      <CContainer>
        <CRow className="justify-content-center">
          <CCol md={6} lg={4}>
            <CCard className="p-4">
              <CCardBody>
                <CForm onSubmit={handleSubmit}>
                  <h1>Login</h1>
                  <p className="text-body-secondary">Sign in to {PROJECT_NAME}</p>
                  {error && <CAlert color="danger">{error}</CAlert>}
                  <CInputGroup className="mb-3">
                    <CInputGroupText>
                      <CIcon icon={cilUser} />
                    </CInputGroupText>
                    <CFormInput
                      placeholder="Username"
                      autoComplete="username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      autoFocus
                    />
                  </CInputGroup>
                  <CInputGroup className="mb-4">
                    <CInputGroupText>
                      <CIcon icon={cilLockLocked} />
                    </CInputGroupText>
                    <CFormInput
                      type="password"
                      placeholder="Password"
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </CInputGroup>
                  <div className="d-flex align-items-center gap-3 flex-wrap">
                    <CButton type="submit" color="primary" className="px-4" disabled={busy}>
                      {busy ? <CSpinner size="sm" /> : 'Login'}
                    </CButton>
                    {guestEnabled && (
                      <CButton color="link" className="px-0" onClick={() => navigate('/')}>
                        Continue as a guest
                      </CButton>
                    )}
                  </div>
                </CForm>
              </CCardBody>
            </CCard>
          </CCol>
        </CRow>
      </CContainer>
    </div>
  )
}

export default Login
