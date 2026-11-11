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
import SearchChecklist from '../../components/SearchChecklist'
import { formatSmartDateTime } from '../../utils/format'
import { t as tr } from 'src/i18n'

/**
 * Service -> Config -> AI -> MCP access (api ai/mcp.ts): the tokens an external MCP client (Claude
 * Code, Claude Desktop, another agent) uses at <this address>/api/mcp. Each token has its own service
 * account (2026-11-10): its roles - what it may read and change, on which objects (set here when it is
 * made, then in Users like a person's); the levels - whether a change its roles allow applies at once
 * (Auto) or waits for a person (Confirm); Install never Auto. No password, no sign-in; never a role with
 * every right; it can't change anyone's roles. Every call - Logs -> MCP calls. A new token is shown once
 * (with the command to connect); afterwards only its prefix. No enabled token - the MCP server is closed.
 */

const LEVELS = ['off', 'confirm', 'auto']
const LEVEL_LABEL = { off: 'Off', confirm: 'Confirm', auto: 'Auto' }
const AREAS = [
  { key: 'config', label: 'Config' },
  { key: 'control', label: 'Control' },
  { key: 'install', label: 'Install' },
]
const DEFAULT_LEVELS = { config: 'confirm', control: 'confirm', install: 'confirm' }

/** The three levels' selects (Install - Off / Confirm); `compact` - small, the area's name over each. */
const LevelSelects = ({ levels, onChange, disabled, compact }) => (
  <div className="d-flex flex-wrap gap-2">
    {AREAS.map((a) => (
      <div key={a.key} style={{ width: compact ? '7.5rem' : '9rem' }}>
        <div className={compact ? 'small text-body-secondary' : 'form-label mb-1'}>
          {tr(a.label)}
        </div>
        <CFormSelect
          size={compact ? 'sm' : undefined}
          aria-label={tr(a.label)}
          value={levels[a.key]}
          disabled={disabled}
          onChange={(e) => onChange({ ...levels, [a.key]: e.target.value })}
        >
          {LEVELS.filter((l) => a.key !== 'install' || l !== 'auto').map((l) => (
            <option key={l} value={l}>
              {tr(LEVEL_LABEL[l])}
            </option>
          ))}
        </CFormSelect>
      </div>
    ))}
  </div>
)

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
        {copied ? tr('Copied') : tr('Copy')}
      </CButton>
    </CInputGroup>
  )
}

