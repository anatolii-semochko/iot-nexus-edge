import React, { useEffect, useMemo, useState } from 'react'
import {
  CAlert,
  CBadge,
  CButton,
  CFormCheck,
  CFormInput,
  CFormLabel,
  CModal,
  CModalBody,
  CModalFooter,
  CModalHeader,
  CModalTitle,
  CSpinner,
  CTable,
  CTableBody,
  CTableDataCell,
  CTableHead,
  CTableHeaderCell,
  CTableRow,
} from '@coreui/react'
import { api } from '../../api/client'
import { formatBytes } from '../../utils/format'

/**
 * Service -> Database -> Clear Logs (nexus-edge-aquarium AGENTS_TO_DO.md
 * 2026-10-17, point 11 - api logCleanup.ts): the date the logs are cleared
 * up to (empty - all of them), then what to clear - the permanent rows
 * first (the AI Assistant's conversations, reports, decided proposals; the
 * System's own logs), then the DNP instances (an aquarium with its
 * modules, a process with no node) by their log volume up to that date,
 * larger first. Below - the volume ticked. Active WEM messages and pending
 * proposals are kept (the current state, not history); time series are
 * not logs.
 */

// "YYYY-MM-DD" -> the local midnight it starts at (the logs before it)
const cutoffOf = (date) => (date ? new Date(`${date}T00:00:00`).toISOString() : '')

const ClearLogsModal = ({ onClose, onCleared }) => {
  const [date, setDate] = useState('')
  const [units, setUnits] = useState(null)
  const [chosen, setChosen] = useState(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    let current = true
    api
      .getLogVolumes(cutoffOf(date))
      .then((d) => current && setUnits(d.units))
      .catch((err) => current && setError(err.message))
    return () => {
      current = false
    }
  }, [date])

  const selected = useMemo(
    () =>
      (units ?? [])
        .filter((u) => chosen.has(u.key))
        .reduce((t, u) => ({ rows: t.rows + u.rows, bytes: t.bytes + u.bytes }), {
          rows: 0,
          bytes: 0,
        }),
    [units, chosen],
  )
  const toggle = (key) =>
    setChosen((c) => {
      const next = new Set(c)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  const withLogs = (units ?? []).filter((u) => u.rows > 0)
  const allChosen = withLogs.length > 0 && withLogs.every((u) => chosen.has(u.key))

  const clear = async () => {
    setBusy(true)
    setError(null)
    try {
      const { deleted } = await api.clearDatabaseLogs({
        before: cutoffOf(date) || null,
        units: [...chosen],
      })
      const total = Object.values(deleted).reduce((a, b) => a + b, 0)
      onCleared(`Logs cleared: ${total} row(s).`)
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <CModal visible size="lg" onClose={onClose}>
      <CModalHeader>
        <CModalTitle>Clear Logs</CModalTitle>
      </CModalHeader>
      <CModalBody>
        {error && <CAlert color="danger">{error}</CAlert>}
        <div className="d-flex align-items-end gap-2 mb-3">
          <div>
            <CFormLabel className="mb-1">Clear the logs before</CFormLabel>
            <CFormInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <span className="small text-body-secondary pb-2">
            {date ? 'the start of that day' : 'empty - all of them'}
          </span>
        </div>
        {!units ? (
          <CSpinner size="sm" />
        ) : (
          <div style={{ maxHeight: '50vh', overflow: 'auto' }}>
            <CTable small hover className="align-middle mb-0">
              <CTableHead>
                <CTableRow>
                  <CTableHeaderCell style={{ width: '2rem' }}>
                    <CFormCheck
                      checked={allChosen}
                      disabled={withLogs.length === 0}
                      onChange={() =>
                        setChosen(allChosen ? new Set() : new Set(withLogs.map((u) => u.key)))
                      }
                      aria-label="All"
                    />
                  </CTableHeaderCell>
                  <CTableHeaderCell>Logs of</CTableHeaderCell>
                  <CTableHeaderCell className="text-end">Rows</CTableHeaderCell>
                  <CTableHeaderCell className="text-end">Volume</CTableHeaderCell>
                </CTableRow>
              </CTableHead>
              <CTableBody>
                {units.map((u) => (
                  <CTableRow
                    key={u.key}
                    className={u.rows === 0 ? 'text-body-tertiary' : ''}
                    style={{ cursor: u.rows ? 'pointer' : 'default' }}
                    onClick={() => u.rows && toggle(u.key)}
                  >
                    <CTableDataCell>
                      <CFormCheck
                        checked={chosen.has(u.key)}
                        disabled={u.rows === 0}
                        onChange={() => toggle(u.key)}
                        onClick={(e) => e.stopPropagation()}
                        aria-label={u.name}
                      />
                    </CTableDataCell>
                    <CTableDataCell>
                      <span className="fw-semibold">{u.name}</span>
                      {u.permanent && (
                        <CBadge color="light" textColor="dark" className="border ms-2">
                          permanent
                        </CBadge>
                      )}
                      {u.detail && (
                        <div
                          className="small text-body-secondary text-truncate"
                          style={{ maxWidth: '28rem' }}
                        >
                          {u.detail}
                        </div>
                      )}
                    </CTableDataCell>
                    <CTableDataCell className="text-end small">
                      {u.rows.toLocaleString()}
                    </CTableDataCell>
                    <CTableDataCell className="text-end small text-nowrap">
                      {formatBytes(u.bytes)}
                    </CTableDataCell>
                  </CTableRow>
                ))}
              </CTableBody>
            </CTable>
          </div>
        )}
        <div className="small text-body-secondary mt-2">
          Kept: active warnings / errors / messages and pending AI proposals (the current state);
          time series are not logs. Configuration is not affected. This cannot be undone.
        </div>
      </CModalBody>
      <CModalFooter className="justify-content-between">
        <span className="small">
          Selected: <strong>{selected.rows.toLocaleString()}</strong> row(s),{' '}
          <strong>{formatBytes(selected.bytes)}</strong>
        </span>
        <div className="d-flex gap-2">
          <CButton color="secondary" variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </CButton>
          <CButton color="danger" onClick={clear} disabled={busy || chosen.size === 0}>
            {busy && <CSpinner size="sm" className="me-1" />}Clear Logs
          </CButton>
        </div>
      </CModalFooter>
    </CModal>
  )
}

export default ClearLogsModal
