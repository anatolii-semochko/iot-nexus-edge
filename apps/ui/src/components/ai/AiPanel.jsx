import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { CAlert, CButton, CCloseButton, CSpinner } from '@coreui/react'
import { api } from '../../api/client'
import AiBrainIcon from '../AiBrainIcon'
import AiConversation from './AiConversation'
import { useAiEntities } from './useAiEntities'

/**
 * The AI Assistant's side panel (2026-10-24): the AI button on a thing - a node, a device, a
 * process, a WEM message, a Dashboard card - opens it on the right, over everything (a unit's popup
 * stays seen and usable beside it). The assistant's object and work type come from the thing
 * (GET /ai/subject), the start phrase names it - one click on Send; the conversation is a normal
 * one (the messenger's list; "Open in AI Assistant"). `useAiPanel().open({ type, id, processId? })`;
 * a page's title - `{ type: 'page', page }` (2026-10-25).
 * What the person is looking at - the page's tab / sub-tab, a popup's tab - goes with the subject
 * (`view`, told to the model): read from the open popup's / the page's active tabs and sub-tabs at
 * the click (`viewOnScreen`), or declared by a view with `useAiView('Logs > Messages')` (wins).
 */

/** What the person is looking at: the active tabs / sub-tabs of the open popup, else of the page. */
const viewOnScreen = () => {
  const modals = [...document.querySelectorAll('.modal.show')]
  const root = modals[modals.length - 1] ?? document.querySelector('.wrapper') ?? document.body
  const seen = new Set()
  const names = [...root.querySelectorAll('.nav-link.active, [role="tab"][aria-selected="true"]')]
    .filter((x) => x.offsetParent !== null && !x.closest('.sidebar'))
    .map((x) => (x.getAttribute('title') || x.textContent || '').replace(/\s+/g, ' ').trim())
    .filter((x) => x && !seen.has(x) && seen.add(x))
  return names.length ? `${modals.length ? 'a popup - ' : ''}the tab ${names.join(' > ')}` : null
}

const AiPanelContext = createContext({ open: () => {}, setView: () => {} })
export const useAiPanel = () => useContext(AiPanelContext)

/** Declares what the person is looking at while mounted (the latest declared wins - a popup over its page). */
export const useAiView = (view) => {
  const { setView } = useContext(AiPanelContext)
  useEffect(() => {
    if (!view) return undefined
    return setView(view)
  }, [view, setView])
}

const PANEL_CSS = `
.ai-panel { position: fixed; top: 0; right: 0; bottom: 0; width: min(30rem, 100vw); z-index: 1070;
  display: flex; flex-direction: column; background: var(--cui-body-bg); color: var(--cui-body-color);
  border-left: 1px solid var(--cui-border-color); box-shadow: -8px 0 24px rgba(0, 0, 0, .18) }
.ai-panel-head { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-bottom: 1px solid var(--cui-border-color) }
`

const Panel = ({ request, onClose }) => {
  const { data, error: entitiesError } = useAiEntities()
  const [conversationId, setConversationId] = useState(null)
  const navigate = useNavigate()
  const { resolved } = request
  const openPage = () => {
    onClose()
    navigate(conversationId ? `/ai-assistant/${conversationId}` : '/ai-assistant')
  }
  return (
    <aside className="ai-panel" aria-label="AI Assistant">
      <style>{PANEL_CSS}</style>
      <div className="ai-panel-head">
        <AiBrainIcon size={28} />
        <div className="flex-grow-1" style={{ minWidth: 0 }}>
          <div className="fw-semibold">AI Assistant</div>
          <div className="small text-body-secondary text-truncate">
            {resolved?.subject?.label ?? ' '}
          </div>
        </div>
        <CButton color="link" size="sm" className="text-nowrap" onClick={openPage}>
          Open in AI Assistant
        </CButton>
        <CCloseButton onClick={onClose} aria-label="Close the AI Assistant" />
      </div>
      {!resolved || (!data && !entitiesError) ? (
        <div className="p-3">
          <CSpinner size="sm" />
        </div>
      ) : resolved.error || entitiesError ? (
        <CAlert color="warning" className="m-3">
          {resolved.error ?? entitiesError}
        </CAlert>
      ) : (
        <AiConversation
          compact
          entities={data.entities}
          quickStart={data.quickStart}
          conversationId={conversationId}
          subject={resolved.subject}
          preset={{ entityKey: resolved.instanceKey, workType: resolved.workType }}
          onChange={(c) => c?.id && setConversationId(c.id)}
        />
      )}
    </aside>
  )
}

/** Gives the pages `useAiPanel()` and shows the panel when asked (DefaultLayout). */
export const AiPanelProvider = ({ children }) => {
  // { seq, resolved } - one opening of the panel; null - closed
  const [request, setRequest] = useState(null)
  const seq = useRef(0)
  // the declared views, the latest last (useAiView)
  const views = useRef([])
  const setView = useCallback((view) => {
    const entry = { view }
    views.current = [...views.current, entry]
    return () => {
      views.current = views.current.filter((x) => x !== entry)
    }
  }, [])
  const open = useCallback((subject) => {
    const mine = ++seq.current
    setRequest({ seq: mine, resolved: null })
    const view = subject.view ?? views.current[views.current.length - 1]?.view ?? viewOnScreen()
    api
      .getAiSubject({ ...subject, view })
      .then((resolved) => seq.current === mine && setRequest({ seq: mine, resolved }))
      .catch(
        (err) =>
          seq.current === mine && setRequest({ seq: mine, resolved: { error: err.message } }),
      )
  }, [])
  const close = useCallback(() => {
    seq.current++
    setRequest(null)
  }, [])
  const value = useMemo(() => ({ open, close, setView }), [open, close, setView])
  return (
    <AiPanelContext.Provider value={value}>
      {children}
      {request &&
        createPortal(<Panel key={request.seq} request={request} onClose={close} />, document.body)}
    </AiPanelContext.Provider>
  )
}