const AiMcpAccess = () => {
  const [tokens, setTokens] = useState(null)
  const [roles, setRoles] = useState([])
  const [error, setError] = useState(null)
  const [form, setForm] = useState(null) // {name, roles, levels}
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
      .listRoles()
      .then((d) => setRoles(d.roles.filter((r) => !r.full && !r.service)))
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
  const setLevels = (t, levels) =>
    api
      .updateMcpToken(t.id, { levels })
      .then(load)
      .catch((err) => setError(err.message))
  const remove = (t) =>
    api
      .deleteMcpToken(t.id)
      .then(load)
      .catch((err) => setError(err.message))

  if (!tokens) return error ? <CAlert color="danger">{error}</CAlert> : <CSpinner size="sm" />
  return (
    <>
      {error && (
        <CAlert color="danger" dismissible onClose={() => setError(null)}>
          {error}
        </CAlert>
      )}
      <div className="d-flex flex-wrap align-items-center gap-2 mb-2">
        <span className="small text-body-secondary">{tr('Endpoint:')}</span>
        <div style={{ minWidth: '18rem', flex: 1, maxWidth: '32rem' }}>
          <CopyField value={endpoint()} label={tr('MCP endpoint')} />
        </div>
        <CButton
          color="primary"
          size="sm"
          onClick={() => setForm({ name: '', roles: [], levels: DEFAULT_LEVELS })}
        >
          {tr('+ Token')}
        </CButton>
      </div>
      {tokens.length === 0 ? (
        <div className="small text-body-secondary mb-2">
          {tr('No token - the MCP server is closed.')}
        </div>
      ) : (
        <CTable small hover responsive className="align-middle">
          <CTableHead>
            <CTableRow>
              <CTableHeaderCell>{tr('Name')}</CTableHeaderCell>
              <CTableHeaderCell>{tr('Token')}</CTableHeaderCell>
              <CTableHeaderCell>{tr('Account')}</CTableHeaderCell>
              <CTableHeaderCell>{tr('Roles')}</CTableHeaderCell>
              <CTableHeaderCell>{tr('Changes')}</CTableHeaderCell>
              <CTableHeaderCell>{tr('Last used')}</CTableHeaderCell>
              <CTableHeaderCell>{tr('Enabled')}</CTableHeaderCell>
              <CTableHeaderCell />
            </CTableRow>
          </CTableHead>
          <CTableBody>
            {tokens.map((t) => (
              <CTableRow key={t.id} className={t.enabled ? '' : 'text-body-secondary'}>
                <CTableDataCell className="fw-semibold">{t.name}</CTableDataCell>
                <CTableDataCell className="font-monospace small">{t.prefix}...</CTableDataCell>
                <CTableDataCell className="small font-monospace">
                  {t.account?.username ?? '-'}
                </CTableDataCell>
                <CTableDataCell className="small">
                  {t.account?.roles.length
                    ? t.account.roles.map((r) => r.name).join(', ')
                    : tr('none - sees nothing')}
                </CTableDataCell>
                <CTableDataCell>
                  <LevelSelects compact levels={t.levels} onChange={(l) => setLevels(t, l)} />
                </CTableDataCell>
                <CTableDataCell className="small">
                  {t.lastUsedAt ? formatSmartDateTime(t.lastUsedAt) : tr('never')}
                </CTableDataCell>
                <CTableDataCell>
                  <CFormSwitch
                    checked={t.enabled}
                    onChange={(e) => toggle(t, e.target.checked)}
                    aria-label={tr('{{name}} - enabled', { name: t.name })}
                  />
                </CTableDataCell>
                <CTableDataCell className="text-end">
                  <CButton
                    size="sm"
                    color="danger"
                    variant="outline"
                    onClick={() => remove(t)}
                    title={tr('Revoke')}
                    aria-label={tr('Revoke {{name}}', { name: t.name })}
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
            <CModalTitle>{tr('New MCP token')}</CModalTitle>
          </CModalHeader>
          <CModalBody className="d-flex flex-column gap-3">
            <CFormInput
              label={tr('Name')}
              placeholder={tr('e.g. Claude Code - my laptop')}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <div>
              <SearchChecklist
                id="mcp-roles"
                label={tr('Roles of its account')}
                items={roles.map((r) => ({ key: r.key, label: r.name, detail: r.key }))}
                selected={form.roles}
                onToggle={(k) =>
                  setForm({
                    ...form,
                    roles: form.roles.includes(k)
                      ? form.roles.filter((x) => x !== k)
                      : [...form.roles, k],
                  })
                }
                maxHeight="10rem"
              />
              <div className="form-text">
                {tr(
                  'What it may read and change, on which objects - later in Users, as a person. Never a role with every right.',
                )}
              </div>
            </div>
            <div>
              <LevelSelects
                levels={form.levels}
                onChange={(levels) => setForm({ ...form, levels })}
              />
              <div className="form-text">
                {tr(
                  'A change its roles allow: Auto - applied at once, Confirm - waits for a person (Logs -> AI Proposals). Install - never Auto.',
                )}
              </div>
            </div>
          </CModalBody>
          <CModalFooter>
            <CButton
              color="secondary"
              variant="outline"
              onClick={() => setForm(null)}
              disabled={busy}
            >
              {tr('Cancel')}
            </CButton>
            <CButton
              color="primary"
              onClick={create}
              disabled={busy || !form.name.trim() || form.roles.length === 0}
            >
              {busy ? <CSpinner size="sm" /> : tr('Create')}
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
              {tr('Shown once - copy it now. Only its hash is stored.')}
            </CAlert>
            <div>
              <div className="small text-body-secondary mb-1">{tr('Token')}</div>
              <CopyField value={created.token} label={tr('MCP token')} />
            </div>
            <div>
              <div className="small text-body-secondary mb-1">{tr('Claude Code')}</div>
              <CopyField
                value={`claude mcp add --transport http nexus-edge ${endpoint()} --header "Authorization: Bearer ${created.token}"`}
                label={tr('Claude Code command')}
              />
            </div>
            <div className="small text-body-secondary">
              {tr('Any MCP client: Streamable HTTP at')} {endpoint()}, header Authorization: Bearer
              &lt;token&gt;.
            </div>
          </CModalBody>
          <CModalFooter>
            <CButton color="primary" onClick={() => setCreated(null)}>
              {tr('Done')}
            </CButton>
          </CModalFooter>
        </CModal>
      )}
    </>
  )
}

export default AiMcpAccess
