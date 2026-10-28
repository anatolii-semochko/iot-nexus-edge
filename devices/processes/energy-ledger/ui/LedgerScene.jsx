import React, { useEffect, useMemo, useState } from 'react'
import {
  CButton,
  CButtonGroup,
  CSpinner,
  CTable,
  CTableBody,
  CTableDataCell,
  CTableHead,
  CTableHeaderCell,
  CTableRow,
} from '@coreui/react'
import { request } from 'src/api/client'
import KeyValue from 'src/components/KeyValue'
import StatTile from 'src/components/StatTile'
import AccountsView from './AccountsView'
import DayNotes from 'src/components/dayNotes/DayNotes'
import AiButton from 'src/components/ai/AiButton'
import TenantsView from './TenantsView'
import DayReview from './DayReview'
import PlanView from './PlanView'
import SavingsBridge from './SavingsBridge'

// The Energy Ledger - the user's view (Dashboard component and the process
// row's panel; the reviewed mockup 2026-10-20 + the user's wish "see the
// savings plainly"): a day / a month / a year - the savings bridge from
// "without the system" to what was really paid (EUR or kWh), the saving in
// big figures, the key figures; a month - the calendar of the days' savings
// and their table; a year - its months; who the energy was for (the cost
// accounts - private, business, tenants). The plan (L2) - its own view.

const RELOAD_MS = 60_000
const STRATEGY_LABELS = {
  cost: 'Least cost',
  selfSufficiency: 'Self-sufficiency',
  reserve: 'Reserve',
  peakShaving: 'Peak shaving',
  sales: 'Sales',
}
const PERIODS = [
  ['day', 'Day', 'One day'],
  ['month', 'Month', 'The month - its days in a calendar'],
  ['year', 'Year', 'The year - its months'],
]

const pad = (n) => String(n).padStart(2, '0')
const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const shift = (iso, period, by) => {
  const d = new Date(`${iso}T12:00:00`)
  if (period === 'day') d.setDate(d.getDate() + by)
  else if (period === 'month') d.setMonth(d.getMonth() + by, 1)
  else d.setFullYear(d.getFullYear() + by, 0, 1)
  return isoOf(d)
}
const eur = (v, d = 2) =>
  v === null || v === undefined
    ? '-'
    : `${Number(v).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d })} €`
const num = (v, d = 0) =>
  v === null || v === undefined
    ? '-'
    : Number(v).toLocaleString(undefined, { maximumFractionDigits: d })

const titleOf = (period, iso) => {
  const d = new Date(`${iso}T12:00:00`)
  if (period === 'day')
    return d.toLocaleDateString(undefined, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  if (period === 'month') return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
  return String(d.getFullYear())
}

const Kpi = StatTile

/** The month's calendar: each day coloured by its saving, its figure in the cell; a click opens the day. */
const MonthCalendar = ({ monthIso, days, onPick }) => {
  const first = new Date(`${monthIso.slice(0, 8)}01T12:00:00`)
  const lead = (first.getDay() + 6) % 7 // Monday first
  const count = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()
  const byDay = Object.fromEntries(days.map((d) => [d.day, d]))
  const max = Math.max(1, ...days.map((d) => d.kpis.savedEur ?? 0))
  const cells = []
  for (let i = 0; i < lead; i++) cells.push(<div key={`l${i}`} />)
  for (let n = 1; n <= count; n++) {
    const iso = `${monthIso.slice(0, 8)}${pad(n)}`
    const d = byDay[iso]
    const saved = d?.kpis.savedEur
    const share = saved ? Math.max(0.12, Math.min(1, saved / max)) : 0
    cells.push(
      <button
        key={iso}
        type="button"
        disabled={!d}
        onClick={() => onPick(iso)}
        title={
          d
            ? `${iso}: saved ${eur(saved)}, paid ${eur(-d.kpis.netEur)}${d.partial ? ' (recorded from the ledger start)' : ''}`
            : `${iso}: not recorded`
        }
        className="border rounded text-start p-1"
        style={{
          minHeight: 54,
          background: d ? `rgba(31, 157, 99, ${share * 0.55})` : 'transparent',
          cursor: d ? 'pointer' : 'default',
          color: 'var(--cui-body-color)',
        }}
      >
        <div className="small text-body-secondary">{n}</div>
        {d && <div className="small fw-semibold">{eur(saved, 0)}</div>}
      </button>,
    )
  }
  return (
    <div>
      <div
        className="d-grid small text-body-secondary mb-1"
        style={{ gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 4 }}
      >
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((w) => (
          <div key={w} className="text-center">
            {w}
          </div>
        ))}
      </div>
      <div className="d-grid" style={{ gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 4 }}>
        {cells}
      </div>
    </div>
  )
}

