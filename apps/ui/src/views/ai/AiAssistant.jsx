import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useSelector } from 'react-redux'
import { useNavigate, useParams } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { CAlert, CBadge, CButton, CCard, CFormSelect, CFormTextarea, CSpinner } from '@coreui/react'
import CIcon from '@coreui/icons-react'
import { cilPlus, cilSend, cilTrash } from '@coreui/icons'
import { api, streamAiMessage } from '../../api/client'
import { formatSmartDateTime } from '../../utils/format'
import ProposalCard from './ProposalCard'

/**
 * AI Assistant - the messenger (Nexus Edge AI Assistant, stage 5; nexus-edge-
 * aquarium AGENTS_TO_DO.md 2026-10-16/17). Left - your conversations;
 * right - the open one. A new conversation: pick the entity (the whole
 * system, or a DNP instance the assistant is on for - Service -> Config ->
 * AI) and the work type, then write. The answer streams in step by step
 * (api .../messages/stream): what the agent is doing now, then its answer
 * (Markdown); the tools it used fold under "Used tools" (each call's input
 * and result). Enter sends, Shift+Enter - a new line. What the agent
 * proposes to change (stage 6) - cards in its turn, Accept / Reject.
 * Scheduled runs (stage 7 - the calendar) are in everyone's list, marked;
 * an admin may continue one. `/ai-assistant/:conversationId` opens one (a
 * scheduled run's warning links here).
 */

// the assistant's mark - sparkles
export const SparklesIcon = ({ size = 18, className }) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <path d="M10 3.5l1.6 4.9 4.9 1.6-4.9 1.6L10 16.5l-1.6-4.9L3.5 10l4.9-1.6z" />
    <path d="M17.5 13.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" />
    <path d="M17.5 3.5l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6z" />
  </svg>
)

const Avatar = () => (
  <div
    className="d-flex align-items-center justify-content-center flex-shrink-0 rounded-circle text-white"
    style={{
      width: '2rem',
      height: '2rem',
      background: 'linear-gradient(135deg, var(--cui-primary), var(--cui-info))',
    }}
  >
    <SparklesIcon size={16} />
  </div>
)

// the turns of a conversation: a user's message, then the assistant's steps - its tool calls with their results, its proposals, and its answer
function turnsOf(messages, proposals) {
  const turns = []
  for (const m of messages) {
    if (m.role === 'user') turns.push({ user: m, steps: [], proposals: [], answer: null })
    else {
      const turn =
        turns[turns.length - 1] ??
        (turns.push({ user: null, steps: [], proposals: [], answer: null }),
        turns[turns.length - 1])
      if (m.role === 'assistant' && m.toolCalls?.length) {
        if (m.content) turn.steps.push({ note: m.content })
        m.toolCalls.forEach((c) => turn.steps.push({ call: c, result: null }))
      } else if (m.role === 'tool') {
        const step = turn.steps.find((s) => s.call?.id === m.toolCallId && !s.result)
        if (step) step.result = m
      } else if (m.role === 'assistant') turn.answer = m
    }
  }
  // a proposal - in the turn it was made in (the last one asked before it)
  for (const p of proposals) {
    const turn = turns.findLast((t) => !t.user || t.user.createdAt <= p.createdAt) ?? turns[0]
    turn?.proposals.push(p)
  }
  return turns
}

const argsOf = (input) =>
  Object.entries(input ?? {})
    .map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
    .join(', ')

const ToolSteps = ({ steps }) => {
  const [open, setOpen] = useState(false)
  const calls = steps.filter((s) => s.call)
  if (calls.length === 0) return null
  const names = [...new Set(calls.map((s) => s.call.name))]
  return (
    <div className="small mb-2">
      <button
        type="button"
        className="btn btn-link btn-sm p-0 text-body-secondary text-decoration-none"
        onClick={() => setOpen((o) => !o)}
      >
        {open ? '▾' : '▸'} Used tools: {names.join(', ')} ({calls.length})
      </button>
      {open && (
        <div className="mt-1 d-flex flex-column gap-1">
          {steps.map((s, i) =>
            s.note ? (
              <div key={i} className="text-body-secondary fst-italic">
                {s.note}
              </div>
            ) : (
              <div key={i} className="border rounded p-2 bg-body-tertiary">
                <div className="font-monospace">
                  {s.call.name}({argsOf(s.call.input)}){' '}
                  {s.result?.isError && (
                    <CBadge color="danger" className="ms-1">
                      error
                    </CBadge>
                  )}
                </div>
                {s.result && (
                  <pre
                    className="mb-0 mt-1"
                    style={{
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      maxHeight: '12rem',
                      overflow: 'auto',
                      fontSize: '0.75rem',
                    }}
                  >
                    {s.result.content}
                  </pre>
                )}
              </div>
            ),
          )}
        </div>
      )}
    </div>
  )
}

const Answer = ({ text }) => (
  <div className="ai-answer">
    <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
  </div>
)

