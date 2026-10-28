import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useSelector } from 'react-redux'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { CAlert, CBadge, CButton, CFormSelect, CFormTextarea, CSpinner } from '@coreui/react'
import CIcon from '@coreui/icons-react'
import { cilApps, cilArrowLeft, cilSend } from '@coreui/icons'
import { api, streamAiMessage } from '../../api/client'
import ProposalCard from '../../views/ai/ProposalCard'
import AiBrainIcon from '../AiBrainIcon'
import { workTypeIcon } from './workTypeIcons'

/**
 * One AI Assistant conversation (moved out of the messenger page 2026-10-24 - the page and the side
 * panel both show it): a new one starts with tiles (not in `compact` - the panel), the turns stream
 * in, the composer under them changes the topic on the way.
 *
 * - `entities`, `quickStart` - GET /ai/entities (useAiEntities);
 * - `conversationId` - the one to open, null - a new one;
 * - `subject` - what a new one is about ({ type, id, processId, label } - GET /ai/subject), with
 *   `preset` - its object and work type ({ entityKey, workType }); the start phrase names the
 *   subject;
 * - `onChange(conversation)` - after it was made, answered or its topic changed (the list reloads);
 * - `compact` - the side panel: no start tiles, `header` - what goes on top.
 */

// the assistant's face in the conversation - the AI's mark on the primary colour
const Avatar = () => (
  <div
    className="d-flex align-items-center justify-content-center flex-shrink-0 rounded-circle text-white"
    style={{
      width: '2rem',
      height: '2rem',
      background: 'var(--cui-primary)',
    }}
  >
    <AiBrainIcon size={20} still />
  </div>
)

// a work type's start phrase about something - "{name}" becomes its name: the thing the AI button
// was on (its label), a DNP instance (its name), the whole system
const startOf = (workType, about) => {
  const name = about?.label ?? (about?.processId === null ? 'the whole system' : about?.name)
  return (workType?.start ?? '').replaceAll('{name}', name ?? 'it')
}

// an object's picture: the whole system - the AI's mark, a DNP instance - its package's icon
const EntityIcon = ({ entity, size = 32 }) =>
  !entity || entity.processId === null ? (
    <AiBrainIcon size={size} still />
  ) : entity.iconPath ? (
    <img src={`/api${entity.iconPath}`} alt="" width={size} height={size} />
  ) : (
    <CIcon icon={cilApps} width={size} height={size} />
  )

