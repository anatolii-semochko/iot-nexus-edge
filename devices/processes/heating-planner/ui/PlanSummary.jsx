import React, { useEffect, useState } from 'react'
import { request } from 'src/api/client'
import { packageT } from 'src/i18n'
// the package's words (its own locales/, then the core's)
const tr = packageT('heating-planner')

// The heating plan in a sentence (P4 - iot AGENTS_TO_DO.md 2026-10-29): the AI's Heating Plan today (its
// Summary line, a link to the conversation) over the planner's own (no AI) - as the Energy Ledger's
// day description.

const RELOAD_MS = 5 * 60_000

const PlanSummary = ({ processId, madeAt }) => {
  const [summary, setSummary] = useState(null)
  useEffect(() => {
    let cancelled = false
    const load = () =>
      request(`/heating-planner/${processId}/summary`)
        .then((d) => !cancelled && setSummary(d.text ? d : null))
        .catch(() => !cancelled && setSummary(null))
    load()
    const t = setInterval(load, RELOAD_MS)
    return () => {
      cancelled = true
      clearInterval(t)
    }
  }, [processId, madeAt])
  if (!summary) return null
  return (
    <div
      title={
        summary.source === 'ai'
          ? tr("The AI's heating plan today")
          : tr("The planner's own (no AI)")
      }
    >
      <span
        className={`badge me-2 ${summary.source === 'ai' ? 'text-bg-primary' : 'text-bg-light border'}`}
      >
        {summary.source === 'ai' ? 'AI' : tr('Plan')}
      </span>
      {summary.text}
      {summary.conversationId && (
        <a className="ms-2 small" href={`#/ai-assistant/${summary.conversationId}`}>
          {tr('details')}
        </a>
      )}
    </div>
  )
}

export default PlanSummary
