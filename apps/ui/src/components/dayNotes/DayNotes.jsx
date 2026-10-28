import React, { useCallback, useEffect, useState } from 'react'
import {
  CButton,
  CFormCheck,
  CFormInput,
  CFormLabel,
  CFormSelect,
  CModal,
  CModalBody,
  CModalFooter,
  CModalHeader,
  CModalTitle,
  CTable,
  CTableBody,
  CTableDataCell,
  CTableRow,
} from '@coreui/react'
import CIcon from '@coreui/icons-react'
import { cilPencil, cilPlus, cilTrash } from '@coreui/icons'
import { request } from 'src/api/client'
import { useCan } from 'src/access'

// A process's operational days' notes (the core's day_notes - api dayNotes.ts,
// iot AGENTS_TO_DO.md 2026-10-25): what is known about today and the days
// ahead - each panel its own: the Energy scene the plant's (an outage,
// maintenance), the Energy Ledger the logic (holidays, days off, a working
// weekend - its calendar writes the holidays; the day's description in
// words), a heating its own (maintenance, a room closed). Written by people
// here (processes.control on that process), by the AI (daynote.propose) and
// automatically. The ledger's plan weighs all of them; the AI sees today's
// and tomorrow's everywhere.

const RELOAD_MS = 5 * 60_000
const AHEAD_DAYS = 14
const KINDS = [
  [
    'outage',
    'Grid outage',
    'No grid in its window - the batteries charged ahead to carry the site',
  ],
  ['holiday', 'Holiday', 'A public holiday - the consumption as a day off'],
  ['day-off', 'Day off', 'Not a working day - the consumption as a day off'],
  ['workday', 'Working day', 'A working weekend - the consumption as a working day'],
  [
    'maintenance',
    'Maintenance',
    'Its units out in its window - no generation from them, less battery power',
  ],
  ['room-closed', 'Room closed', 'A room not in use - its fan coil may rest'],
  ['other', 'Other', 'For people and the AI'],
]
const KIND_LABEL = Object.fromEntries(KINDS.map(([k, l]) => [k, l]))
const KIND_COLOR = {
  outage: 'danger',
  holiday: 'info',
  'day-off': 'info',
  workday: 'warning',
  maintenance: 'warning',
  'room-closed': 'secondary',
  other: 'secondary',
}
const SOURCE_LABEL = { auto: 'calendar', ai: 'AI', user: 'person' }
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const plusDays = (day, n) =>
  new Date(Date.parse(`${day}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
const weekdayOf = (day) => new Date(`${day}T12:00:00Z`).getUTCDay()
const hhmm = (ms) =>
  new Date(ms).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
const toLocalInput = (ms) => {
  if (!ms) return ''
  const d = new Date(ms)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}
const dayLabel = (day, today) =>
  day === today
    ? 'Today'
    : day === plusDays(today, 1)
      ? 'Tomorrow'
      : new Date(`${day}T12:00:00Z`).toLocaleDateString(undefined, {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
          timeZone: 'UTC',
        })

/** Working or not - the notes first (as the ledger's notes.ts). */
const workingOf = (day, notes) => {
  const own = notes.filter((n) => n.day === day)
  const off = own.find((n) => n.kind === 'holiday' || n.kind === 'day-off')
  if (off) return false
  if (own.some((n) => n.kind === 'workday')) return true
  const w = weekdayOf(day)
  return w >= 1 && w <= 5
}

const Note = ({ n, units }) => (
  <span>
    <span className={`badge text-bg-${KIND_COLOR[n.kind]} me-2`}>{KIND_LABEL[n.kind]}</span>
    {(n.startsAt || n.endsAt) && (
      <span className="fw-semibold me-1">
        {n.startsAt ? hhmm(n.startsAt) : ''}-{n.endsAt ? hhmm(n.endsAt) : ''}
      </span>
    )}
    {n.text}
    {n.nodeIds?.length > 0 && (
      <span className="text-body-secondary">
        {' '}
        ({n.nodeIds.map((id) => units.find((u) => u.nodeId === id)?.name ?? `#${id}`).join(', ')})
      </span>
    )}
  </span>
)

const EMPTY = { day: '', kind: 'other', text: '', startsAt: '', endsAt: '', nodeIds: [] }

