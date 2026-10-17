import React, { useEffect, useState } from 'react'
import {
  CAlert,
  CButton,
  CFormInput,
  CFormSelect,
  CFormSwitch,
  CInputGroup,
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
import CIcon from '@coreui/icons-react'
import { cilTrash } from '@coreui/icons'
import { api } from '../../api/client'
import { formatSmartDateTime } from '../../utils/format'

/**
 * Service -> Config -> AI -> MCP access (Nexus Edge AI Assistant, stage 3;
 * api ai/mcp.ts): the tokens an external MCP client (Claude Code, Claude
 * Desktop, another agent) uses to read this system through the assistant's
 * resource gateway at <this address>/api/mcp. A token acts as one
 * assistant instance - its access levels apply. A new token is shown once
 * (with the command to connect); afterwards only its prefix. No enabled
 * token - the MCP server is closed.
 */

const endpoint = () => `${window.location.origin}/api/mcp`

const CopyField = ({ value, label }) => {
  const [copied, setCopied] = useState(false)
  const copy = () =>
    navigator.clipboard?.writeText(value).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  return (
    <CInputGroup size="sm">
      <CFormInput
        readOnly
        value={value}
        aria-label={label}
        className="font-monospace"
        onFocus={(e) => e.target.select()}
      />
      <CButton color="secondary" variant="outline" onClick={copy}>
        {copied ? 'Copied' : 'Copy'}
      </CButton>
    </CInputGroup>
  )
}

const AiMcpAccess = () => {
  const [tokens, setTokens] = useState(null)
  const [instances, setInstances] = useState([])
  const [error, setError] = useState(null)
  const [form, setForm] = useState(null) // {name, instanceKey}
  const [created, setCreated] = useState(null) // {token, record}
  const [busy, setBusy] = useState(false)
  const load = () =>
    api
      .listMcpTokens()
      .then((d) => setTokens(d.tokens))
      .catch((err) => setError(err.message))
  useEffect(() => {
    load()
    api
      .listAiInstances()
      .then((d) => setInstances(d.instances))
      .catch((err) => setError(err.message))
  }, [])

  const create = async () => {
    setBusy(true)
    setError(null)
    try {
      setCreated(await api.createMcpToken(form))
      setForm(null)
      load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }
  const toggle = (t, enabled) =>
    api
      .updateMcpToken(t.id, { enabled })
      .then(load)
      .catch((err) => setError(err.message))
  const remove = (t) =>
    api
      .deleteMcpToken(t.id)
      .then(load)
      .catch((err) => setError(err.message))
  const nameOf = (key) => instances.find((i) => i.key === key)?.name ?? key

  if (!tokens) return error ? <CAlert color="danger">{error}</CAlert> : <CSpinner size="sm" />
  return (
    <>
      {error && (
        <CAlert color="danger" dismissible onClose={() => setError(null)}>
          {error}
        </CAlert>
      )}
      <div className="d-flex flex-wrap align-items-center gap-2 mb-2">
        <span className="small text-body-secondary">Endpoint:</span>
        <div style={{ minWidth: '18rem', flex: 1, maxWidth: '32rem' }}>
          <CopyField value={endpoint()} label="MCP endpoint" />
        </div>
        <CButton
          color="primary"
          size="sm"
          onClick={() => setForm({ name: '', instanceKey: 'nexus-edge' })}
        >
          + Token
        </CButton>
      </div>
      {tokens.length === 0 ? (
        <div className="small text-body-secondary mb-2">No token - the MCP server is closed.</div>
      ) : (
        <CTable small hover responsive className="align-middle table-no-last-border">
          <CTableHead>
            <CTableRow>
              <CTableHeaderCell>Name</CTableHeaderCell>
              <CTableHeaderCell>Token</CTableHeaderCell>
              <CTableHeaderCell>Acts as</CTableHeaderCell>
              <CTableHeaderCell>Last used</CTableHeaderCell>
              <CTableHeaderCell>Enabled</CTableHeaderCell>
              <CTableHeaderCell />
            </CTableRow>
          </CTableHead>
          <CTableBody>
            {tokens.map((t) => (
              <CTableRow key={t.id} className={t.enabled ? '' : 'text-body-secondary'}>
                <CTableDataCell className="fw-semibold">{t.name}</CTableDataCell>
                <CTableDataCell className="font-monospace small">{t.prefix}...</CTableDataCell>
                <CTableDataCell className="small">{nameOf(t.instanceKey)}</CTableDataCell>
                <CTableDataCell className="small">
                  {t.lastUsedAt ? formatSmartDateTime(t.lastUsedAt) : 'never'}
                </CTableDataCell>
                <CTableDataCell>
                  <CFormSwitch
                    checked={t.enabled}
                    onChange={(e) => toggle(t, e.target.checked)}
                    aria-label={`${t.name} - enabled`}
                  />
                </CTableDataCell>
                <CTableDataCell className="text-end">
                  <CButton
                    size="sm"
                    color="danger"
                    variant="outline"
                    onClick={() => remove(t)}
                    title="Revoke"
                    aria-label={`Revoke ${t.name}`}
                  >
                    <CIcon icon={cilTrash} />
                  </CButton>
                </CTableDataCell>
              </CTableRow>
            ))}
          </CTableBody>
        </CTable>
      )}

      {form && (
        <CModal visible onClose={() => setForm(null)}>
          <CModalHeader>
            <CModalTitle>New MCP token</CModalTitle>
          </CModalHeader>
          <CModalBody className="d-flex flex-column gap-3">
            <CFormInput
              label="Name"
              placeholder="e.g. Claude Code - my laptop"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <CFormSelect
              label="Acts as (its access levels apply)"
              value={form.instanceKey}
              onChange={(e) => setForm({ ...form, instanceKey: e.target.value })}
            >
              {instances.map((i) => (
                <option key={i.key} value={i.key}>
                  {i.name}
                </option>
              ))}
            </CFormSelect>
          </CModalBody>
          <CModalFooter>
            <CButton
              color="secondary"
              variant="outline"
              onClick={() => setForm(null)}
              disabled={busy}
            >
              Cancel
            </CButton>
            <CButton color="primary" onClick={create} disabled={busy || !form.name.trim()}>
              {busy ? <CSpinner size="sm" /> : 'Create'}
            </CButton>
          </CModalFooter>
        </CModal>
      )}

      {created && (
        <CModal visible onClose={() => setCreated(null)} size="lg">
          <CModalHeader>
            <CModalTitle>MCP token &quot;{created.record.name}&quot;</CModalTitle>
          </CModalHeader>
          <CModalBody className="d-flex flex-column gap-3">
            <CAlert color="warning" className="mb-0 small">
              Shown once - copy it now. Only its hash is stored.
            </CAlert>
            <div>
              <div className="small text-body-secondary mb-1">Token</div>
              <CopyField value={created.token} label="MCP token" />
            </div>
            <div>
              <div className="small text-body-secondary mb-1">Claude Code</div>
              <CopyField
                value={`claude mcp add --transport http nexus-edge ${endpoint()} --header "Authorization: Bearer ${created.token}"`}
                label="Claude Code command"
              />
            </div>
            <div className="small text-body-secondary">
              Any MCP client: Streamable HTTP at {endpoint()}, header Authorization: Bearer
              &lt;token&gt;.
            </div>
          </CModalBody>
          <CModalFooter>
            <CButton color="primary" onClick={() => setCreated(null)}>
              Done
            </CButton>
          </CModalFooter>
        </CModal>
      )}
    </>
  )
}

export default AiMcpAccess
