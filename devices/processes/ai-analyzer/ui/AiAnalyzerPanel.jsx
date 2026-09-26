import React, { useCallback, useEffect, useState } from 'react'
import { CTab, CTabList, CTabs } from '@coreui/react'

import { request } from 'src/api/client'
import { useProcessLiveState } from 'src/api/useLiveProcess'
import ImagesTab from './ImagesTab'
import LastImageTab from './LastImageTab'
import TargetsTab from './TargetsTab'

// AI Analyzer process panel (AGENTS.md section 82) - the process row's
// expand area: Last image / Images / Target objects.
const TABS = [
  { key: 'last', label: 'Last image' },
  { key: 'images', label: 'Images' },
  { key: 'targets', label: 'Target objects' },
]

const AiAnalyzerPanel = ({ process }) => {
  const [activeTab, setActiveTab] = useState('last')
  const live = useProcessLiveState(process.id)
  const metrics = live.metrics ?? process.metrics ?? {}
  const [targets, setTargets] = useState({ items: [], limit: 0 })

  const loadTargets = useCallback(
    () => request(`/ai-analyzer/${process.id}/targets`).then(setTargets),
    [process.id],
  )
  useEffect(() => {
    loadTargets().catch(() => {})
  }, [loadTargets])

  if (process.config.imageDeviceId === undefined) {
    return <div className="text-danger small">Process config has no imageDeviceId.</div>
  }

  return (
    <div className="mb-3">
      <CTabs activeItemKey={activeTab} onChange={setActiveTab}>
        <CTabList variant="tabs" className="mb-3">
          {TABS.map((tab) => (
            <CTab key={tab.key} itemKey={tab.key}>
              {tab.label}
            </CTab>
          ))}
        </CTabList>
      </CTabs>
      {activeTab === 'last' && <LastImageTab process={process} metrics={metrics} />}
      {activeTab === 'images' && (
        <ImagesTab process={process} metrics={metrics} targets={targets.items} />
      )}
      {activeTab === 'targets' && (
        <TargetsTab
          process={process}
          targets={targets.items}
          limit={targets.limit}
          onChanged={loadTargets}
        />
      )}
    </div>
  )
}

export default AiAnalyzerPanel