// the answer's Markdown inside the page's look: compact, tables like the app's
const ANSWER_CSS = `
.ai-answer > :last-child { margin-bottom: 0; }
.ai-answer p, .ai-answer ul, .ai-answer ol { margin-bottom: 0.5rem; }
.ai-answer table { width: 100%; margin-bottom: 0.5rem; font-size: 0.875rem; border-collapse: collapse; }
.ai-answer th, .ai-answer td { border-bottom: 1px solid var(--cui-border-color); padding: 0.25rem 0.5rem; text-align: left; }
.ai-answer code { font-size: 0.85em; }
.ai-answer pre { background: var(--cui-tertiary-bg); padding: 0.5rem; border-radius: 0.375rem; white-space: pre-wrap; }
`

const AiAssistant = () => {
  const [entities, setEntities] = useState(null)
  const [conversations, setConversations] = useState([])
  const [active, setActive] = useState(null) // the open conversation (with messages) or null - a new one
  const [draft, setDraft] = useState({ entityKey: '', workType: '' })
  const [text, setText] = useState('')
  const [running, setRunning] = useState(null) // the agent's status while it answers
  const [error, setError] = useState(null)
  const bottom = useRef(null)
  const { conversationId } = useParams()
  const navigate = useNavigate()
  const isAdmin = useSelector((state) => state.user)?.roles?.includes('admin') ?? false
  // a scheduled run's conversation - read only unless an admin
  const readOnly = Boolean(active?.scheduled) && !isAdmin

  const loadConversations = () =>
    api
      .listAiConversations({ limit: 100 })
      .then((d) => setConversations(d.conversations))
      .catch((err) => setError(err.message))
  useEffect(() => {
    api
      .listAiEntities()
      .then((d) => {
        setEntities(d.entities)
        const first = d.entities[0]
        if (first) setDraft({ entityKey: first.key, workType: first.workTypes[0]?.key ?? '' })
      })
      .catch((err) => setError(err.message))
    loadConversations()
  }, [])
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [active?.messages?.length, running])

  const entityOf = (key) => entities?.find((e) => e.key === key)
  const draftEntity = entityOf(draft.entityKey)
  const shownEntity = active ? entityOf(active.instanceKey) : draftEntity
  const turns = useMemo(() => turnsOf(active?.messages ?? [], active?.proposals ?? []), [active])
  // a conversation's proposals now (after a proposing tool ran, or a decision)
  const loadProposals = (id) =>
    api
      .listAiProposals({ conversationId: id, pageSize: 100 })
      .then((d) => setActive((c) => (c?.id === id ? { ...c, proposals: d.items } : c)))
      .catch((err) => setError(err.message))
  const replaceProposal = (p) =>
    setActive((c) => ({ ...c, proposals: c.proposals.map((x) => (x.id === p.id ? p : x)) }))

  const open = (id) => {
    setError(null)
    api
      .getAiConversation(id)
      .then(setActive)
      .catch((err) => setError(err.message))
  }
  // opened by link
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (conversationId) open(Number(conversationId))
  }, [conversationId])
  const startNew = () => {
    setActive(null)
    setError(null)
    if (conversationId) navigate('/ai-assistant')
  }
  const remove = (id) =>
    api
      .deleteAiConversation(id)
      .then(() => {
        if (active?.id === id) startNew()
        loadConversations()
      })
      .catch((err) => setError(err.message))

  const send = async () => {
    const question = text.trim()
    if (!question || running) return
    setError(null)
    setRunning('starting')
    try {
      let conversation = active
      if (!conversation) {
        conversation = {
          ...(await api.startAiConversation({
            instanceKey: draft.entityKey,
            workType: draft.workType,
          })),
          messages: [],
          proposals: [],
        }
        setActive(conversation)
      }
      setText('')
      await streamAiMessage(conversation.id, question, (type, data) => {
        if (type === 'status') setRunning(data.text)
        else if (type === 'message') {
          setActive((c) => ({ ...c, messages: [...(c?.messages ?? []), data] }))
          if (data.role === 'tool' && data.toolName?.endsWith('_propose'))
            loadProposals(conversation.id)
        } else if (type === 'error') setError(data.error)
      })
      loadConversations()
    } catch (err) {
      setError(err.message)
    } finally {
      setRunning(null)
    }
  }

  if (!entities) return error ? <CAlert color="danger">{error}</CAlert> : <CSpinner size="sm" />

  return (
    <CCard
      className="mb-4 overflow-hidden"
      style={{ height: 'calc(100vh - 11rem)', minHeight: '28rem' }}
    >
      <style>{ANSWER_CSS}</style>
      <div className="d-flex h-100">
        {/* the conversations */}
        <div
          className="d-flex flex-column border-end bg-body-tertiary"
          style={{ width: '17rem', flexShrink: 0 }}
        >
          <div className="p-2 border-bottom">
            <CButton
              color="primary"
              className="w-100"
              onClick={startNew}
              disabled={Boolean(running)}
            >
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
                onClick={() => !running && navigate(`/ai-assistant/${c.id}`)}
                onKeyDown={(e) =>
                  e.key === 'Enter' && !running && navigate(`/ai-assistant/${c.id}`)
                }
                className={`px-3 py-2 border-bottom d-flex align-items-start gap-2 ${active?.id === c.id ? 'bg-body' : ''}`}
                style={{ cursor: 'pointer' }}
              >
                <div className="flex-grow-1" style={{ minWidth: 0 }}>
                  <div className="fw-semibold small text-truncate">
                    {c.scheduled && (
                      <CBadge color="info" className="me-1" title="A scheduled run (the calendar)">
                        scheduled
                      </CBadge>
                    )}
                    {c.title}
                  </div>
                  <div className="small text-body-secondary text-truncate">
                    {formatSmartDateTime(c.updated_at)}
                  </div>
                </div>
                {(!c.scheduled || isAdmin) && (
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

        {/* the conversation */}
        <div className="d-flex flex-column flex-grow-1" style={{ minWidth: 0 }}>
          <div className="d-flex flex-wrap align-items-center gap-2 p-2 border-bottom">
            <CFormSelect
              size="sm"
              style={{ width: 'auto', minWidth: '14rem' }}
              value={active ? active.instanceKey : draft.entityKey}
              disabled={Boolean(active) || Boolean(running)}
              onChange={(e) => {
                const entity = entityOf(e.target.value)
                setDraft({ entityKey: e.target.value, workType: entity?.workTypes[0]?.key ?? '' })
              }}
              aria-label="What to work on"
            >
              {entities.map((e) => (
                <option key={e.key} value={e.key}>
                  {e.name}
                </option>
              ))}
            </CFormSelect>
            <CFormSelect
              size="sm"
              style={{ width: 'auto', minWidth: '12rem' }}
              value={active ? active.workType : draft.workType}
              disabled={Boolean(active) || Boolean(running)}
              onChange={(e) => setDraft({ ...draft, workType: e.target.value })}
              aria-label="Work type"
            >
              {(shownEntity?.workTypes ?? []).map((w) => (
                <option key={w.key} value={w.key}>
                  {w.title}
                </option>
              ))}
            </CFormSelect>
            {shownEntity && (
              <span className="small text-body-secondary ms-auto">
                {shownEntity.connectionName} -{' '}
                <span className="font-monospace">{active?.model ?? shownEntity.model}</span>
              </span>
            )}
          </div>

          <div className="flex-grow-1 overflow-auto p-3">
            {entities.length === 0 && (
              <CAlert color="info">
                The assistant is off everywhere - choose a connection for an instance in Service
                -&gt; Config -&gt; AI.
              </CAlert>
            )}
            {!active && entities.length > 0 && (
              <div className="text-center text-body-secondary mt-5">
                <div className="mb-2 text-primary">
                  <SparklesIcon size={40} />
                </div>
                <div className="fs-5 text-body">Nexus Edge AI Assistant</div>
                <div className="small">
                  {draftEntity?.name} -{' '}
                  {draftEntity?.workTypes.find((w) => w.key === draft.workType)?.description}
                </div>
              </div>
            )}
            {turns.map((t, i) => (
              <div key={i} className="mb-3">
                {t.user && (
                  <div className="d-flex justify-content-end mb-2">
                    <div
                      className="px-3 py-2 rounded-3 bg-primary-subtle"
                      style={{ maxWidth: '75%', whiteSpace: 'pre-wrap' }}
                    >
                      {t.user.content}
                    </div>
                  </div>
                )}
                {(t.steps.length > 0 || t.proposals.length > 0 || t.answer) && (
                  <div className="d-flex gap-2">
                    <Avatar />
                    <div style={{ minWidth: 0, maxWidth: '85%' }}>
                      <ToolSteps steps={t.steps} />
                      {t.proposals.map((p) => (
                        <ProposalCard key={p.id} proposal={p} onDecided={replaceProposal} />
                      ))}
                      {t.answer && <Answer text={t.answer.content} />}
                    </div>
                  </div>
                )}
              </div>
            ))}
            {running && (
              <div className="d-flex align-items-center gap-2 text-body-secondary small">
                <Avatar />
                <CSpinner size="sm" />
                <span>{running}...</span>
              </div>
            )}
            {error && (
              <CAlert color="danger" className="mt-2">
                {error}
              </CAlert>
            )}
            <div ref={bottom} />
          </div>

          <div className="p-2 border-top d-flex gap-2 align-items-end">
            <CFormTextarea
              rows={2}
              value={text}
              placeholder={
                readOnly
                  ? 'A scheduled run - read only'
                  : entities.length
                    ? 'Ask the assistant... (Enter - send, Shift+Enter - a new line)'
                    : ''
              }
              disabled={entities.length === 0 || readOnly}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  send()
                }
              }}
              aria-label="Message"
              style={{ resize: 'none' }}
            />
            <CButton
              color="primary"
              onClick={send}
              disabled={!text.trim() || Boolean(running) || entities.length === 0 || readOnly}
              title="Send"
              aria-label="Send"
            >
              {running ? <CSpinner size="sm" /> : <CIcon icon={cilSend} />}
            </CButton>
          </div>
        </div>
      </div>
    </CCard>
  )
}

export default AiAssistant
