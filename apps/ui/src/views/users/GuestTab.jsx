import React, { useEffect, useState } from 'react'
import {
  CAlert,
  CButton,
  CCol,
  CFormInput,
  CFormLabel,
  CFormSelect,
  CFormSwitch,
  CFormText,
  CRow,
  CSpinner,
} from '@coreui/react'
import { api } from '../../api/client'
import { useCan } from '../../access'

/**
 * Users -> Guest (2026-10-27 - api access/guestSettings.ts): the built-in `guest` account. On - a
 * browser without a session opens the application as the guest (its access - the guest's grants and
 * groups, Users / Groups; a group's link name opens it there), "Sign in" in its menu; off - the sign-in
 * page. Its conversations with the assistant: private (each browser its own) or public (every guest
 * reads all, continues their own); kept some days or always; an off-topic question dropped. The AI's
 * tokens a day - the account's (Users -> Edit guest), shared by all guests. The role a new visitor
 * starts in - one of the guest's roles (Users -> Roles - its members). Without users.manage - read only.
 */
const GuestTab = ({ roles = [], users = [] }) => {
  const manage = useCan()('users.manage')
  const [data, setData] = useState(null)
  const [form, setForm] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [saved, setSaved] = useState(false)
  const load = () =>
    api
      .getGuest()
      .then((d) => {
        setData(d)
        setForm({
          ...d.settings,
          retentionDays: d.settings.retentionDays ?? '',
          defaultRole: d.settings.defaultRole ?? '',
        })
      })
      .catch((err) => setError(err.message))
  useEffect(() => {
    load()
  }, [])
  if (!data) return error ? <CAlert color="danger">{error}</CAlert> : <CSpinner size="sm" />
  if (!data.account) return <CAlert color="warning">No guest account (migration 094).</CAlert>

  const run = async (action) => {
    setBusy(true)
    setError(null)
    setSaved(false)
    try {
      await action()
      await load()
      setSaved(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }
  const days = String(form.retentionDays).trim()
  const guestId = users.find((u) => u.guest)?.id
  const guestRoles = roles.filter((x) => x.memberIds.includes(guestId))
  const off = busy || !manage
  const save = () =>
    run(() =>
      api.updateGuestSettings({
        conversations: form.conversations,
        retentionDays: days === '' ? null : Number(days),
        relevantOnly: form.relevantOnly,
        defaultRole: form.defaultRole || null,
      }),
    )

  return (
    <div className="d-flex flex-column gap-4" style={{ maxWidth: '44rem' }}>
      {error && <CAlert color="danger">{error}</CAlert>}
      <div>
        <CFormSwitch
          id="guest-active"
          label={<strong>Guest access on</strong>}
          checked={data.account.active}
          disabled={off}
          onChange={(e) => run(() => api.updateUser(data.account.id, { active: e.target.checked }))}
        />
        <CFormText>
          On - visitors without an account open the application as the guest, with the guest&apos;s
          access (Users -&gt; the guest&apos;s grants, Groups - its groups; a group&apos;s link name
          opens it there) and sign in from the menu. Off - the sign-in page.
        </CFormText>
      </div>
      <div style={{ maxWidth: '24rem' }}>
        <CFormLabel htmlFor="guest-default-role">A new visitor starts as</CFormLabel>
        <CFormSelect
          id="guest-default-role"
          value={form.defaultRole}
          disabled={off}
          onChange={(e) => setForm({ ...form, defaultRole: e.target.value })}
        >
          <option value="">The guest&apos;s most allowing role</option>
          {guestRoles.map((x) => (
            <option key={x.key} value={x.key}>
              {x.name}
            </option>
          ))}
        </CFormSelect>
        <CFormText>
          The guest&apos;s roles - Users -&gt; Roles (their members); a link&apos;s ?account= wins.
          Saved with the button below.
        </CFormText>
      </div>
      <div>
        <h6>The guests&apos; conversations with the assistant</h6>
        <CRow className="g-3">
          <CCol sm={5}>
            <CFormLabel htmlFor="guest-conversations">Who reads them</CFormLabel>
            <CFormSelect
              id="guest-conversations"
              value={form.conversations}
              disabled={off}
              onChange={(e) => setForm({ ...form, conversations: e.target.value })}
            >
              <option value="private">Private - each browser its own</option>
              <option value="public">Public - every guest reads all</option>
            </CFormSelect>
          </CCol>
          <CCol sm={4}>
            <CFormLabel htmlFor="guest-days">Kept, days</CFormLabel>
            <CFormInput
              id="guest-days"
              type="number"
              min={1}
              placeholder="Always"
              value={form.retentionDays}
              disabled={off}
              onChange={(e) => setForm({ ...form, retentionDays: e.target.value })}
            />
            <CFormText>Empty - kept.</CFormText>
          </CCol>
        </CRow>
        <CFormSwitch
          id="guest-relevant"
          className="mt-3"
          label="Only relevant questions kept"
          checked={form.relevantOnly}
          disabled={off}
          onChange={(e) => setForm({ ...form, relevantOnly: e.target.checked })}
        />
        <CFormText>
          The assistant marks a question off this installation (another subject, nonsense, abuse) -
          it is not kept, with its answer.
        </CFormText>
        <div className="mt-3 d-flex align-items-center gap-2">
          <CButton color="primary" onClick={save} disabled={off}>
            {busy && <CSpinner size="sm" className="me-1" />}Save
          </CButton>
          {saved && <span className="small text-success">Saved</span>}
        </div>
      </div>
    </div>
  )
}

export default GuestTab
