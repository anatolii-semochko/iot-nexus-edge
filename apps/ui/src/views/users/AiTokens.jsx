import React from 'react'
import { CFormInput, CFormLabel, CFormText } from '@coreui/react'
import CIcon from '@coreui/icons-react'
import { cilCheckAlt, cilX } from '@coreui/icons'

/**
 * The AI's tokens a day of an account or a role (2026-10-27 - api access/principal.ts): empty -
 * unlimited (a green check), 0 - the AI off (a red cross), a number - the limit. An account's and
 * its roles' - the strictest holds; of several roles - the most generous.
 */
// a mark's circle - as the avatars' active flag, a size that sits in a table's row
const Dot = ({ color, icon, title }) => (
  <span
    className={`d-inline-flex align-items-center justify-content-center rounded-circle bg-${color} text-white`}
    style={{ width: '1.25rem', height: '1.25rem' }}
    title={title}
  >
    <CIcon icon={icon} height={11} width={11} />
  </span>
)

export const AiTokensMark = ({ value }) => {
  if (value === null || value === undefined)
    return <Dot color="success" icon={cilCheckAlt} title="AI on, unlimited" />
  if (value === 0) return <Dot color="danger" icon={cilX} title="AI off" />
  return <span title="AI tokens a day">{value.toLocaleString()}</span>
}

/** The value from the field: '' - null (unlimited), else a whole number >= 0 (undefined - not valid). */
export const parseAiTokens = (text) => {
  const t = String(text ?? '').trim()
  if (t === '') return null
  const n = Number(t)
  return Number.isInteger(n) && n >= 0 ? n : undefined
}

export const AiTokensInput = ({ id, value, onChange, disabled }) => (
  <>
    <CFormLabel htmlFor={id}>AI tokens a day</CFormLabel>
    <CFormInput
      id={id}
      type="number"
      min={0}
      step={1000}
      placeholder="Unlimited"
      value={value ?? ''}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    />
    <CFormText>Empty - unlimited, 0 - the AI off.</CFormText>
  </>
)
