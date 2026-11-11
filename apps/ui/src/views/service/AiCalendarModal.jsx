import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  CAlert,
  CBadge,
  CButton,
  CFormInput,
  CFormSelect,
  CFormSwitch,
  CModal,
  CModalBody,
  CModalHeader,
  CModalTitle,
  CSpinner,
  CTable,
  CTableBody,
  CTableDataCell,
  CTableHead,
  CTableHeaderCell,
  CTableRow,
} from '@coreui/react'
import CIcon from '@coreui/icons-react'
import { cilMediaPlay, cilPlus, cilTrash } from '@coreui/icons'
import { api } from '../../api/client'
import { formatSmartDateTime } from '../../utils/format'
import { t } from 'src/i18n'

/**
 * An instance's calendar (Nexus Edge AI Assistant, stage 7 - api
 * ai/calendar.ts): its scheduled runs - each on / off, the work type (of
 * those its DNP / Nexus Edge declares in `scheduledTypes`), the repeat
 * (day / week + weekday / month + day / year + month and day / every N
 * hours from the time to the day's end - 2026-10-25; a day past a
 * shorter month's end - its last day), the local time. A run is a
 * conversation of its own (AI Assistant, marked "scheduled"); a problem it
 * finds - a warning of the "AI Assistant" process linked to it. Every
 * change is saved at once; "Run now" starts one out of turn.
 */

const REPEATS = [
  { value: 'day', label: t('Every day') },
  { value: 'week', label: t('Every week') },
  { value: 'month', label: t('Every month') },
  { value: 'year', label: t('Every year') },
  { value: 'hours', label: t('Every N hours') },
]
// 1 (Monday) first; the value - JS getDay (0 - Sunday)
const WEEKDAYS = [
  [1, t('Monday')],
  [2, t('Tuesday')],
  [3, t('Wednesday')],
  [4, t('Thursday')],
  [5, t('Friday')],
  [6, t('Saturday')],
  [0, t('Sunday')],
]
const MONTHS = [
  t('January'),
  t('February'),
  t('March'),
  t('April'),
  t('May'),
  t('June'),
  t('July'),
  t('August'),
  t('September'),
  t('October'),
  t('November'),
  t('December'),
]
const STATUS_COLOR = {
  running: 'info',
  ok: 'success',
  problem: 'warning',
  failed: 'danger',
  skipped: 'secondary',
}

// the fields a repeat needs, with defaults when switching to it
const forRepeat = (repeat, s) => ({
  repeat,
  weekday: repeat === 'week' ? (s.weekday ?? 1) : null,
  monthDay: repeat === 'month' || repeat === 'year' ? (s.monthDay ?? 1) : null,
  month: repeat === 'year' ? (s.month ?? 1) : null,
  everyHours: repeat === 'hours' ? (s.everyHours ?? 2) : null,
})

