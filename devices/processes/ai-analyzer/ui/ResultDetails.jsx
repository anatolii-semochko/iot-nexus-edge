import React from 'react'
import { CBadge } from '@coreui/react'

import { groupFound } from './foundGroups'

// Analysis result under an image (AGENTS.md section 82): the AI's text,
// found Target objects, and the request's own facts - status, model,
// latency and the tokens it consumed (stored and shown only, nothing
// counts or limits them - AGENTS_TO_DO.md 2026-09-26).
const ResultDetails = ({ result }) => {
  if (!result) return <div className="text-body-secondary small">Not analysed yet</div>
  const usage = result.usage
  return (
    <div className="small">
      {result.status === 'error' ? (
        <div className="text-danger mb-2">Analysis failed: {result.error}</div>
      ) : (
        <div className="fs-6 mb-2">{result.text}</div>
      )}
      {result.found?.length > 0 && (
        <div className="d-flex flex-wrap gap-1 mb-2">
          {groupFound(result.found).map(([name, count]) => (
            <CBadge key={name} color="danger">
              {count > 1 ? `${name} x${count}` : name}
            </CBadge>
          ))}
        </div>
      )}
      <div className="text-body-secondary d-flex flex-wrap gap-3">
        {result.model && <span>Model: {result.model}</span>}
        {result.latencyMs != null && <span>Latency: {(result.latencyMs / 1000).toFixed(1)} s</span>}
        {usage && (
          <span title={`input ${usage.inputTokens}, output ${usage.outputTokens}`}>
            Tokens: {usage.totalTokens} (in {usage.inputTokens} / out {usage.outputTokens})
          </span>
        )}
      </div>
    </div>
  )
}

export default ResultDetails