const NotesEditor = ({ processId, kinds, today, notes, units, onClose, onChanged }) => {
  const [form, setForm] = useState({ ...EMPTY, kind: kinds[0] ?? 'other', day: today })
  const [editing, setEditing] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const save = async () => {
    setError(null)
    setBusy(true)
    const body = {
      day: form.day,
      kind: form.kind,
      text: form.text,
      startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : null,
      endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null,
      nodeIds: form.kind === 'maintenance' || form.kind === 'room-closed' ? form.nodeIds : [],
    }
    try {
      await request(`/processes/${processId}/day-notes${editing ? `/${editing}` : ''}`, {
        method: editing ? 'PATCH' : 'POST',
        body: JSON.stringify(body),
      })
      setForm({ ...EMPTY, day: form.day })
      setEditing(null)
      onChanged()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }
  const remove = async (id) => {
    setError(null)
    try {
      await request(`/processes/${processId}/day-notes/${id}`, { method: 'DELETE' })
      onChanged()
    } catch (err) {
      setError(err.message)
    }
  }
  const edit = (n) => {
    setEditing(n.id)
    setForm({
      day: n.day,
      kind: n.kind,
      text: n.text,
      startsAt: toLocalInput(n.startsAt),
      endsAt: toLocalInput(n.endsAt),
      nodeIds: n.nodeIds ?? [],
    })
  }

  return (
    <CModal visible onClose={onClose} size="lg" alignment="center">
      <CModalHeader>
        <CModalTitle>Operational days</CModalTitle>
      </CModalHeader>
      <CModalBody>
        <p className="small text-body-secondary">
          What the plan must know about a day: an outage, a holiday, a working weekend, maintenance.
          The country&apos;s holidays come from the calendar; the AI adds what you tell it.
        </p>
        <CTable small hover className="mb-3">
          <CTableBody>
            {notes.length === 0 && (
              <CTableRow>
                <CTableDataCell className="text-body-secondary">No notes ahead.</CTableDataCell>
              </CTableRow>
            )}
            {notes.map((n) => (
              <CTableRow key={n.id}>
                <CTableDataCell className="text-nowrap">{dayLabel(n.day, today)}</CTableDataCell>
                <CTableDataCell>
                  <Note n={n} units={units} />
                  <div className="small text-body-secondary">
                    {SOURCE_LABEL[n.source]}
                    {n.by && n.source !== 'auto' ? ` - ${n.by}` : ''}
                  </div>
                </CTableDataCell>
                <CTableDataCell className="text-end text-nowrap">
                  <CButton size="sm" variant="ghost" title="Edit" onClick={() => edit(n)}>
                    <CIcon icon={cilPencil} />
                  </CButton>
                  <CButton
                    size="sm"
                    variant="ghost"
                    color="danger"
                    title={n.auto ? 'Dismiss (the calendar will not add it again)' : 'Delete'}
                    onClick={() => remove(n.id)}
                  >
                    <CIcon icon={cilTrash} />
                  </CButton>
                </CTableDataCell>
              </CTableRow>
            ))}
          </CTableBody>
        </CTable>

        <div className="fw-semibold mb-2">{editing ? 'Edit the note' : 'Add a note'}</div>
        <div
          className="d-grid gap-2"
          style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}
        >
          <div>
            <CFormLabel className="small mb-1">Day</CFormLabel>
            <CFormInput type="date" value={form.day} onChange={(e) => set('day', e.target.value)} />
          </div>
          <div>
            <CFormLabel className="small mb-1">Kind</CFormLabel>
            <CFormSelect value={form.kind} onChange={(e) => set('kind', e.target.value)}>
              {KINDS.filter(([k]) => kinds.includes(k)).map(([k, l, hint]) => (
                <option key={k} value={k} title={hint}>
                  {l}
                </option>
              ))}
            </CFormSelect>
          </div>
          <div>
            <CFormLabel className="small mb-1" title="Empty - the whole day">
              From (optional)
            </CFormLabel>
            <CFormInput
              type="datetime-local"
              value={form.startsAt}
              onChange={(e) => set('startsAt', e.target.value)}
            />
          </div>
          <div>
            <CFormLabel className="small mb-1" title="Empty - the whole day">
              To (optional)
            </CFormLabel>
            <CFormInput
              type="datetime-local"
              value={form.endsAt}
              onChange={(e) => set('endsAt', e.target.value)}
            />
          </div>
        </div>
        <CFormLabel className="small mb-1 mt-2">Description</CFormLabel>
        <CFormInput
          value={form.text}
          maxLength={500}
          placeholder="e.g. Grid works announced by the operator"
          onChange={(e) => set('text', e.target.value)}
        />
        {(form.kind === 'maintenance' || form.kind === 'room-closed') && units.length > 0 && (
          <div className="mt-2">
            <div className="small mb-1">Units out</div>
            <div className="d-flex flex-wrap gap-3">
              {units.map((u) => (
                <CFormCheck
                  key={u.nodeId}
                  id={`note-unit-${u.nodeId}`}
                  label={u.name}
                  checked={form.nodeIds.includes(u.nodeId)}
                  onChange={(e) =>
                    set(
                      'nodeIds',
                      e.target.checked
                        ? [...form.nodeIds, u.nodeId]
                        : form.nodeIds.filter((x) => x !== u.nodeId),
                    )
                  }
                />
              ))}
            </div>
          </div>
        )}
        {error && <div className="small text-danger mt-2">{error}</div>}
      </CModalBody>
      <CModalFooter>
        {editing && (
          <CButton
            color="secondary"
            variant="ghost"
            onClick={() => {
              setEditing(null)
              setForm({ ...EMPTY, day: today })
            }}
          >
            Cancel the edit
          </CButton>
        )}
        <CButton color="primary" disabled={busy || !form.day} onClick={save}>
          {editing ? 'Save' : 'Add'}
        </CButton>
      </CModalFooter>
    </CModal>
  )
}