// a package's kind as a group's name: "heating-control" -> "Heating control"
const kindName = (kind) => {
  const words = kind.replace(/-/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/** A tile of the start: the icon, the name under it. */
const Tile = ({ icon, label, hint, active, onClick }) => (
  <button
    type="button"
    className={`ai-tile${active ? ' active' : ''}`}
    title={hint ?? label}
    onClick={onClick}
  >
    <span className="ai-tile-icon">{icon}</span>
    <span className="ai-tile-label">{label}</span>
  </button>
)

const PAGE_CSS = `
.ai-tiles { display: flex; flex-wrap: wrap; gap: 10px; justify-content: center }
.ai-tile { width: 7.5rem; min-height: 6.25rem; padding: 10px 6px 8px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px;
  border: 1px solid var(--cui-border-color); border-radius: 10px; background: var(--cui-body-bg); color: var(--cui-body-color); cursor: pointer }
.ai-tile:hover, .ai-tile:focus-visible { border-color: var(--cui-primary); background: var(--cui-tertiary-bg) }
.ai-tile.active { border-color: var(--cui-primary); box-shadow: 0 0 0 1px var(--cui-primary) inset }
.ai-tile-icon { height: 32px; display: flex; align-items: center; justify-content: center }
/* the packages' Library icons are drawn dark - turned light in the dark theme */
[data-coreui-theme='dark'] .ai-tile-icon img { filter: invert(1) brightness(1.6) }
.ai-tile-label { font-size: .8rem; line-height: 1.2; text-align: center }
/* the objects a little further from the quick start (the user, 2026-10-24) */
.ai-quick + .ai-objects { margin-top: 28px }
.ai-group { font-size: .75rem; text-transform: uppercase; letter-spacing: .04em; color: var(--cui-secondary-color); text-align: center; margin: 14px 0 8px }
.ai-quick .ai-tile { width: 10rem; min-height: 0; flex-direction: row; text-align: left; padding: 8px 10px }
.ai-quick .ai-tile-label { text-align: left }
.ai-composer { display: grid; grid-template-columns: auto minmax(10rem, 15rem) minmax(0, 1fr) auto; gap: 8px; align-items: stretch }
.ai-composer-icon { width: 2.5rem; display: flex; align-items: center; justify-content: center; color: var(--cui-secondary-color) }
.ai-composer-selects { display: flex; flex-direction: column; gap: 4px; justify-content: center; min-width: 0 }
.ai-composer textarea { resize: none; height: 100% }
.ai-composer-send { height: 100%; min-width: 3.25rem }
@media (max-width: 767.98px) {
  .ai-composer { grid-template-columns: minmax(0, 1fr) auto }
  .ai-composer-icon { display: none }
  .ai-composer-selects { grid-column: 1 / -1; flex-direction: row }
}
/* the side panel: the composer as on a phone - the selects in a row above the message */
.ai-compact .ai-composer { grid-template-columns: minmax(0, 1fr) auto }
.ai-compact .ai-composer-icon { display: none }
.ai-compact .ai-composer-selects { grid-column: 1 / -1; flex-direction: row }
.ai-topic { display: flex; align-items: center; gap: 8px; color: var(--cui-secondary-color); font-size: .8rem; margin: 12px 0 }
.ai-topic::before, .ai-topic::after { content: ''; flex: 1; border-top: 1px dashed var(--cui-border-color) }
`

// the turns of a conversation: a user's message, then the assistant's steps - its tool calls with their results, its proposals, and its answer
function turnsOf(messages, proposals) {
  const turns = []
  for (const m of messages) {
    // the topic changed on the way - a divider of its own
    if (m.role === 'topic')
      turns.push({ topic: m, user: null, steps: [], proposals: [], answer: null })
    else if (m.role === 'user') turns.push({ user: m, steps: [], proposals: [], answer: null })
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
    const turn =
      turns.findLast((t) => !t.topic && (!t.user || t.user.createdAt <= p.createdAt)) ?? turns[0]
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

const AiConversation = ({
  entities,
  quickStart = [],
  conversationId = null,
  subject = null,
  preset = null,
  onChange = () => {},
  compact = false,
  header = null,
}) => {
  const [active, setActive] = useState(null) // the open conversation (with messages) or null - a new one
  const [draft, setDraft] = useState({ entityKey: '', workType: '' })
  const [step, setStep] = useState('entity') // a new conversation's tiles: the object, then its work type
  const [text, setText] = useState('')
  const [running, setRunning] = useState(null) // the agent's status while it answers
  const [error, setError] = useState(null)
  const bottom = useRef(null)
  const input = useRef(null)
  const isAdmin = useSelector((state) => state.user)?.roles?.includes('admin') ?? false
  // someone else's conversation (shared, another guest's) - read only; a scheduled run's - unless an admin
  const readOnly =
    (Boolean(active?.scheduled) && !isAdmin) || (active?.mine === false && !active?.scheduled)

  // the open conversation's id now - a conversation made here and then put in the address is not
  // loaded again (its answer may still be streaming in)
  const activeId = useRef(null)
  useEffect(() => {
    activeId.current = active?.id ?? null
  }, [active?.id])
  const entityOf = (key) => entities.find((e) => e.key === key)
  // a new conversation: its preset (the AI button) or the first object; the open one: loaded
  useEffect(() => {
    let off = false
    /* eslint-disable react-hooks/set-state-in-effect */
    setError(null)
    if (conversationId && conversationId === activeId.current) return undefined
    if (conversationId) {
      api
        .getAiConversation(conversationId)
        .then((c) => !off && setActive(c))
        .catch((err) => !off && setError(err.message))
    } else {
      setActive(null)
      setStep('entity')
      const entity = entities.find((e) => e.key === preset?.entityKey) ?? entities[0]
      const work = entity?.workTypes.find((w) => w.key === preset?.workType) ?? entity?.workTypes[0]
      setDraft({ entityKey: entity?.key ?? '', workType: work?.key ?? '' })
      setText(preset && work ? startOf(work, subject ?? entity) : '')
    }
    /* eslint-enable react-hooks/set-state-in-effect */
    return () => {
      off = true
    }
    // a new subject / conversation only - not every list refresh
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, subject?.type, subject?.id, preset?.entityKey, preset?.workType])
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [active?.messages?.length, running])

  const topic = active
    ? { entityKey: active.instanceKey, workType: active.workType }
    : { entityKey: draft.entityKey, workType: draft.workType }
  const shownEntity = entityOf(topic.entityKey)
  const shownWork = shownEntity?.workTypes.find((w) => w.key === topic.workType)
  // the thing it is about: the open conversation's, else the new one's
  const subjectShown = active ? active.subject : subject
  // the start phrase names the subject when there is one
  const named = subjectShown ?? shownEntity
  const turns = useMemo(() => turnsOf(active?.messages ?? [], active?.proposals ?? []), [active])
  // the whole system - first, then the DNP instances by their package
  const systemEntity = entities.find((e) => e.processId === null)
  const groups = useMemo(() => {
    const out = new Map()
    for (const e of entities) {
      if (e.processId === null) continue
      if (!out.has(e.kind)) out.set(e.kind, [])
      out.get(e.kind).push(e)
    }
    return [...out.entries()]
  }, [entities])
  const quickTiles = (systemEntity?.workTypes ?? []).filter((w) => quickStart.includes(w.key))

  // a conversation's proposals now (after a proposing tool ran, or a decision)
  const loadProposals = (id) =>
    api
      .listAiProposals({ conversationId: id, pageSize: 100 })
      .then((d) => setActive((c) => (c?.id === id ? { ...c, proposals: d.items } : c)))
      .catch((err) => setError(err.message))
  const replaceProposal = (p) =>
    setActive((c) => ({ ...c, proposals: c.proposals.map((x) => (x.id === p.id ? p : x)) }))

  // a topic picked - a new conversation's draft, or the open one's topic changed on the way; the
  // work type's start phrase in the message box when it holds nothing of the person's own
  const pickTopic = (entityKey, workType) => {
    const entity = entityOf(entityKey)
    const work = entity?.workTypes.find((w) => w.key === workType) ?? entity?.workTypes[0]
    if (!entity || !work) return
    const about = subjectShown ?? entity
    if (!text.trim() || text === startOf(shownWork, named)) setText(startOf(work, about))
    setTimeout(() => input.current?.focus(), 0)
    if (!active) {
      setDraft({ entityKey: entity.key, workType: work.key })
      return
    }
    setError(null)
    api
      .setAiConversationTopic(active.id, entity.key, work.key)
      .then((c) => {
        setActive(c)
        onChange(c)
      })
      .catch((err) => setError(err.message))
  }

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
            ...(subject && {
              subject: {
                type: subject.type,
                id: subject.id,
                processId: subject.processId,
                page: subject.page,
                view: subject.view,
              },
            }),
          })),
          messages: [],
          proposals: [],
        }
        activeId.current = conversation.id
        setActive(conversation)
        onChange(conversation)
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
      onChange(conversation)
    } catch (err) {
      setError(err.message)
    } finally {
      setRunning(null)
    }
  }

  const locked = Boolean(running) || readOnly
  const draftEntity = entityOf(draft.entityKey)

  return (
    <div
      className={`d-flex flex-column flex-grow-1${compact ? ' ai-compact' : ''}`}
      style={{ minWidth: 0, minHeight: 0 }}
    >
      <style>{ANSWER_CSS + PAGE_CSS}</style>
      {header}
      <div className="flex-grow-1 overflow-auto p-3">
        {entities.length === 0 && (
          <CAlert color="info">
            The assistant is off everywhere - choose a connection for an instance in Service -&gt;
            Config -&gt; AI.
          </CAlert>
        )}
        {!active && entities.length > 0 && !compact && (
          <div className="mx-auto py-3" style={{ maxWidth: '52rem' }}>
            <div className="text-center mb-3">
              <AiBrainIcon size={56} />
              <div className="fs-5 mt-1">Nexus Edge AI Assistant</div>
              <div className="small text-body-secondary">
                {step === 'entity'
                  ? 'What shall we talk about?'
                  : `${draftEntity?.name} - what shall we do?`}
              </div>
            </div>
            {step === 'entity' && quickTiles.length > 0 && (
              <>
                <div className="ai-group">Quick start</div>
                <div className="ai-tiles ai-quick">
                  {quickTiles.map((w) => (
                    <Tile
                      key={w.key}
                      icon={<CIcon icon={workTypeIcon(w.icon)} width={22} height={22} />}
                      label={w.title}
                      hint={w.description}
                      active={draft.entityKey === systemEntity.key && draft.workType === w.key}
                      onClick={() => pickTopic(systemEntity.key, w.key)}
                    />
                  ))}
                </div>
              </>
            )}
            {step === 'entity' && (
              // the objects: the system first, then the DNP instances by their package (the
              // tiles name them - no group titles, the user 2026-10-24)
              <div className="ai-tiles ai-objects">
                {[
                  ...(systemEntity ? [systemEntity] : []),
                  ...groups.flatMap(([, list]) => list),
                ].map((e) => (
                  <Tile
                    key={e.key}
                    icon={<EntityIcon entity={e} />}
                    label={e.processId === null ? 'Nexus Edge' : e.name}
                    hint={
                      e.processId === null ? 'The whole system' : `${e.name} - ${kindName(e.kind)}`
                    }
                    active={draft.entityKey === e.key}
                    onClick={() => {
                      setDraft({ entityKey: e.key, workType: '' })
                      setStep('work')
                    }}
                  />
                ))}
              </div>
            )}
            {step === 'work' && draftEntity && (
              <div className="ai-tiles">
                <Tile
                  icon={<CIcon icon={cilArrowLeft} width={26} height={26} />}
                  label="Back"
                  hint="Choose another object"
                  onClick={() => setStep('entity')}
                />
                {draftEntity.workTypes.map((w) => (
                  <Tile
                    key={w.key}
                    icon={<CIcon icon={workTypeIcon(w.icon)} width={26} height={26} />}
                    label={w.title}
                    hint={w.description}
                    active={draft.workType === w.key}
                    onClick={() => pickTopic(draftEntity.key, w.key)}
                  />
                ))}
              </div>
            )}
          </div>
        )}
        {turns.map((t, i) =>
          t.topic ? (
            <div key={i} className="ai-topic">
              Topic: {t.topic.content}
            </div>
          ) : (
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
          ),
        )}
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

      {subjectShown && (
        <div
          className="px-2 pt-2 small text-body-secondary text-truncate"
          title={subjectShown.label}
        >
          About: <span className="text-body fw-semibold">{subjectShown.label}</span>
        </div>
      )}
      {/* the composer: the topic's icon, the object and the work type, the message, Send */}
      <div className="p-2 border-top ai-composer">
        <div
          className="ai-composer-icon"
          title={
            shownEntity
              ? `${shownWork?.title ?? ''} - ${shownEntity.name}: ${shownEntity.connectionName}, ${active?.model ?? shownEntity.model}`
              : undefined
          }
        >
          {shownWork ? (
            <CIcon icon={workTypeIcon(shownWork.icon)} width={26} height={26} />
          ) : (
            <AiBrainIcon size={28} still />
          )}
        </div>
        <div className="ai-composer-selects">
          <CFormSelect
            size="sm"
            value={topic.entityKey}
            disabled={locked || entities.length === 0}
            onChange={(e) => {
              const entity = entityOf(e.target.value)
              if (!active) setStep('work')
              pickTopic(e.target.value, entity?.workTypes[0]?.key ?? '')
            }}
            aria-label="What to talk about"
            title="What to talk about - may change on the way"
          >
            {entities.map((e) => (
              <option key={e.key} value={e.key}>
                {e.name}
              </option>
            ))}
          </CFormSelect>
          <CFormSelect
            size="sm"
            value={topic.workType}
            disabled={locked || entities.length === 0}
            onChange={(e) => pickTopic(topic.entityKey, e.target.value)}
            aria-label="Work type"
            title="The work type - may change on the way"
          >
            {!topic.workType && <option value="">Choose the work...</option>}
            {(shownEntity?.workTypes ?? []).map((w) => (
              <option key={w.key} value={w.key}>
                {w.title}
              </option>
            ))}
          </CFormSelect>
        </div>
        <CFormTextarea
          ref={input}
          rows={2}
          value={text}
          placeholder={
            readOnly
              ? active?.scheduled
                ? 'A scheduled run - read only'
                : "Someone else's conversation - read only; start your own"
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
        />
        <CButton
          color="primary"
          className="ai-composer-send"
          onClick={send}
          disabled={
            !text.trim() ||
            Boolean(running) ||
            entities.length === 0 ||
            readOnly ||
            (!active && !draft.workType)
          }
          title="Send"
          aria-label="Send"
        >
          {running ? <CSpinner size="sm" /> : <CIcon icon={cilSend} />}
        </CButton>
      </div>
    </div>
  )
}

export default AiConversation
