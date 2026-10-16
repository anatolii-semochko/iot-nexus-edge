import React, { useEffect, useState } from 'react'
import { CAlert, CBadge, CButton, CButtonGroup, CSpinner, CTable, CTableBody, CTableDataCell, CTableRow } from '@coreui/react'
import { api } from '../../api/client'
import { formatSmartDateTime } from '../../utils/format'

// Service -> Database -> Migrations (nexus-edge-aquarium AGENTS_TO_DO.md
// 2026-10-16, tech debt 11; api routes/dnp.ts, extraMigrations.ts): the
// project's own migrations - how they are applied (Auto Apply - when the
// api starts; Human Confirmation - they wait here), the pending ones with
// Apply, and any changed after it was applied (never re-run - a new
// migration is written instead). The core's own run at every start.

const MODES = [
  { value: 'auto', label: 'Auto Apply' },
  { value: 'confirm', label: 'Human Confirmation' },
]

const MigrationsCard = () => {
  const [data, setData] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [message, setMessage] = useState(null)
  const load = () =>
    api
      .listMigrations()
      .then(setData)
      .catch((err) => setError(err.message))
  useEffect(() => {
    load()
  }, [])

  const setMode = (mode) => {
    setError(null)
    api
      .setDnpSettings({ migrationsApply: mode })
      .then(() => setData((d) => ({ ...d, apply: mode })))
      .catch((err) => setError(err.message))
  }
  const apply = () => {
    setBusy(true)
    setError(null)
    setMessage(null)
    api
      .applyMigrations()
      .then((r) => setMessage(`${r.applied.length} applied`))
      .catch((err) => setError(err.message))
      .finally(() => {
        setBusy(false)
        load()
      })
  }

  if (!data) return error ? <CAlert color="danger">{error}</CAlert> : <CSpinner size="sm" />
  const pending = data.project.filter((m) => m.status === 'pending')
  const changed = data.project.filter((m) => m.status === 'changed')
  const last = data.project.filter((m) => m.status === 'applied').slice(-1)[0]

  return (
    <div className="border rounded p-3">
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2">
        <h5 className="mb-0">Migrations</h5>
        <CButtonGroup size="sm" role="group" aria-label="How the project's migrations are applied">
          {MODES.map((m) => (
            <CButton key={m.value} color="primary" variant={data.apply === m.value ? undefined : 'outline'} onClick={() => setMode(m.value)}>
              {m.label}
            </CButton>
          ))}
        </CButtonGroup>
      </div>
      <div className="small text-body-secondary mb-2">
        Core: {data.core.length} applied. Project: {data.project.length - pending.length - changed.length} applied
        {last ? `, the last ${last.name} (${formatSmartDateTime(last.appliedAt)})` : ''}.{' '}
        {data.apply === 'auto' ? 'New ones are applied when the API starts.' : 'New ones wait for a confirmation here.'}
      </div>
      {error && <CAlert color="danger">{error}</CAlert>}
      {message && <CAlert color="success">{message}</CAlert>}
      {pending.length + changed.length > 0 && (
        <CTable small className="align-middle mb-2 table-no-last-border">
          <CTableBody>
            {[...pending, ...changed].map((m) => (
              <CTableRow key={m.name}>
                <CTableDataCell className="font-monospace small">{m.name}</CTableDataCell>
                <CTableDataCell className="text-end">
                  {m.status === 'pending' ? (
                    <CBadge color="warning">Pending</CBadge>
                  ) : (
                    <CBadge color="danger" title="Changed after it was applied - not re-run; write a new migration">
                      Changed
                    </CBadge>
                  )}
                </CTableDataCell>
              </CTableRow>
            ))}
          </CTableBody>
        </CTable>
      )}
      {pending.length > 0 && (
        <CButton color="primary" size="sm" onClick={apply} disabled={busy}>
          {busy ? <CSpinner size="sm" /> : `Apply ${pending.length} pending`}
        </CButton>
      )}
    </div>
  )
}

export default MigrationsCard
