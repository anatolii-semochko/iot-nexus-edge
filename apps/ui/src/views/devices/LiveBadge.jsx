import React from 'react'
import { CBadge } from '@coreui/react'
import { useLiveConnectionStatus } from '../../api/useLiveDevice'
import { t } from 'src/i18n'

/** Small indicator for the shared live WebSocket (apps/messaging-gateway, AGENTS.md section 9). */
const LiveBadge = () => {
  const connected = useLiveConnectionStatus()
  return (
    // align-middle (AGENTS_TO_DO.md, 2026-08-30) - a table cell's own
    // `vertical-align: middle` is what already keeps a row's own badges
    // centered against their sibling text; a plain CCardHeader has no
    // such default, so this badge sat at text baseline (slightly low
    // against the bold page title next to it) without this - same fix
    // IconButton.jsx/ResetFiltersButton.jsx already use for their own
    // icons next to text.
    <CBadge color={connected ? 'success' : 'secondary'} className="align-middle">
      {connected ? t('Live') : t('Live (reconnecting)')}
    </CBadge>
  )
}

export default LiveBadge
