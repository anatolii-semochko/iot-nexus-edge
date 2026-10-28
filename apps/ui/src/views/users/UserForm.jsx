import React, { useEffect, useRef, useState } from 'react'
import {
  CAlert,
  CAvatar,
  CButton,
  CCol,
  CForm,
  CFormCheck,
  CFormInput,
  CFormLabel,
  CModal,
  CModalBody,
  CModalFooter,
  CModalHeader,
  CModalTitle,
  CRow,
  CSpinner,
} from '@coreui/react'
import CIcon from '@coreui/icons-react'
import { cilCheck, cilX } from '@coreui/icons'
import { api } from '../../api/client'
import SearchChecklist from '../../components/SearchChecklist'
import { AiTokensInput, parseAiTokens } from './AiTokens'

const AVATAR_SIZE = '4rem'

/**
 * Create/edit modal (AGENTS.md section 13). Roles - the ones the person
 * acts as (one at a time - the header's menu; what each allows - Users ->
 * Roles; 2026-10-27). A new person starts as a viewer. The AI's tokens a day (AiTokens.jsx). An internal service's
 * account (orchestrator, simulator, AI agent - the role `system`) and the
 * guest sign in with no password; a service's access is fixed.
 *
 * The avatar field is deliberately NOT wired to live PUT/DELETE calls on
 * every change - it used to upload/remove immediately, which meant
 * clicking Cancel after picking a new photo (or removing one) left the
 * server-side change in place with nothing to undo it. `avatarFile`/
 * `avatarRemoved` below are pure local form state; the actual
 * upload/delete only happens inside handleSubmit, alongside everything
 * else Save does. This also means a brand-new user (no id yet) can now
 * have an avatar picked before it exists - the upload just waits for
 * `createUser`'s response to hand back the new id.
 */