const JournalView = ({ process }) => {
  const [period, setPeriod] = useState('day')
  // null - the ledger's today (its time zone - the API's answer says which day)
  const [day, setDay] = useState(null)
  const [unit, setUnit] = useState('eur')
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  useEffect(() => {
    let cancelled = false
    const load = () =>
      request(`/energy-ledger/${process.id}/period?period=${period}${day ? `&day=${day}` : ''}`)
        .then((d) => {
          if (cancelled) return
          setData(d)
          setError(null)
        })
        .catch((err) => !cancelled && setError(err.message))
    load()
    const timer = setInterval(load, RELOAD_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [process.id, period, day])

  // a year - its months summed from the days
  const months = useMemo(() => {
    if (period !== 'year' || !data) return []
    const by = {}
    for (const d of data.days) {
      const m = d.day.slice(0, 7)
      by[m] ??= { month: m, saved: 0, paid: 0, load: 0, own: 0, days: 0 }
      by[m].saved += d.kpis.savedEur ?? 0
      by[m].paid += -(d.kpis.netEur ?? 0)
      by[m].load += d.record.loadKwh
      by[m].own += d.record.pvKwh + d.record.windKwh
      by[m].days += 1
    }
    return Object.values(by)
  }, [period, data])

  const total = data?.total
  const k = total?.kpis ?? {}
  const rec = total?.record ?? {}
  const shown = day ?? data?.day
  const isToday = day === null || day === data?.today

  return (
    <div className="d-flex flex-column gap-3">
      <div className="d-flex align-items-center justify-content-between flex-wrap gap-2">
        <div className="d-flex align-items-center gap-2 flex-wrap">
          <CButtonGroup size="sm" role="group" aria-label="The period">
            {PERIODS.map(([key, label, hint]) => (
              <CButton
                key={key}
                color="primary"
                variant={period === key ? undefined : 'outline'}
                title={hint}
                onClick={() => setPeriod(key)}
              >
                {label}
              </CButton>
            ))}
          </CButtonGroup>
          <CButtonGroup size="sm" role="group" aria-label="Browse">
            <CButton
              color="secondary"
              variant="outline"
              title={`The previous ${period}`}
              aria-label={`The previous ${period}`}
              onClick={() => shown && setDay(shift(shown, period, -1))}
            >
              ‹
            </CButton>
            <CButton
              color="secondary"
              variant="outline"
              disabled={isToday}
              title="Back to today"
              onClick={() => setDay(null)}
            >
              Today
            </CButton>
            <CButton
              color="secondary"
              variant="outline"
              title={`The next ${period}`}
              aria-label={`The next ${period}`}
              onClick={() => shown && setDay(shift(shown, period, 1))}
            >
              ›
            </CButton>
          </CButtonGroup>
          <span className="fw-semibold">{shown ? titleOf(period, shown) : ''}</span>
        </div>
        <CButtonGroup size="sm" role="group" aria-label="Money or energy">
          <CButton
            color="secondary"
            variant={unit === 'eur' ? undefined : 'outline'}
            title="The bridge in euros"
            onClick={() => setUnit('eur')}
          >
            EUR
          </CButton>
          <CButton
            color="secondary"
            variant={unit === 'kwh' ? undefined : 'outline'}
            title="The bridge in kilowatt-hours"
            onClick={() => setUnit('kwh')}
          >
            kWh
          </CButton>
        </CButtonGroup>
      </div>

      {error && <div className="text-danger small">{error}</div>}
      {!data && !error && <CSpinner size="sm" />}
      {data && data.days.length === 0 && (
        <div className="text-body-secondary small">
          Nothing recorded in this {period} - the ledger records from its start on.
        </div>
      )}

      {data && data.days.length > 0 && (
        <>
          <section className="border rounded p-3" aria-label="The savings">
            <div className="d-flex align-items-end gap-4 flex-wrap mb-2">
              <div title="What the system saved: without it you would have paid the first bar, you paid the last">
                <div className="small text-body-secondary">Saved</div>
                <div
                  className="text-success"
                  style={{ fontSize: '2.4rem', fontWeight: 700, lineHeight: 1 }}
                >
                  {eur(k.savedEur)}
                </div>
              </div>
              {k.savedPct != null && (
                <div className="fs-5" title="The saving's share of the cost without the system">
                  <b>{num(k.savedPct, 0)} %</b>{' '}
                  <span className="text-body-secondary">less than without the system</span>
                </div>
              )}
              <div className="ms-auto text-end small text-body-secondary">
                without the system <b className="text-body">{eur(total.bridge[0].eur)}</b>
                <br />
                paid <b className="text-body">{eur(total.bridge[5].eur)}</b>
              </div>
            </div>
            <SavingsBridge steps={total.bridge} unit={unit} />
            {k.consistent === false && (
              <div className="small text-danger" role="alert">
                The figures of this {period} don't add up - more came from the grid than the site
                used and stored. A recording fault; the saving shown is not reliable.
              </div>
            )}
            {data.partial && (
              <div className="small text-body-secondary">
                Part of this {period} was recorded only from the ledger's start - the figures cover
                the recorded time.
              </div>
            )}
          </section>

          <section
            className="d-grid"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}
            aria-label="Key figures"
          >
            <Kpi
              label="Self-sufficiency"
              hint="The share of the consumption not taken from the grid"
            >
              <KeyValue value={num(k.selfSufficiencyPct, 0)} unit="%" />
            </Kpi>
            <Kpi
              label="Own use of generation"
              hint="The share of the PV and wind used on site (not sold, not held back)"
            >
              <KeyValue value={num(k.ownUsePct, 0)} unit="%" />
            </Kpi>
            <Kpi label="Consumption" hint="The site's whole consumption, the heating included">
              <KeyValue value={num(rec.loadKwh)} unit="kWh" />
            </Kpi>
            <Kpi label="PV + wind" hint="The field's generation">
              <KeyValue value={num(rec.pvKwh + rec.windKwh)} unit="kWh" />
            </Kpi>
            <Kpi label="Import / export" hint="From the grid / to the grid">
              <KeyValue value={num(rec.importKwh)} /> /{' '}
              <KeyValue value={num(rec.exportKwh)} unit="kWh" />
            </Kpi>
            <Kpi label="Average purchase" hint="What a kWh from the grid cost on average">
              <KeyValue value={num(k.avgBuyCtKwh, 1)} unit="ct/kWh" />
            </Kpi>
            <Kpi
              label="Peak import"
              hint="The highest power taken from the grid - it sets a business's capacity charge"
            >
              <KeyValue value={num(rec.peakImportKw, 0)} unit="kW" />
            </Kpi>
            <Kpi label="Battery cycles" hint="The batteries' discharge over their capacity">
              <KeyValue value={num(k.batteryCycles, 2)} />
            </Kpi>
            <Kpi label="Rooms' heat" hint="The heat (or cold) the rooms got">
              <KeyValue value={num(rec.deliveredHeatKwh)} unit="kWh" />
            </Kpi>
            <Kpi label="Sun / wind" hint="The solar energy per m² and the average / highest wind">
              <KeyValue value={num(rec.sunKwhM2, 1)} unit="kWh/m²" /> ·{' '}
              <KeyValue value={num(rec.windAvgMs, 1)} /> /{' '}
              <KeyValue value={num(rec.windMaxMs, 1)} unit="m/s" />
            </Kpi>
            {period === 'day' && data.days[0]?.accuracy && (
              <Kpi
                label="Forecast accuracy"
                hint="How well the plan's forecast met the day: generation / consumption (1 - the error over the actual energy)"
              >
                {num(data.days[0].accuracy.generationPct, 0)} /{' '}
                <KeyValue value={num(data.days[0].accuracy.consumptionPct, 0)} unit="%" />
              </Kpi>
            )}
            {period === 'day' && data.days[0]?.strategy && (
              <Kpi
                label="Strategy"
                hint="The strategy the plan ran; in hindsight - the one that would have done best on the day as it was"
              >
                {STRATEGY_LABELS[data.days[0].strategy] ?? data.days[0].strategy}
                {data.days[0].hindsight && (
                  <div className="small fw-normal text-body-secondary">
                    best in hindsight:{' '}
                    {STRATEGY_LABELS[data.days[0].hindsight.best] ?? data.days[0].hindsight.best}
                  </div>
                )}
              </Kpi>
            )}
          </section>

          {period === 'day' && <DayReview day={data.days[0]} labels={STRATEGY_LABELS} />}

          <AccountsView accounts={data.accounts} />

          {period === 'month' && (
            <section aria-label="The month's days">
              <MonthCalendar
                monthIso={shown}
                days={data.days}
                onPick={(iso) => {
                  setPeriod('day')
                  setDay(iso)
                }}
              />
            </section>
          )}

          {period !== 'day' && (
            <div style={{ overflowX: 'auto' }}>
              <CTable small hover className="mb-0">
                <CTableHead>
                  <CTableRow>
                    <CTableHeaderCell>{period === 'year' ? 'Month' : 'Day'}</CTableHeaderCell>
                    <CTableHeaderCell className="text-end" title="The site's consumption">
                      Consumption
                    </CTableHeaderCell>
                    <CTableHeaderCell className="text-end" title="PV + wind">
                      Generation
                    </CTableHeaderCell>
                    <CTableHeaderCell className="text-end" title="The grid bill less the sales">
                      Paid
                    </CTableHeaderCell>
                    <CTableHeaderCell className="text-end" title="Without the system less paid">
                      Saved
                    </CTableHeaderCell>
                    {period === 'month' && (
                      <CTableHeaderCell title="The strategy the plan ran / the best one in hindsight, and the forecast's accuracy (generation / consumption)">
                        Strategy · accuracy
                      </CTableHeaderCell>
                    )}
                  </CTableRow>
                </CTableHead>
                <CTableBody>
                  {period === 'month'
                    ? data.days.map((d) => (
                        <CTableRow
                          key={d.day}
                          style={{ cursor: 'pointer' }}
                          title="Open the day"
                          onClick={() => {
                            setPeriod('day')
                            setDay(d.day)
                          }}
                        >
                          <CTableDataCell>
                            {d.day}
                            {d.partial ? ' *' : ''}
                          </CTableDataCell>
                          <CTableDataCell className="text-end">
                            <KeyValue value={num(d.record.loadKwh)} unit="kWh" />
                          </CTableDataCell>
                          <CTableDataCell className="text-end">
                            <KeyValue value={num(d.record.pvKwh + d.record.windKwh)} unit="kWh" />
                          </CTableDataCell>
                          <CTableDataCell className="text-end">
                            {eur(-d.kpis.netEur)}
                          </CTableDataCell>
                          <CTableDataCell className="text-end text-success fw-semibold">
                            {eur(d.kpis.savedEur)}
                          </CTableDataCell>
                          <CTableDataCell className="small">
                            {d.strategy ? (STRATEGY_LABELS[d.strategy] ?? d.strategy) : '-'}
                            {d.hindsight && d.hindsight.best !== d.strategy
                              ? ` / ${STRATEGY_LABELS[d.hindsight.best] ?? d.hindsight.best}`
                              : ''}
                            {d.accuracy
                              ? ` · ${num(d.accuracy.generationPct, 0)} / ${num(d.accuracy.consumptionPct, 0)} %`
                              : ''}
                          </CTableDataCell>
                        </CTableRow>
                      ))
                    : months.map((m) => (
                        <CTableRow
                          key={m.month}
                          style={{ cursor: 'pointer' }}
                          title="Open the month"
                          onClick={() => {
                            setPeriod('month')
                            setDay(`${m.month}-01`)
                          }}
                        >
                          <CTableDataCell>{m.month}</CTableDataCell>
                          <CTableDataCell className="text-end">{num(m.load)} kWh</CTableDataCell>
                          <CTableDataCell className="text-end">{num(m.own)} kWh</CTableDataCell>
                          <CTableDataCell className="text-end">{eur(m.paid)}</CTableDataCell>
                          <CTableDataCell className="text-end text-success fw-semibold">
                            {eur(m.saved)}
                          </CTableDataCell>
                        </CTableRow>
                      ))}
                </CTableBody>
              </CTable>
            </div>
          )}
        </>
      )}
    </div>
  )
}

const VIEWS = [
  ['plan', 'Plan', "The batteries' plan for the hours ahead"],
  ['journal', 'Journal', 'What was spent and saved - a day, a month, a year'],
  ['tenants', 'Tenants', 'The let units - what each consumed and is to pay'],
]

const LedgerScene = ({ process, params }) => {
  // a Dashboard page (its params given) - its own title; the process row's panel has the row's
  const [view, setView] = useState('journal')
  // the day's description in words (the ledger's own, or its AI's day plan) - over its notes
  const [summary, setSummary] = useState(null)
  useEffect(() => {
    const load = () =>
      request(`/energy-ledger/${process.id}/notes`)
        .then((d) => setSummary(d.summary ?? null))
        .catch(() => setSummary(null))
    load()
    const t = setInterval(load, RELOAD_MS)
    return () => clearInterval(t)
  }, [process.id])
  return (
    <div className="p-2 d-flex flex-column gap-3">
      {/* the page's title with the AI's mark (the user, 2026-10-25) */}
      {params !== undefined && (
        <strong style={{ fontSize: '1.4rem' }}>
          <AiButton
            subject={{ type: 'process', id: process.id }}
            label={process.name}
            size={30}
            className="me-2"
          />
          {process.name}
        </strong>
      )}
      {/* the logic's notes (holidays, days off, a working weekend) and the day's description - first */}
      <DayNotes
        processId={process.id}
        kinds={['holiday', 'day-off', 'workday', 'other']}
        title="Today's operation"
        dayType
        summary={summary}
      />
      <CButtonGroup
        size="sm"
        role="group"
        aria-label="The ledger's view"
        className="align-self-start"
      >
        {VIEWS.map(([key, label, hint]) => (
          <CButton
            key={key}
            color="dark"
            variant={view === key ? undefined : 'outline'}
            title={hint}
            onClick={() => setView(key)}
          >
            {label}
          </CButton>
        ))}
      </CButtonGroup>
      {view === 'plan' ? (
        <PlanView process={process} />
      ) : view === 'tenants' ? (
        <TenantsView process={process} />
      ) : (
        <JournalView process={process} />
      )}
    </div>
  )
}

export default LedgerScene
