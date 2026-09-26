import React, { useEffect, useState } from 'react'
import { CSpinner } from '@coreui/react'

import { api, request } from 'src/api/client'
import BoxOverlay from './BoxOverlay'
import ResultDetails from './ResultDetails'

// Last image (AGENTS.md section 82): the newest stored image with its boxes
// and result. Refetched whenever the process reports a new analysis
// (live metrics `lastAnalyzedAt`), so it follows captures without polling.
const LastImageTab = ({ process, metrics }) => {
  const [entry, setEntry] = useState(undefined)
  const imageDeviceId = process.config.imageDeviceId

  useEffect(() => {
    let cancelled = false
    request(`/ai-analyzer/${process.id}/images?limit=1`)
      .then((page) => !cancelled && setEntry(page.items[0] ?? null))
      .catch(() => !cancelled && setEntry(null))
    return () => {
      cancelled = true
    }
  }, [process.id, metrics.lastAnalyzedAt])

  if (entry === undefined) return <CSpinner size="sm" />
  return (
    <div>
      {metrics.analyzing && (
        <div className="text-body-secondary small mb-2">
          <CSpinner size="sm" className="me-2" />
          Analysing a new image...
        </div>
      )}
      {!entry ? (
        <div className="text-body-secondary">No images yet</div>
      ) : (
        <div className="d-flex flex-wrap gap-3 align-items-start">
          <div style={{ position: 'relative', lineHeight: 0, maxWidth: '32rem', width: '100%' }}>
            <img
              src={api.deviceMediaUrl(imageDeviceId, entry.id)}
              alt=""
              style={{ width: '100%', borderRadius: '0.25rem' }}
            />
            <div style={{ position: 'absolute', inset: 0 }}>
              <BoxOverlay found={entry.json?.found} />
            </div>
          </div>
          <div style={{ minWidth: '16rem', flex: 1 }}>
            <div className="text-body-secondary small mb-1">
              {new Date(entry.createdAt).toLocaleString()}
            </div>
            <ResultDetails result={entry.json} />
          </div>
        </div>
      )}
    </div>
  )
}

export default LastImageTab
