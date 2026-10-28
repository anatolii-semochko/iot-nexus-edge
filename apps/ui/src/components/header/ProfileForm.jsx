import React, { useEffect, useRef, useState } from 'react'
import {
  CAlert,
  CAvatar,
  CButton,
  CForm,
  CFormInput,
  CFormLabel,
  CFormText,
  CModal,
  CModalBody,
  CModalFooter,
  CModalHeader,
  CModalTitle,
  CSpinner,
} from '@coreui/react'
import { api } from '../../api/client'
import { userInitials } from '../../utils/format'

const AVATAR_SIZE = '4rem'

/**
 * The person's own profile (2026-10-28 - the user menu's "Profile"; api routes/users.ts profileRoutes): the
 * username (fixed), the display name, the email, the avatar and a new password - with the current one (a
 * tab left open must not let another change it; their other sessions end). The avatar - applied on Save,
 * as in the admin's form. `onSaved(profile)` - the header shows the new name / avatar at once.
 */
const ProfileForm = ({ onClose, onSaved }) => {
  const [profile, setProfile] = useState(null)
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [avatarFile, setAvatarFile] = useState(null)
  const [avatarUrl, setAvatarUrl] = useState(null)
  const [avatarRemoved, setAvatarRemoved] = useState(false)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const fileInput = useRef(null)

  useEffect(() => {
    api
      .getProfile()
      .then((p) => {
        setProfile(p)
        setDisplayName(p.display_name ?? '')
        setEmail(p.email ?? '')
      })
      .catch((err) => setError(err.message))
  }, [])
  // the picked file's preview - released when replaced or closed
  useEffect(() => () => avatarUrl && URL.revokeObjectURL(avatarUrl), [avatarUrl])

  const existing = profile?.avatar_path ? `/api/uploads/avatars/${profile.avatar_path}` : null
  const preview = avatarFile ? avatarUrl : avatarRemoved ? null : existing
  const passwordProblem =
    password && password !== repeat
      ? 'The new password and its repeat differ.'
      : password && !currentPassword
        ? 'Enter your current password to set a new one.'
        : null

  const pick = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setAvatarFile(file)
    setAvatarUrl(URL.createObjectURL(file))
    setAvatarRemoved(false)
  }
  const removeLocal = () => {
    setAvatarFile(null)
    setAvatarUrl(null)
    setAvatarRemoved(true)
    if (fileInput.current) fileInput.current.value = ''
  }

  const save = async (e) => {
    e.preventDefault()
    if (passwordProblem) return setError(passwordProblem)
    setBusy(true)
    setError(null)
    try {
      const body = { display_name: displayName, email }
      if (password) Object.assign(body, { password, current_password: currentPassword })
      let saved = await api.updateProfile(body)
      if (avatarFile) {
        const out = await api.uploadProfileAvatar(avatarFile)
        saved = { ...saved, avatar_path: out.avatar_path }
      } else if (avatarRemoved && existing) {
        await api.deleteProfileAvatar()
        saved = { ...saved, avatar_path: null }
      }
      onSaved(saved)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <CModal visible onClose={onClose}>
      <CModalHeader>
        <CModalTitle>Profile</CModalTitle>
      </CModalHeader>
      <CForm onSubmit={save}>
        <CModalBody>
          {error && <CAlert color="danger">{error}</CAlert>}
          {!profile ? (
            !error && <CSpinner size="sm" />
          ) : (
            <>
              <div className="d-flex align-items-center gap-3 mb-3">
                {preview ? (
                  <CAvatar src={preview} style={{ width: AVATAR_SIZE, height: AVATAR_SIZE }} />
                ) : (
                  <CAvatar
                    color="secondary"
                    textColor="white"
                    style={{ width: AVATAR_SIZE, height: AVATAR_SIZE }}
                  >
                    {userInitials({
                      display_name: displayName || null,
                      username: profile.username,
                    })}
                  </CAvatar>
                )}
                <div>
                  <CFormInput
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    aria-label="Avatar"
                    onChange={pick}
                    ref={fileInput}
                  />
                  {preview && (
                    <CButton
                      size="sm"
                      color="danger"
                      variant="ghost"
                      className="mt-1 p-0"
                      onClick={removeLocal}
                    >
                      Remove avatar
                    </CButton>
                  )}
                  <CFormText>Applied when you Save.</CFormText>
                </div>
              </div>
              <div className="mb-3">
                <CFormLabel htmlFor="profile-username">Username</CFormLabel>
                <CFormInput id="profile-username" value={profile.username} disabled />
              </div>
              <div className="mb-3">
                <CFormLabel htmlFor="profile-name">Display name</CFormLabel>
                <CFormInput
                  id="profile-name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                />
              </div>
              <div className="mb-3">
                <CFormLabel htmlFor="profile-email">Email</CFormLabel>
                <CFormInput
                  id="profile-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="mb-2">
                <CFormLabel htmlFor="profile-password">New password</CFormLabel>
                <CFormInput
                  id="profile-password"
                  type="password"
                  autoComplete="new-password"
                  placeholder="Leave blank to keep the current one"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              {/* only with a new password typed - the rest of the form doesn't need them */}
              {password && (
                <>
                  <div className="mb-2">
                    <CFormLabel htmlFor="profile-repeat">Repeat the new password</CFormLabel>
                    <CFormInput
                      id="profile-repeat"
                      type="password"
                      autoComplete="new-password"
                      value={repeat}
                      onChange={(e) => setRepeat(e.target.value)}
                    />
                  </div>
                  <div className="mb-2">
                    <CFormLabel htmlFor="profile-current">Current password</CFormLabel>
                    <CFormInput
                      id="profile-current"
                      type="password"
                      autoComplete="current-password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                    />
                    <CFormText>Your other sessions end with a new password.</CFormText>
                  </div>
                </>
              )}
            </>
          )}
        </CModalBody>
        <CModalFooter>
          <CButton color="secondary" variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </CButton>
          <CButton type="submit" color="primary" disabled={busy || !profile}>
            {busy ? <CSpinner size="sm" /> : 'Save'}
          </CButton>
        </CModalFooter>
      </CForm>
    </CModal>
  )
}

export default ProfileForm
