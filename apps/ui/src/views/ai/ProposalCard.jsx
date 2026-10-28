import React, { useState } from 'react'
import { CBadge, CButton, CSpinner } from '@coreui/react'
import { api } from '../../api/client'
import { useCan } from '../../access'
import { formatSmartDateTime } from '../../utils/format'

/**
 * One AI Assistant proposal (Nexus Edge AI Assistant, stage 6 - api
 * ai/proposals.ts): what the agent wants to change, why, and the diff - a
 * config's changed fields (before -> after), a command with its params, a
 * switch, a new DNP instance. Pending - Accept (applied as you) / Reject;
 * decided - who and when, or why it failed. The messenger shows it in its
 * turn; Logs -> AI Proposals lists them all.
 */

const STATUS_COLOR = {
  pending: 'warning',
  applied: 'success',
  rejected: 'secondary',
  failed: 'danger',
}
const ACCESS_LABEL = { config: 'Config', control: 'Control', install: 'Install' }

// the leaves of a value by path ("channels[0].dailyMl") - so a diff shows the fields that change
const leavesOf = (value, prefix = '', out = {}) => {
  if (Array.isArray(value)) {
    if (value.length === 0 && prefix) out[prefix] = '[]'
    value.forEach((v, i) => leavesOf(v, `${prefix}[${i}]`, out))
  } else if (value !== null && typeof value === 'object') {
    const keys = Object.keys(value)
    if (keys.length === 0 && prefix) out[prefix] = '{}'
    keys.forEach((k) => leavesOf(value[k], prefix ? `${prefix}.${k}` : k, out))
  } else if (prefix) out[prefix] = value === undefined ? undefined : JSON.stringify(value)
  return out
}

// the rows that differ: [path, before, after]
const diffOf = (before, after) => {
  const a = leavesOf(before ?? {})
  const b = leavesOf(after ?? {})
  return [...new Set([...Object.keys(a), ...Object.keys(b)])]
    .filter((k) => a[k] !== b[k])
    .sort()
    .map((k) => [k, a[k], b[k]])
}

const Value = ({ v, strike }) =>
  v === undefined ? (
    <span className="text-body-tertiary">-</span>
  ) : (
    <span
      className={`font-monospace ${strike ? 'text-danger text-decoration-line-through' : 'text-success'}`}
    >
      {v}
    </span>
  )

const DiffTable = ({ rows }) => (
  <table className="small w-100 mb-0" style={{ tableLayout: 'fixed', wordBreak: 'break-word' }}>
    <tbody>
      {rows.map(([path, before, after]) => (
        <tr key={path} className="border-top">
          <td className="py-1 pe-2 font-monospace text-body-secondary" style={{ width: '35%' }}>
            {path}
          </td>
          <td className="py-1 pe-2">
            <Value v={before} strike />
          </td>
          <td className="py-1">
            <Value v={after} />
          </td>
        </tr>
      ))}
    </tbody>
  </table>
)

const Change = ({ proposal: p }) => {
  if (p.operation === 'config') {
    const rows = diffOf(p.before?.sections, p.payload.sections)
    return rows.length ? <DiffTable rows={rows} /> : <div className="small">No field changes.</div>
  }
  if (p.operation === 'grants') {
    // a person's access - their roles before and after (api access.propose)
    const rows = diffOf({ grants: p.before?.grants }, { grants: p.payload.grants })
    return rows.length ? <DiffTable rows={rows} /> : <div className="small">No change.</div>
  }
  if (p.operation === 'switch')
    return (
      <DiffTable
        rows={[
          [
            'status',
            JSON.stringify(p.before?.status ?? null),
            JSON.stringify(p.payload.action.toLowerCase()),
          ],
        ]}
      />
    )
  if (p.operation === 'command')
    return (
      <div className="small">
        Command <span className="font-monospace fw-semibold">{p.payload.action}</span>
        {Object.keys(p.payload.params ?? {}).length > 0 && (
          <DiffTable
            rows={Object.entries(leavesOf(p.payload.params)).map(([k, v]) => [k, undefined, v])}
          />
        )}
      </div>
    )
  return <DiffTable rows={Object.entries(leavesOf(p.payload)).map(([k, v]) => [k, undefined, v])} />
}

/** `onDecided(proposal)` - the proposal after a decision. */
const ProposalCard = ({ proposal: p, onDecided }) => {
  const canDecide = useCan()('ai.decide')
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState(null)
  const decide = (decision) => {
    setBusy(decision)
    setError(null)
    api
      .decideAiProposal(p.id, decision)
      .then((updated) => onDecided?.(updated))
      .catch((err) => setError(err.message))
      .finally(() => setBusy(null))
  }
  return (
    <div
      className="border rounded p-2 mb-2 bg-body"
      style={{ borderLeftWidth: '3px', borderLeftColor: `var(--cui-${STATUS_COLOR[p.status]})` }}
    >
      <div className="d-flex flex-wrap align-items-center gap-2 mb-1">
        <CBadge color="light" textColor="dark" className="border">
          {ACCESS_LABEL[p.access]}
        </CBadge>
        <span className="fw-semibold small">{p.summary}</span>
        <CBadge color={STATUS_COLOR[p.status]} className="ms-auto">
          {p.status}
        </CBadge>
      </div>
      {p.reason && <div className="small text-body-secondary mb-1">{p.reason}</div>}
      <Change proposal={p} />
      {p.status === 'pending' && !canDecide ? (
        <div className="small text-body-secondary mt-1">
          Waiting for a person with the right to decide.
        </div>
      ) : p.status === 'pending' ? (
        <div className="d-flex gap-2 mt-2 align-items-center">
          <CButton
            size="sm"
            color="success"
            disabled={Boolean(busy)}
            onClick={() => decide('accept')}
          >
            {busy === 'accept' && <CSpinner size="sm" className="me-1" />}Accept
          </CButton>
          <CButton
            size="sm"
            color="secondary"
            variant="outline"
            disabled={Boolean(busy)}
            onClick={() => decide('reject')}
          >
            {busy === 'reject' && <CSpinner size="sm" className="me-1" />}Reject
          </CButton>
          {error && <span className="small text-danger">{error}</span>}
        </div>
      ) : (
        <div className="small text-body-secondary mt-1">
          {p.status === 'rejected' ? 'Rejected' : p.status === 'failed' ? 'Failed' : 'Applied'}
          {p.decidedBy && ` by ${p.decidedBy.name}`}
          {p.decidedAt && `, ${formatSmartDateTime(p.decidedAt)}`}
          {p.error && <span className="text-danger"> - {p.error}</span>}
        </div>
      )}
    </div>
  )
}

export default ProposalCard
