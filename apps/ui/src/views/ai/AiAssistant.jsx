import React, { useEffect, useState } from 'react'
import { useSelector } from 'react-redux'
import { useNavigate, useParams } from 'react-router-dom'
import { CAlert, CBadge, CButton, CSpinner } from '@coreui/react'
import CIcon from '@coreui/icons-react'
import { cilList, cilPlus, cilStar, cilTrash } from '@coreui/icons'
import { api } from '../../api/client'
import { useCan } from '../../access'
import AiConversation from '../../components/ai/AiConversation'
import { useAiEntities } from '../../components/ai/useAiEntities'
import { formatSmartDateTime } from '../../utils/format'

/**
 * AI Assistant - the messenger (Nexus Edge AI Assistant, stage 5; nexus-edge-aquarium
 * AGENTS_TO_DO.md 2026-10-16/17; reworked 2026-10-24). Left - your conversations; right - the open
 * one (`components/ai/AiConversation` - the start by tiles, the turns, the composer). Scheduled runs
 * (the calendar) are in everyone's list, marked; an admin may continue one; a shared one (the star -
 * `ai.share`) is read only for all who may talk to its assistant, other guests' ones - for a guest when
 * the guest's settings make them public. `/ai-assistant/:conversationId` opens one. The page takes the whole
 * room under the header (routes.js `bleed`); on a phone the list hides behind a button.
 */

const PAGE_CSS = `
.ai-list { width: 17rem; flex-shrink: 0 }
.ai-list-toggle { display: none }
@media (max-width: 767.98px) {
  .ai-list { position: absolute; inset: 0 auto 0 0; width: min(20rem, 85vw); z-index: 5; background: var(--cui-body-bg); box-shadow: 0 0 18px rgba(0, 0, 0, .25) }
  .ai-list.closed { display: none !important }
  .ai-list-toggle { display: inline-flex }
}
`

const AiAssistant = () => {
  const { data, error: entitiesError } = useAiEntities()
  const [conversations, setConversations] = useState([])
  const [listOpen, setListOpen] = useState(false) // a phone's list
  const [fresh, setFresh] = useState(0) // a new conversation asked for again - the start anew
  const [error, setError] = useState(null)
  const { conversationId } = useParams()
  const navigate = useNavigate()
  const isAdmin = useSelector((state) => state.user)?.roles?.includes('admin') ?? false
  // sharing one's conversation (2026-10-27): read only for all who may talk to its assistant
  const mayShare = useCan()('ai.share')

  const loadConversations = () =>
    api
      .listAiConversations({ limit: 100 })
      .then((d) => setConversations(d.conversations))
      .catch((err) => setError(err.message))
  useEffect(() => {
    loadConversations()
  }, [])

  const openId = conversationId ? Number(conversationId) : null
  const startNew = () => {
    setListOpen(false)
    setFresh((n) => n + 1)
    if (conversationId) navigate('/ai-assistant')
  }
  const remove = (id) =>
    api
      .deleteAiConversation(id)
      .then(() => {
        if (openId === id) startNew()
        loadConversations()
      })
      .catch((err) => setError(err.message))
  // a conversation made, answered or moved to another topic - the list anew, its address
  const changed = (c) => {
    loadConversations()
    if (c?.id && c.id !== openId) navigate(`/ai-assistant/${c.id}`, { replace: !openId })
  }

  if (!data)
    return entitiesError ? <CAlert color="danger">{entitiesError}</CAlert> : <CSpinner size="sm" />

  return (
    <div className="d-flex flex-grow-1 position-relative" style={{ minHeight: 0 }}>
      <style>{PAGE_CSS}</style>
      {/* the conversations */}
      <div className={`ai-list d-flex flex-column border-end${listOpen ? '' : ' closed'}`}>
        <div className="p-2 border-bottom">
          <CButton color="primary" className="w-100" onClick={startNew}>
            <CIcon icon={cilPlus} className="me-1" /> New conversation
          </CButton>
        </div>
        <div className="flex-grow-1 overflow-auto">
          {conversations.length === 0 && (
            <div className="small text-body-secondary p-3">No conversation yet.</div>
          )}
          {conversations.map((c) => (
            <div
              key={c.id}
              role="button"
              tabIndex={0}
              onClick={() => {
                setListOpen(false)
                navigate(`/ai-assistant/${c.id}`)
              }}
              onKeyDown={(e) => e.key === 'Enter' && navigate(`/ai-assistant/${c.id}`)}
              className={`px-3 py-2 border-bottom d-flex align-items-start gap-2 ${openId === c.id ? 'bg-body-tertiary' : ''}`}
              style={{ cursor: 'pointer' }}
            >
              <div className="flex-grow-1" style={{ minWidth: 0 }}>
                <div className="fw-semibold small text-truncate">
                  {c.scheduled && (
                    <CBadge color="info" className="me-1" title="A scheduled run (the calendar)">
                      scheduled
                    </CBadge>
                  )}
                  {c.shared && (
                    <CBadge
                      color="success"
                      className="me-1"
                      title="Shared - read only for all who may talk to its assistant"
                    >
                      shared
                    </CBadge>
                  )}
                  {!c.mine && !c.scheduled && !c.shared && c.guest && (
                    <CBadge color="secondary" className="me-1" title="Another guest's - read only">
                      guest
                    </CBadge>
                  )}
                  {c.title}
                </div>
                <div className="small text-body-secondary text-truncate">
                  {formatSmartDateTime(c.updated_at)}
                </div>
              </div>
              {mayShare && c.mine && !c.guest && !c.scheduled && (
                <button
                  type="button"
                  className={`btn btn-link btn-sm p-0 ${c.shared ? 'text-success' : 'text-body-tertiary'}`}
                  title={c.shared ? 'Shared - stop sharing' : 'Share (read only for others)'}
                  aria-label={`${c.shared ? 'Stop sharing' : 'Share'}: ${c.title}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    api
                      .setAiConversationShared(c.id, !c.shared)
                      .then(loadConversations)
                      .catch((err) => setError(err.message))
                  }}
                >
                  <CIcon icon={cilStar} size="sm" />
                </button>
              )}
              {(c.scheduled ? isAdmin : c.mine) && (
                <button
                  type="button"
                  className="btn btn-link btn-sm p-0 text-body-tertiary"
                  title="Delete"
                  aria-label={`Delete ${c.title}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    remove(c.id)
                  }}
                >
                  <CIcon icon={cilTrash} size="sm" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      <AiConversation
        key={fresh}
        entities={data.entities}
        quickStart={data.quickStart}
        conversationId={openId}
        onChange={changed}
        header={
          <div className="ai-list-toggle align-items-center gap-2 p-2 border-bottom">
            <CButton
              color="secondary"
              variant="outline"
              size="sm"
              onClick={() => setListOpen((o) => !o)}
              aria-expanded={listOpen}
            >
              <CIcon icon={cilList} className="me-1" /> Conversations
            </CButton>
            {error && <span className="small text-danger">{error}</span>}
          </div>
        }
      />
    </div>
  )
}

export default AiAssistant
