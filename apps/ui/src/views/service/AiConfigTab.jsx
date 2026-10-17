import React, { useEffect, useState } from 'react'
import {
  CAlert,
  CBadge,
  CButton,
  CButtonGroup,
  CFormInput,
  CFormLabel,
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
import { cilLockLocked, cilPencil, cilTrash } from '@coreui/icons'
import { api } from '../../api/client'
import AiInstances from './AiInstances'
import AiMcpAccess from './AiMcpAccess'

/**
 * Service -> Config -> AI (Nexus Edge AI Assistant, stage 1 - nexus-edge-
 * aquarium AGENTS_TO_DO.md 2026-10-17): the connections to AI models (api
 * routes/ai.ts). A connection's API key is stored encrypted on the server
 * and never comes back here - the form shows only whether one is set; a
 * new key is typed in a password field (the eye shows what is being typed
 * now). The default connection serves the photo analysis; the assistant's
 * instances pick theirs - Instances under the connections (AiInstances.jsx,
 * stage 2).
 */

const TYPES = [
  {
    value: 'openai',
    label: 'OpenAI',
    endpoint: 'https://api.openai.com/v1 (default)',
    model: 'gpt-4.1-mini',
  },
  {
    value: 'anthropic',
    label: 'Anthropic (Claude)',
    endpoint: 'https://api.anthropic.com (default)',
    model: 'claude-sonnet-5-5',
  },
  {
    value: 'openai-compatible',
    label: 'OpenAI-compatible (a local model: Ollama, LM Studio, vLLM)',
    endpoint: 'e.g. http://ollama:11434/v1',
    model: 'e.g. llama3.1',
  },
]
const typeOf = (value) => TYPES.find((t) => t.value === value) ?? TYPES[0]

const EMPTY = {
  id: null,
  name: '',
  type: 'openai',
  endpoint: '',
  model: '',
  apiKey: '',
  removeKey: false,
  hasKey: false,
  isDefault: false,
  enabled: true,
  maxOutputTokens: '',
  dailyTokenLimit: '',
}

const intOrNull = (text) => (String(text).trim() === '' ? null : Number(text))

// The API key: a password field, the eye shows what is typed now (a stored key never comes back).
const KeyField = ({ value, onChange, hasKey, removeKey, onRemove }) => {
  const [shown, setShown] = useState(false)
  return (
    <>
      <CInputGroup>
        <CFormInput
          type={shown ? 'text' : 'password'}
          autoComplete="new-password"
          value={value}
          placeholder={hasKey && !removeKey ? 'Set - leave empty to keep it' : 'Not set'}
          onChange={(e) => onChange(e.target.value)}
          aria-label="API key"
        />
        <CButton
          color="secondary"
          variant="outline"
          onClick={() => setShown((s) => !s)}
          title={shown ? 'Hide what is typed' : 'Show what is typed'}
          aria-label={shown ? 'Hide the key being typed' : 'Show the key being typed'}
        >
          <svg
            viewBox="0 0 24 24"
            width="18"
            height="18"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden="true"
          >
            <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
            <circle cx="12" cy="12" r="3" />
            {shown && <path d="M3 3l18 18" />}
          </svg>
        </CButton>
      </CInputGroup>
      {hasKey && (
        <CFormSwitch
          className="mt-1 small"
          label="Remove the stored key"
          checked={removeKey}
          onChange={(e) => onRemove(e.target.checked)}
        />
      )}
    </>
  )
}

const ConnectionModal = ({ form, setForm, onClose, onSaved, secretsAvailable }) => {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  if (!form) return null
  const set = (changes) => setForm({ ...form, ...changes })
  const type = typeOf(form.type)

  const save = async () => {
    setBusy(true)
    setError(null)
    const body = {
      name: form.name,
      type: form.type,
      endpoint: form.endpoint.trim() || null,
      model: form.model,
      isDefault: form.isDefault,
      enabled: form.enabled,
      maxOutputTokens: intOrNull(form.maxOutputTokens),
      dailyTokenLimit: intOrNull(form.dailyTokenLimit),
      // a key only when one is typed (or removed) - else the stored one stays
      ...(form.apiKey ? { apiKey: form.apiKey } : form.removeKey ? { apiKey: null } : {}),
    }
    try {
      await (form.id ? api.updateAiConnection(form.id, body) : api.createAiConnection(body))
      onSaved()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <CModal visible onClose={onClose} size="lg">
      <CModalHeader>
        <CModalTitle>{form.id ? 'Edit connection' : 'New connection'}</CModalTitle>
      </CModalHeader>
      <CModalBody className="d-flex flex-column gap-3">
        {error && <CAlert color="danger">{error}</CAlert>}
        <div>
          <CFormLabel>Name</CFormLabel>
          <CFormInput value={form.name} onChange={(e) => set({ name: e.target.value })} />
        </div>
        <div>
          <CFormLabel>Type</CFormLabel>
          <CFormSelect value={form.type} onChange={(e) => set({ type: e.target.value })}>
            {TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </CFormSelect>
        </div>
        <div>
          <CFormLabel>Endpoint</CFormLabel>
          <CFormInput
            value={form.endpoint}
            placeholder={type.endpoint}
            onChange={(e) => set({ endpoint: e.target.value })}
          />
        </div>
        <div>
          <CFormLabel>Model</CFormLabel>
          <CFormInput
            value={form.model}
            placeholder={type.model}
            onChange={(e) => set({ model: e.target.value })}
          />
        </div>
        <div>
          <CFormLabel>API key</CFormLabel>
          {secretsAvailable ? (
            <KeyField
              value={form.apiKey}
              onChange={(apiKey) => set({ apiKey })}
              hasKey={form.hasKey}
              removeKey={form.removeKey}
              onRemove={(removeKey) => set({ removeKey, apiKey: '' })}
            />
          ) : (
            <CAlert color="warning" className="mb-0 small">
              AI_SECRETS_KEY is not set in the server&apos;s .env - an API key can&apos;t be stored.
            </CAlert>
          )}
        </div>
        <div className="d-flex flex-wrap gap-3">
          <div style={{ minWidth: '14rem', flex: 1 }}>
            <CFormLabel>Answer limit, tokens</CFormLabel>
            <CFormInput
              type="number"
              min={1}
              value={form.maxOutputTokens}
              placeholder="The server's default"
              onChange={(e) => set({ maxOutputTokens: e.target.value })}
            />
          </div>
          <div style={{ minWidth: '14rem', flex: 1 }}>
            <CFormLabel>Tokens a day</CFormLabel>
            <CFormInput
              type="number"
              min={1}
              value={form.dailyTokenLimit}
              placeholder="No limit"
              onChange={(e) => set({ dailyTokenLimit: e.target.value })}
            />
          </div>
        </div>
        <div className="d-flex flex-wrap gap-4">
          <CFormSwitch
            label="Default connection"
            checked={form.isDefault}
            onChange={(e) => set({ isDefault: e.target.checked })}
          />
          <CFormSwitch
            label="Enabled"
            checked={form.enabled}
            onChange={(e) => set({ enabled: e.target.checked })}
          />
        </div>
      </CModalBody>
      <CModalFooter>
        <CButton color="secondary" variant="outline" onClick={onClose} disabled={busy}>
          Cancel
        </CButton>
        <CButton color="primary" onClick={save} disabled={busy}>
          {busy ? <CSpinner size="sm" /> : 'Save'}
        </CButton>
      </CModalFooter>
    </CModal>
  )
}

const AiConfigTab = () => {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [form, setForm] = useState(null)
  // connection id -> {busy} | the test's answer
  const [tests, setTests] = useState({})
  const load = () =>
    api
      .listAiConnections()
      .then(setData)
      .catch((err) => setError(err.message))
  useEffect(() => {
    load()
  }, [])

  const test = (c) => {
    setTests((t) => ({ ...t, [c.id]: { busy: true } }))
    api
      .testAiConnection(c.id)
      .then((r) => setTests((t) => ({ ...t, [c.id]: r })))
      .catch((err) => setTests((t) => ({ ...t, [c.id]: { ok: false, error: err.message } })))
  }
  const remove = (c) =>
    api
      .deleteAiConnection(c.id)
      .then(load)
      .catch((err) => setError(err.message))
  const edit = (c) =>
    setForm({
      ...EMPTY,
      ...c,
      endpoint: c.endpoint ?? '',
      apiKey: '',
      maxOutputTokens: c.maxOutputTokens ?? '',
      dailyTokenLimit: c.dailyTokenLimit ?? '',
    })

  if (!data) return error ? <CAlert color="danger">{error}</CAlert> : <CSpinner size="sm" />

  return (
    <div className="pt-2">
      {error && (
        <CAlert color="danger" dismissible onClose={() => setError(null)}>
          {error}
        </CAlert>
      )}
      <div className="d-flex align-items-center justify-content-between mb-2">
        <h5 className="mb-0">Connections</h5>
        <CButton
          color="primary"
          size="sm"
          onClick={() => setForm({ ...EMPTY, isDefault: data.connections.length === 0 })}
        >
          + Connection
        </CButton>
      </div>
      {!data.secretsAvailable && (
        <CAlert color="warning" className="small">
          AI_SECRETS_KEY is not set in the server&apos;s .env - API keys can&apos;t be stored.
        </CAlert>
      )}
      {data.connections.length === 0 ? (
        <CAlert color="info">
          No connection yet - the AI features are off until one is added.
        </CAlert>
      ) : (
        <CTable small hover responsive className="align-middle table-no-last-border">
          <CTableHead>
            <CTableRow>
              <CTableHeaderCell>Name</CTableHeaderCell>
              <CTableHeaderCell>Type</CTableHeaderCell>
              <CTableHeaderCell>Model</CTableHeaderCell>
              <CTableHeaderCell>Key</CTableHeaderCell>
              <CTableHeaderCell>Limits</CTableHeaderCell>
              <CTableHeaderCell className="text-end">Actions</CTableHeaderCell>
            </CTableRow>
          </CTableHead>
          <CTableBody>
            {data.connections.map((c) => {
              const t = tests[c.id]
              return (
                <React.Fragment key={c.id}>
                  <CTableRow className={c.enabled ? '' : 'text-body-secondary'}>
                    <CTableDataCell>
                      <span className="fw-semibold">{c.name}</span>
                      {c.isDefault && (
                        <CBadge color="primary" className="ms-2">
                          Default
                        </CBadge>
                      )}
                      {!c.enabled && (
                        <CBadge color="secondary" className="ms-2">
                          Off
                        </CBadge>
                      )}
                      {c.endpoint && <div className="small text-body-secondary">{c.endpoint}</div>}
                    </CTableDataCell>
                    <CTableDataCell>{typeOf(c.type).label}</CTableDataCell>
                    <CTableDataCell className="font-monospace small">{c.model}</CTableDataCell>
                    <CTableDataCell>
                      {c.hasKey ? (
                        <span className="small" title="Stored encrypted, never shown">
                          <CIcon icon={cilLockLocked} size="sm" className="me-1" />
                          set
                        </span>
                      ) : (
                        <span className="small text-body-secondary">-</span>
                      )}
                    </CTableDataCell>
                    <CTableDataCell className="small text-body-secondary">
                      {c.maxOutputTokens ? `${c.maxOutputTokens} / answer` : 'default / answer'}
                      {c.dailyTokenLimit ? `, ${c.dailyTokenLimit} / day` : ''}
                    </CTableDataCell>
                    <CTableDataCell className="text-end">
                      <CButtonGroup size="sm">
                        <CButton
                          color="secondary"
                          variant="outline"
                          onClick={() => test(c)}
                          disabled={t?.busy || !c.enabled}
                        >
                          {t?.busy ? <CSpinner size="sm" /> : 'Test'}
                        </CButton>
                        <CButton
                          color="secondary"
                          variant="outline"
                          onClick={() => edit(c)}
                          title="Edit"
                          aria-label={`Edit ${c.name}`}
                        >
                          <CIcon icon={cilPencil} />
                        </CButton>
                        <CButton
                          color="danger"
                          variant="outline"
                          onClick={() => remove(c)}
                          title="Delete"
                          aria-label={`Delete ${c.name}`}
                        >
                          <CIcon icon={cilTrash} />
                        </CButton>
                      </CButtonGroup>
                    </CTableDataCell>
                  </CTableRow>
                  {t && !t.busy && (
                    <CTableRow>
                      <CTableDataCell colSpan={6} className="small">
                        {t.ok ? (
                          <span className="text-success">
                            Answered &quot;{t.text}&quot; ({t.model}, {t.latencyMs} ms
                            {t.usage ? `, ${t.usage.totalTokens} tokens` : ''})
                          </span>
                        ) : (
                          <span className="text-danger">{t.error}</span>
                        )}
                      </CTableDataCell>
                    </CTableRow>
                  )}
                </React.Fragment>
              )
            })}
          </CTableBody>
        </CTable>
      )}
      <h5 className="mt-4 mb-2">Instances</h5>
      <div className="small text-body-secondary mb-2">
        Where the assistant works and what it may do: Confirm - a person accepts each change; Auto -
        done by the ai-agent account.
      </div>
      <AiInstances connections={data.connections} />
      <h5 className="mt-4 mb-2">MCP access</h5>
      <div className="small text-body-secondary mb-2">
        External AI clients (Claude Code, Claude Desktop, other agents) read this system through the
        assistant&apos;s tools over the Model Context Protocol - each token with the access levels
        of the instance it acts as.
      </div>
      <AiMcpAccess />
      <ConnectionModal
        form={form}
        setForm={setForm}
        onClose={() => setForm(null)}
        secretsAvailable={data.secretsAvailable}
        onSaved={() => {
          setForm(null)
          load()
        }}
      />
    </div>
  )
}

export default AiConfigTab