const DayFields = ({ s, onChange, label }) => {
  const sm = { size: 'sm', style: { width: 'auto' } }
  return (
    <div className="d-flex gap-1">
      {s.repeat === 'hours' && (
        <CFormSelect
          {...sm}
          value={s.everyHours ?? 2}
          onChange={(e) => onChange({ everyHours: Number(e.target.value) })}
          aria-label={t('{{label}} - every hours', { label })}
          title={t("From the time below every so many hours, to the day's end")}
        >
          {[1, 2, 3, 4, 6, 8, 12].map((h) => (
            <option key={h} value={h}>
              {t('every')} {h} h
            </option>
          ))}
        </CFormSelect>
      )}
      {s.repeat === 'week' && (
        <CFormSelect
          {...sm}
          value={s.weekday}
          onChange={(e) => onChange({ weekday: Number(e.target.value) })}
          aria-label={t('{{label}} - weekday', { label })}
        >
          {WEEKDAYS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </CFormSelect>
      )}
      {s.repeat === 'year' && (
        <CFormSelect
          {...sm}
          value={s.month}
          onChange={(e) => onChange({ month: Number(e.target.value) })}
          aria-label={t('{{label}} - month', { label })}
        >
          {MONTHS.map((l, i) => (
            <option key={l} value={i + 1}>
              {l}
            </option>
          ))}
        </CFormSelect>
      )}
      {(s.repeat === 'month' || s.repeat === 'year') && (
        <CFormSelect
          {...sm}
          value={s.monthDay}
          onChange={(e) => onChange({ monthDay: Number(e.target.value) })}
          aria-label={t('{{label}} - day', { label })}
          title={t("A day past a shorter month's end - its last day")}
        >
          {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </CFormSelect>
      )}
    </div>
  )
}

const AiCalendarModal = ({ instance, onClose }) => {
  const [schedules, setSchedules] = useState(null)
  const [error, setError] = useState(null)
  const load = () =>
    api
      .listAiSchedules(instance.key)
      .then((d) => setSchedules(d.schedules))
      .catch((err) => setError(err.message))
  useEffect(() => {
    load()
    // a run's status changes as it goes - refreshed while the calendar is open
    const timer = setInterval(load, 5000)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instance.key])

  const typeTitle = (key) => instance.workTypes.find((w) => w.key === key)?.title ?? key
  const replace = (saved) =>
    setSchedules((list) => list.map((x) => (x.id === saved.id ? saved : x)))
  const act = (promise) => {
    setError(null)
    return promise.catch((err) => setError(err.message))
  }
  const update = (s, changes) => act(api.updateAiSchedule(s.id, changes).then(replace))
  const add = () =>
    act(
      api
        .createAiSchedule({
          instanceKey: instance.key,
          workType: instance.scheduledTypes[0],
          repeat: 'day',
          time: '08:00',
        })
        .then((created) => setSchedules((list) => [...list, created])),
    )
  const remove = (s) =>
    act(
      api
        .deleteAiSchedule(s.id)
        .then(() => setSchedules((list) => list.filter((x) => x.id !== s.id))),
    )
  const runNow = (s) => act(api.runAiSchedule(s.id).then(load))

  return (
    <CModal visible size="xl" onClose={onClose}>
      <CModalHeader>
        <CModalTitle>
          {t('Calendar -')} {instance.name}
        </CModalTitle>
      </CModalHeader>
      <CModalBody>
        {error && (
          <CAlert color="danger" dismissible onClose={() => setError(null)}>
            {error}
          </CAlert>
        )}
        {instance.connectionId === null && (
          <CAlert color="warning">
            {t('The assistant is off for this instance (no connection) - its runs are skipped.')}
          </CAlert>
        )}
        {!schedules ? (
          <CSpinner size="sm" />
        ) : (
          <CTable small responsive className="align-middle">
            <CTableHead>
              <CTableRow>
                <CTableHeaderCell>{t('On')}</CTableHeaderCell>
                <CTableHeaderCell>{t('Work type')}</CTableHeaderCell>
                <CTableHeaderCell>{t('Repeat')}</CTableHeaderCell>
                <CTableHeaderCell>{t('Day')}</CTableHeaderCell>
                <CTableHeaderCell>{t('Time')}</CTableHeaderCell>
                <CTableHeaderCell>{t('Next')}</CTableHeaderCell>
                <CTableHeaderCell>{t('Last run')}</CTableHeaderCell>
                <CTableHeaderCell />
              </CTableRow>
            </CTableHead>
            <CTableBody>
              {schedules.length === 0 && (
                <CTableRow>
                  <CTableDataCell colSpan={8} className="text-body-secondary small">
                    {t('No scheduled run yet.')}
                  </CTableDataCell>
                </CTableRow>
              )}
              {schedules.map((s) => {
                const label = `${typeTitle(s.workType)} #${s.id}`
                return (
                  <CTableRow key={s.id}>
                    <CTableDataCell>
                      <CFormSwitch
                        checked={s.enabled}
                        onChange={(e) => update(s, { enabled: e.target.checked })}
                        aria-label={t('{{label}} - on', { label })}
                      />
                    </CTableDataCell>
                    <CTableDataCell>
                      <CFormSelect
                        size="sm"
                        value={s.workType}
                        onChange={(e) => update(s, { workType: e.target.value })}
                        aria-label={t('{{label}} - work type', { label })}
                      >
                        {instance.scheduledTypes.map((k) => (
                          <option key={k} value={k}>
                            {typeTitle(k)}
                          </option>
                        ))}
                      </CFormSelect>
                    </CTableDataCell>
                    <CTableDataCell>
                      <CFormSelect
                        size="sm"
                        value={s.repeat}
                        onChange={(e) => update(s, forRepeat(e.target.value, s))}
                        aria-label={t('{{label}} - repeat', { label })}
                      >
                        {REPEATS.map((r) => (
                          <option key={r.value} value={r.value}>
                            {r.label}
                          </option>
                        ))}
                      </CFormSelect>
                    </CTableDataCell>
                    <CTableDataCell>
                      <DayFields s={s} onChange={(c) => update(s, c)} label={label} />
                    </CTableDataCell>
                    <CTableDataCell>
                      <CFormInput
                        type="time"
                        size="sm"
                        defaultValue={s.time === '24:00' ? '00:00' : s.time}
                        key={s.updatedAt}
                        onBlur={(e) =>
                          e.target.value &&
                          e.target.value !== s.time &&
                          update(s, { time: e.target.value })
                        }
                        aria-label={t('{{label}} - time', { label })}
                        style={{ width: '7rem' }}
                      />
                    </CTableDataCell>
                    <CTableDataCell className="small text-nowrap">
                      {s.nextRunAt ? formatSmartDateTime(s.nextRunAt) : '-'}
                    </CTableDataCell>
                    <CTableDataCell className="small">
                      {s.lastStatus ? (
                        <>
                          <CBadge color={STATUS_COLOR[s.lastStatus]} className="me-1">
                            {s.lastStatus}
                          </CBadge>
                          {s.lastRunAt && formatSmartDateTime(s.lastRunAt)}
                          {s.lastConversationId && (
                            <>
                              {' - '}
                              <Link to={`/ai-assistant/${s.lastConversationId}`}>
                                {t('report')}
                              </Link>
                            </>
                          )}
                          {s.lastNote && (
                            <div
                              className="text-body-secondary text-truncate"
                              style={{ maxWidth: '16rem' }}
                              title={s.lastNote}
                            >
                              {s.lastNote}
                            </div>
                          )}
                        </>
                      ) : (
                        <span className="text-body-tertiary">{t('never')}</span>
                      )}
                    </CTableDataCell>
                    <CTableDataCell className="text-end text-nowrap">
                      <CButton
                        size="sm"
                        color="primary"
                        variant="ghost"
                        title={t('Run now')}
                        aria-label={t('{{label}} - run now', { label })}
                        disabled={s.lastStatus === 'running'}
                        onClick={() => runNow(s)}
                      >
                        {/* labelled - a bare play mark wasn't found (the user, 2026-10-25) */}
                        <CIcon icon={cilMediaPlay} className="me-1" />
                        {t('Run now')}
                      </CButton>
                      <CButton
                        size="sm"
                        color="danger"
                        variant="ghost"
                        title={t('Delete')}
                        aria-label={t('{{label}} - delete', { label })}
                        onClick={() => remove(s)}
                      >
                        <CIcon icon={cilTrash} />
                      </CButton>
                    </CTableDataCell>
                  </CTableRow>
                )
              })}
            </CTableBody>
          </CTable>
        )}
        <CButton size="sm" color="primary" variant="outline" onClick={add} disabled={!schedules}>
          <CIcon icon={cilPlus} className="me-1" /> {t('Add a scheduled run')}
        </CButton>
        <div className="small text-body-secondary mt-2">
          Times are the server&apos;s local time; a time the clock skips (daylight saving) runs
          right after the jump, a repeated one - once.
        </div>
      </CModalBody>
    </CModal>
  )
}

export default AiCalendarModal