const UserForm = ({ user, roles, onClose, onSaved }) => {
  const isEdit = Boolean(user)
  const [username, setUsername] = useState(user?.username ?? '')
  const [displayName, setDisplayName] = useState(user?.display_name ?? '')
  const [email, setEmail] = useState(user?.email ?? '')
  const [password, setPassword] = useState('')
  const [roleKeys, setRoleKeys] = useState(user?.roleKeys ?? ['viewer'])
  const [active, setActive] = useState(user?.active ?? true)
  const [aiTokens, setAiTokens] = useState(user?.ai_daily_tokens ?? '')
  const service = Boolean(user?.service)
  const noPassword = service || Boolean(user?.guest)
  const [avatarFile, setAvatarFile] = useState(null)
  const [avatarObjectUrl, setAvatarObjectUrl] = useState(null)
  const [avatarRemoved, setAvatarRemoved] = useState(false)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const fileInputRef = useRef(null)

  const canDeactivate = user?.deactivatable ?? true

  const existingAvatarUrl = user?.avatar_path ? `/api/uploads/avatars/${user.avatar_path}` : null
  const avatarPreviewUrl = avatarFile ? avatarObjectUrl : avatarRemoved ? null : existingAvatarUrl

  // The object URL is only ever needed while `avatarFile` is set - revoke
  // whatever the previous one was whenever a new file replaces it or the
  // form unmounts, so we don't leak blob: URLs.
  useEffect(() => {
    return () => {
      if (avatarObjectUrl) URL.revokeObjectURL(avatarObjectUrl)
    }
  }, [avatarObjectUrl])

  const handleAvatarFileChange = (e) => {
    const file = e.target.files[0]
    if (!file) return
    if (avatarObjectUrl) URL.revokeObjectURL(avatarObjectUrl)
    setAvatarFile(file)
    setAvatarObjectUrl(URL.createObjectURL(file))
    setAvatarRemoved(false)
  }

  const handleRemoveAvatarLocal = () => {
    if (avatarObjectUrl) URL.revokeObjectURL(avatarObjectUrl)
    setAvatarFile(null)
    setAvatarObjectUrl(null)
    setAvatarRemoved(true)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const aiDailyTokens = parseAiTokens(aiTokens)
    if (aiDailyTokens === undefined) return setError('AI tokens a day: empty, 0 or a whole number')
    setBusy(true)
    setError(null)
    try {
      let userId = user?.id
      if (isEdit) {
        const body = { display_name: displayName, email, active, ai_daily_tokens: aiDailyTokens }
        if (password) body.password = password
        await api.updateUser(user.id, body)
      } else {
        const created = await api.createUser({
          username,
          password,
          display_name: displayName,
          email,
          active,
          ai_daily_tokens: aiDailyTokens,
        })
        userId = created.id
      }
      if (!service) await api.setUserRoles(userId, roleKeys)

      if (avatarFile) {
        await api.uploadAvatar(userId, avatarFile)
      } else if (avatarRemoved) {
        await api.deleteAvatar(userId)
      }

      onSaved()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <CModal visible onClose={onClose}>
      <CModalHeader>
        <CModalTitle>{isEdit ? `Edit ${user.username}` : 'Add user'}</CModalTitle>
      </CModalHeader>
      <CForm onSubmit={handleSubmit}>
        <CModalBody>
          {error && <CAlert color="danger">{error}</CAlert>}
          <CRow className="mb-3">
            <CCol>
              <CFormLabel>Username</CFormLabel>
              <CFormInput
                value={username}
                disabled={isEdit}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </CCol>
          </CRow>
          <CRow className="mb-3">
            <CCol>
              <CFormLabel>Display name</CFormLabel>
              <CFormInput value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            </CCol>
          </CRow>
          <CRow className="mb-3">
            <CCol>
              <CFormLabel>Email</CFormLabel>
              <CFormInput type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </CCol>
          </CRow>
          {!noPassword && (
            <CRow className="mb-3">
              <CCol>
                <CFormLabel>
                  {isEdit ? 'New password (leave blank to keep current)' : 'Password'}
                </CFormLabel>
                <CFormInput
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required={!isEdit}
                />
              </CCol>
            </CRow>
          )}
          <div className="mb-3">
            <CFormLabel>Roles</CFormLabel>
            {service ? (
              <div className="small text-body-secondary">
                {roleKeys.map((k) => roles.find((r) => r.key === k)?.name ?? k).join(', ')} - an
                internal service&apos;s account, fixed.
              </div>
            ) : (
              <SearchChecklist
                id="user-roles"
                items={roles
                  .filter((r) => !r.service)
                  .map((r) => ({ key: r.key, label: r.name, detail: r.key }))}
                selected={roleKeys}
                onToggle={(k) =>
                  setRoleKeys((ks) => (ks.includes(k) ? ks.filter((x) => x !== k) : [...ks, k]))
                }
                disabled={busy}
                maxHeight="10rem"
              />
            )}
            <div className="form-text">
              Several - the person switches between them in the menu; none - signs in, sees nothing.
            </div>
          </div>
          <CRow className="mb-3">
            <CCol sm={6}>
              <AiTokensInput
                id="user-ai-tokens"
                value={aiTokens}
                onChange={setAiTokens}
                disabled={busy}
              />
            </CCol>
          </CRow>
          <CRow className="mb-3">
            <CCol>
              <CFormCheck
                label="Active"
                checked={active}
                disabled={!canDeactivate}
                onChange={(e) => setActive(e.target.checked)}
              />
              {!canDeactivate && (
                <div className="form-text">This account can never be deactivated.</div>
              )}
            </CCol>
          </CRow>
          <CRow className="mb-3">
            <CCol>
              <CFormLabel>Avatar</CFormLabel>
              <div className="d-flex align-items-center gap-3">
                <div
                  className="position-relative"
                  style={{ width: AVATAR_SIZE, height: AVATAR_SIZE }}
                >
                  {avatarPreviewUrl ? (
                    <CAvatar
                      src={avatarPreviewUrl}
                      style={{ width: AVATAR_SIZE, height: AVATAR_SIZE }}
                    />
                  ) : (
                    <CAvatar
                      color="secondary"
                      textColor="white"
                      style={{ width: AVATAR_SIZE, height: AVATAR_SIZE }}
                    >
                      {(displayName || username)[0]?.toUpperCase()}
                    </CAvatar>
                  )}
                  {/* Account active/inactive flag, not an action - the
                      corner badge used to be a "remove avatar" button,
                      which is now a plain text button below instead. */}
                  <CAvatar
                    color={active ? 'success' : 'danger'}
                    textColor="white"
                    className="position-absolute p-0 d-flex align-items-center justify-content-center"
                    style={{
                      width: '1.25rem',
                      height: '1.25rem',
                      top: '-0.25rem',
                      right: '-0.25rem',
                    }}
                  >
                    <CIcon icon={active ? cilCheck : cilX} size="sm" />
                  </CAvatar>
                </div>
                <div>
                  <CFormInput
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={handleAvatarFileChange}
                    ref={fileInputRef}
                  />
                  {avatarPreviewUrl && (
                    <CButton
                      size="sm"
                      color="danger"
                      variant="ghost"
                      className="mt-1 p-0"
                      onClick={handleRemoveAvatarLocal}
                    >
                      Remove avatar
                    </CButton>
                  )}
                  <div className="form-text">Applied when you Save.</div>
                </div>
              </div>
            </CCol>
          </CRow>
        </CModalBody>
        <CModalFooter>
          <CButton color="secondary" variant="outline" onClick={onClose}>
            Cancel
          </CButton>
          <CButton type="submit" color="primary" disabled={busy}>
            {busy ? <CSpinner size="sm" /> : 'Save'}
          </CButton>
        </CModalFooter>
      </CForm>
    </CModal>
  )
}

export default UserForm