/**
 * A process's day notes: today's, the next days'; its editor (processes.control on the process).
 * `kinds` - the kinds this panel writes; `units` - the units a maintenance / room-closed note may name
 * ({ nodeId, name }); `title` - the block's heading; `dayType` - today's weekday and working or not
 * (the ledger's - its holidays); `summary` - the day's description in words ({ text, source, conversationId }).
 */
const DayNotes = ({
  processId,
  kinds = ['other'],
  units = [],
  cardClass = 'card',
  title = 'Notes',
  dayType = false,
  summary = null,
}) => {
  const can = useCan()
  const [data, setData] = useState(null)
  const [editor, setEditor] = useState(false)
  const load = useCallback(() => {
    request(`/processes/${processId}/day-notes`)
      .then((d) => setData(d))
      .catch(() => setData(null))
  }, [processId])
  useEffect(() => {
    load()
    const t = setInterval(load, RELOAD_MS)
    return () => clearInterval(t)
  }, [load])
  if (!data) return null
  const { today, notes } = data
  const own = notes.filter((n) => n.day === today)
  const ahead = notes.filter((n) => n.day > today && n.day <= plusDays(today, AHEAD_DAYS))
  const control = can('processes.control', { process: processId })
  // nothing to show and nothing to do here - no block
  if (!own.length && !ahead.length && !summary && !dayType && !control) return null

  return (
    <div className={`${cardClass} p-3 d-flex flex-column gap-2`} aria-label={title}>
      <div className="d-flex align-items-baseline justify-content-between gap-2 flex-wrap">
        <div>
          <span className="fw-semibold">{title}</span>
          {dayType && (
            <span className="text-body-secondary ms-2">
              {WEEKDAYS[weekdayOf(today)]} -{' '}
              {workingOf(today, notes) ? 'a working day' : 'a day off'}
            </span>
          )}
        </div>
        {control && (
          <CButton
            size="sm"
            variant="ghost"
            title={`${title} - add, change`}
            onClick={() => setEditor(true)}
          >
            <CIcon icon={own.length || ahead.length ? cilPencil : cilPlus} className="me-1" />
            Notes
          </CButton>
        )}
      </div>
      {summary && (
        <div title={summary.source === 'ai' ? "The AI's day plan" : "The ledger's own (no AI)"}>
          <span
            className={`badge me-2 ${summary.source === 'ai' ? 'text-bg-primary' : 'text-bg-light border'}`}
          >
            {summary.source === 'ai' ? 'AI' : 'Plan'}
          </span>
          {summary.text}
          {summary.conversationId && (
            <a className="ms-2 small" href={`#/ai-assistant/${summary.conversationId}`}>
              details
            </a>
          )}
        </div>
      )}
      {own.map((n) => (
        <div key={n.id}>
          <Note n={n} units={units} />
        </div>
      ))}
      {!own.length && !summary && (
        <div className="small text-body-secondary">Nothing noted for today.</div>
      )}
      {ahead.length > 0 && (
        <div className="small text-body-secondary d-flex flex-column gap-1">
          {ahead.slice(0, 4).map((n) => (
            <div key={n.id}>
              <span className="me-2">{dayLabel(n.day, today)}:</span>
              <Note n={n} units={units} />
            </div>
          ))}
          {ahead.length > 4 && <div>+{ahead.length - 4} more</div>}
        </div>
      )}
      {editor && (
        <NotesEditor
          processId={processId}
          kinds={kinds}
          today={today}
          notes={notes}
          units={units}
          onClose={() => setEditor(false)}
          onChanged={load}
        />
      )}
    </div>
  )
}

export default DayNotes
