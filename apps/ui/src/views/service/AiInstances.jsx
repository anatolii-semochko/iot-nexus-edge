import React, { useEffect, useState } from 'react'
import {
  CAlert,
  CBadge,
  CButton,
  CFormSelect,
  CFormSwitch,
  CSpinner,
  CTable,
  CTableBody,
  CTableDataCell,
  CTableHead,
  CTableHeaderCell,
  CTableRow,
} from '@coreui/react'
import { api } from '../../api/client'
import AiCalendarModal from './AiCalendarModal'

/**
 * Service -> Config -> AI -> Instances (Nexus Edge AI Assistant, stage 2):
 * the whole system first (built in), then the DNP instances whose DNP
 * declares the assistant (its plugin.json `ai`). Each: the connection it
 * uses (empty - the assistant is off for it), its access levels - Read
 * on / off; Config, Control and Install (the whole system only) off /
 * confirm (a person accepts each change) / auto (done by `ai-agent`);
 * Report on / off - and whether its conversations are logged. Saved at
 * once. Calendar - only where the DNP declares scheduled work (stage 7 -
 * AiCalendarModal.jsx).
 */

const LEVELS = [
  { value: 'off', label: 'Off' },
  { value: 'confirm', label: 'Confirm' },
  { value: 'auto', label: 'Auto' },
]

const LevelSelect = ({ value, onChange, label, disabled }) => (
  <CFormSelect
    size="sm"
    value={value}
    onChange={(e) => onChange(e.target.value)}
    aria-label={label}
    disabled={disabled}
    style={{ width: '6.5rem' }}
  >
    {LEVELS.map((l) => (
      <option key={l.value} value={l.value}>
        {l.label}
      </option>
    ))}
  </CFormSelect>
)

const AiInstances = ({ connections }) => {
  const [instances, setInstances] = useState(null)
  const [error, setError] = useState(null)
  const [calendarOf, setCalendarOf] = useState(null)
  useEffect(() => {
    api
      .listAiInstances()
      .then((d) => setInstances(d.instances))
      .catch((err) => setError(err.message))
  }, [])

  const save = (instance, changes) => {
    setError(null)
    api
      .updateAiInstance(instance.key, changes)
      .then((saved) => setInstances((list) => list.map((i) => (i.key === saved.key ? saved : i))))
      .catch((err) => setError(`${instance.name}: ${err.message}`))
  }
  const setAccess = (instance, level, value) => save(instance, { access: { [level]: value } })

  if (!instances) return error ? <CAlert color="danger">{error}</CAlert> : <CSpinner size="sm" />
  return (
    <>
      {error && (
        <CAlert color="danger" dismissible onClose={() => setError(null)}>
          {error}
        </CAlert>
      )}
      <CTable small hover responsive className="align-middle">
        <CTableHead>
          <CTableRow>
            <CTableHeaderCell>Instance</CTableHeaderCell>
            <CTableHeaderCell>Connection</CTableHeaderCell>
            <CTableHeaderCell title="Read the system: states, logs, series, configs, documentation">
              Read
            </CTableHeaderCell>
            <CTableHeaderCell title="Change settings">Config</CTableHeaderCell>
            <CTableHeaderCell title="Commands, manual values">Control</CTableHeaderCell>
            <CTableHeaderCell title="DNPs, nodes, devices, migrations - the whole system only">
              Install
            </CTableHeaderCell>
            <CTableHeaderCell title="Reports / proposals to the developers">
              Report
            </CTableHeaderCell>
            <CTableHeaderCell title="Log the conversations with their full payload">
              Logs
            </CTableHeaderCell>
            <CTableHeaderCell />
          </CTableRow>
        </CTableHead>
        <CTableBody>
          {instances.map((i) => {
            const off = i.connectionId === null
            const system = i.processId === null
            return (
              <CTableRow key={i.key} className={off ? 'text-body-secondary' : ''}>
                <CTableDataCell>
                  <div className="fw-semibold">
                    {i.name}
                    {system && (
                      <CBadge color="primary" className="ms-2">
                        Built in
                      </CBadge>
                    )}
                  </div>
                  <div className="small text-body-secondary">
                    {system
                      ? 'The whole system'
                      : i.plugin === i.kind
                        ? i.kind
                        : `${i.kind} (${i.plugin})`}
                  </div>
                </CTableDataCell>
                <CTableDataCell>
                  <CFormSelect
                    size="sm"
                    value={i.connectionId ?? ''}
                    onChange={(e) =>
                      save(i, {
                        connectionId: e.target.value === '' ? null : Number(e.target.value),
                      })
                    }
                    aria-label={`${i.name} - connection`}
                    style={{ minWidth: '9rem' }}
                  >
                    <option value="">- (off)</option>
                    {connections.map((c) => (
                      <option key={c.id} value={c.id} disabled={!c.enabled}>
                        {c.name}
                        {c.enabled ? '' : ' (disabled)'}
                      </option>
                    ))}
                  </CFormSelect>
                </CTableDataCell>
                <CTableDataCell>
                  <CFormSwitch
                    checked={i.access.read}
                    onChange={(e) => setAccess(i, 'read', e.target.checked)}
                    aria-label={`${i.name} - read`}
                  />
                </CTableDataCell>
                <CTableDataCell>
                  <LevelSelect
                    value={i.access.config}
                    onChange={(v) => setAccess(i, 'config', v)}
                    label={`${i.name} - config`}
                  />
                </CTableDataCell>
                <CTableDataCell>
                  <LevelSelect
                    value={i.access.control}
                    onChange={(v) => setAccess(i, 'control', v)}
                    label={`${i.name} - control`}
                  />
                </CTableDataCell>
                <CTableDataCell>
                  {system ? (
                    <LevelSelect
                      value={i.access.install}
                      onChange={(v) => setAccess(i, 'install', v)}
                      label={`${i.name} - install`}
                    />
                  ) : (
                    <span className="small text-body-tertiary">-</span>
                  )}
                </CTableDataCell>
                <CTableDataCell>
                  <CFormSwitch
                    checked={i.access.report}
                    onChange={(e) => setAccess(i, 'report', e.target.checked)}
                    aria-label={`${i.name} - report`}
                  />
                </CTableDataCell>
                <CTableDataCell>
                  <CFormSwitch
                    checked={i.logs}
                    onChange={(e) => save(i, { logs: e.target.checked })}
                    aria-label={`${i.name} - logs`}
                  />
                </CTableDataCell>
                <CTableDataCell className="text-end">
                  {i.scheduledTypes.length > 0 && (
                    <CButton
                      size="sm"
                      color="secondary"
                      variant="outline"
                      title="Scheduled runs"
                      onClick={() => setCalendarOf(i)}
                    >
                      Calendar
                    </CButton>
                  )}
                </CTableDataCell>
              </CTableRow>
            )
          })}
        </CTableBody>
      </CTable>
      {calendarOf && <AiCalendarModal instance={calendarOf} onClose={() => setCalendarOf(null)} />}
    </>
  )
}

export default AiInstances
