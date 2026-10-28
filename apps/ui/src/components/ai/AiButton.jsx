import React from 'react'
import { CButton } from '@coreui/react'
import { useCan } from '../../access'
import AiBrainIcon from '../AiBrainIcon'
import { ICON_BUTTON_WIDTH } from '../IconButton'
import { useAiPanel } from './AiPanel'
import { useAiEntities } from './useAiEntities'

/**
 * The AI button (2026-10-24, the user's images/ai-brain.png): the AI's mark that opens the side
 * panel on a thing - `subject` { type: node | device | process | message | card, id, processId? }
 * (`processId` - the process the thing is shown in, when known); `label` - its name for the title.
 * Shown to those who may use the assistant (`ai.use`) when it is on anywhere. Its click does not
 * reach the row / card / header under it. `action` - a table row's action: an outline button the
 * size of the row's other IconButtons - its mark still (it turns only before a page's / popup's title).
 */
const Inner = ({ subject, label, size, className, action }) => {
  const { data } = useAiEntities()
  const { open } = useAiPanel()
  if (!data?.entities?.length) return null
  const title = `Ask the AI${label ? ` about ${label}` : ''}`
  const click = (e) => {
    e.preventDefault()
    e.stopPropagation()
    open(subject)
  }
  if (action)
    return (
      <CButton
        size="sm"
        color="secondary"
        variant="outline"
        className={className}
        style={{ width: ICON_BUTTON_WIDTH }}
        title={title}
        aria-label={title}
        onClick={click}
      >
        {/* as IconButton's CIcon: 1rem, align-middle - the button's height from its line-height */}
        <AiBrainIcon size={16} className="align-middle" still />
      </CButton>
    )
  return (
    <button
      type="button"
      className={`ai-btn ${className}`}
      title={title}
      aria-label={title}
      onClick={click}
    >
      <AiBrainIcon size={size} />
    </button>
  )
}

const AiButton = ({ subject, label, size = 18, className = '', action = false }) => {
  const can = useCan()
  if (!subject || !can('ai.use')) return null
  return <Inner subject={subject} label={label} size={size} className={className} action={action} />
}

export default AiButton
