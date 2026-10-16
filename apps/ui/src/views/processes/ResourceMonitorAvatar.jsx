import React from 'react'
import ResourceLevelsChart from './ResourceLevelsChart'
import { useResourceHistory } from './ResourceMonitorPanel'

// The Resource monitor's Dashboard avatar (dashboardRegistry.js `avatars`,
// 2026-10-16): only its live CPU / RAM / disk chart, filling the card's
// picture block.
const ResourceMonitorAvatar = ({ process }) => {
  const { history } = useResourceHistory(process)
  return (
    <div className="position-absolute" style={{ inset: '0.5rem' }}>
      <ResourceLevelsChart history={history} />
    </div>
  )
}

export default ResourceMonitorAvatar
