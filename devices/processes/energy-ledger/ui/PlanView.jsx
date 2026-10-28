import React, { useEffect, useState } from 'react'
import {
  CSpinner,
  CTable,
  CTableBody,
  CTableDataCell,
  CTableHead,
  CTableHeaderCell,
  CTableRow,
} from '@coreui/react'
import { useCan } from 'src/access'
import { useNow } from 'src/hooks/useNow'
import { api, request } from 'src/api/client'
import { useProcessLiveState } from 'src/api/useLiveProcess'

// The Energy Ledger's plan (L2; the reviewed mockup's "Plan"): what it
// saves to the horizon's end against the same day without the batteries;
// the chart - the prices, the forecast generation and consumption, the
// batteries' planned power, their state of charge, "now"; the plan's steps
// in words. The energy field's Auto follows the slot now.

const RELOAD_MS = 5 * 60_000
const W = 900
const BANDS = { price: [8, 78], power: [96, 236], soc: [254, 314], heat: [322, 330] }
const H = 352
const LEFT = 44
const RIGHT = 12

const hhmm = (t) =>
  new Date(t).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
const dayHhmm = (t) =>
  new Date(t).toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' })
const eur = (v) =>
  v === null || v === undefined
    ? '-'
    : `${Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
const ACTIONS = { charge: 'Charge', discharge: 'Discharge', hold: 'Hold' }

const PlanChart = ({ slots }) => {
  const now = useNow(60_000)
  const t0 = slots[0].t
  const t1 = slots[slots.length - 1].end
  const x = (t) => LEFT + ((t - t0) / (t1 - t0)) * (W - LEFT - RIGHT)
  const band = (b, v, lo, hi) => b[1] - ((v - lo) / (hi - lo || 1)) * (b[1] - b[0])
  const prices = slots.flatMap((s) => [s.buyCtKwh, s.sellCtKwh])
  const pLo = Math.min(0, ...prices)
  const pHi = Math.max(1, ...prices)
  const powers = slots.flatMap((s) => [s.generationKw, s.loadKw, s.batteryKw, -s.batteryKw])
  const kwHi = Math.max(1, ...powers)
  const kwLo = Math.min(0, ...slots.map((s) => s.batteryKw))
  const step = (key, b, lo, hi) =>
    slots
      .map(
        (s) =>
          `${x(s.t).toFixed(1)},${band(b, s[key], lo, hi).toFixed(1)} ${x(s.end).toFixed(1)},${band(b, s[key], lo, hi).toFixed(1)}`,
      )
      .join(' ')
  const hours = []
  for (let t = Math.ceil(t0 / 3_600_000) * 3_600_000; t < t1; t += 3_600_000) hours.push(t)
  const zero = band(BANDS.power, 0, kwLo, kwHi)
  // the day notes' windows (notes.ts): an outage - no grid, the batteries carry the site; maintenance -
  // the batteries' power less (their units out) - shaded behind the curves, one run per window
  const runs = (pick) =>
    slots.reduce((out, s) => {
      const v = pick(s)
      const last = out[out.length - 1]
      if (v && last && last.v === v && last.end === s.t) last.end = s.end
      else if (v) out.push({ t: s.t, end: s.end, v })
      return out
    }, [])
  const outages = runs((s) => (s.gridOff ? 'off' : null))
  const reduced = runs((s) =>
    s.batteryFactor != null && s.batteryFactor < 1 ? s.batteryFactor : null,
  )
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      role="img"
      aria-label="The plan: prices, forecast, batteries, state of charge"
    >
      {hours
        .filter((t) => new Date(t).getHours() % 6 === 0)
        .map((t) => (
          <g key={t}>
            <line
              x1={x(t)}
              x2={x(t)}
              y1={BANDS.price[0]}
              y2={BANDS.soc[1]}
              stroke="var(--cui-border-color)"
              strokeDasharray={new Date(t).getHours() === 0 ? undefined : '2 4'}
            />
            <text x={x(t) + 2} y={H - 8} fontSize="11" fill="var(--cui-secondary-color)">
              {new Date(t).getHours() === 0
                ? new Date(t).toLocaleDateString(undefined, { weekday: 'short' })
                : hhmm(t)}
            </text>
          </g>
        ))}
      {outages.map((r) => (
        <rect
          key={`o${r.t}`}
          x={x(r.t)}
          width={Math.max(2, x(r.end) - x(r.t))}
          y={BANDS.price[0]}
          height={BANDS.soc[1] - BANDS.price[0]}
          fill="rgba(217,59,59,0.12)"
          stroke="rgba(217,59,59,0.5)"
          strokeDasharray="3 3"
        >
          <title>{`Grid outage ${hhmm(r.t)}-${hhmm(r.end)} (a day note): no import, no export - the batteries charged ahead carry the site`}</title>
        </rect>
      ))}
      {reduced.map((r) => (
        <rect
          key={`m${r.t}`}
          x={x(r.t)}
          width={Math.max(2, x(r.end) - x(r.t))}
          y={BANDS.power[0]}
          height={BANDS.power[1] - BANDS.power[0]}
          fill="rgba(242,183,5,0.14)"
        >
          <title>{`Maintenance ${hhmm(r.t)}-${hhmm(r.end)} (a day note): the batteries' power at ${Math.round(r.v * 100)} %`}</title>
        </rect>
      ))}
      {outages.map((r) => (
        <text key={`ot${r.t}`} x={x(r.t) + 3} y={BANDS.price[0] + 22} fontSize="10" fill="#d93b3b">
          outage
        </text>
      ))}
      <text x="2" y={BANDS.price[0] + 10} fontSize="11" fill="var(--cui-secondary-color)">
        ct
      </text>
      <polyline
        points={step('buyCtKwh', BANDS.price, pLo, pHi)}
        fill="none"
        stroke="#d93b3b"
        strokeWidth="1.8"
      >
        <title>The purchase price, ct/kWh</title>
      </polyline>
      <polyline
        points={step('sellCtKwh', BANDS.price, pLo, pHi)}
        fill="none"
        stroke="#1d6fd8"
        strokeWidth="1.4"
        strokeDasharray="4 3"
      >
        <title>The sale price, ct/kWh</title>
      </polyline>
      <text
        x={LEFT - 4}
        y={BANDS.price[0] + 10}
        fontSize="10"
        textAnchor="end"
        fill="var(--cui-secondary-color)"
      >
        {Math.round(pHi)}
      </text>

      <text x="2" y={BANDS.power[0] + 10} fontSize="11" fill="var(--cui-secondary-color)">
        kW
      </text>
      <line x1={LEFT} x2={W - RIGHT} y1={zero} y2={zero} stroke="var(--cui-border-color)" />
      <polygon
        points={`${x(t0)},${zero} ${step('generationKw', BANDS.power, kwLo, kwHi)} ${x(t1)},${zero}`}
        fill="rgba(31,157,99,0.25)"
        stroke="#1f9d63"
        strokeWidth="1"
      >
        <title>The forecast generation - PV and wind, kW</title>
      </polygon>
      <polyline
        points={step('loadKw', BANDS.power, kwLo, kwHi)}
        fill="none"
        stroke="#e8760a"
        strokeWidth="1.8"
      >
        <title>The forecast consumption (the heating included), kW</title>
      </polyline>
      {slots.map((s) =>
        Math.abs(s.batteryKw) > 0.5 ? (
          <rect
            key={s.t}
            x={x(s.t)}
            width={Math.max(1, x(s.end) - x(s.t) - 0.5)}
            y={Math.min(zero, band(BANDS.power, -s.batteryKw, kwLo, kwHi))}
            height={Math.abs(band(BANDS.power, -s.batteryKw, kwLo, kwHi) - zero)}
            fill={s.batteryKw < 0 ? '#0f9a96' : '#7a5af8'}
            opacity="0.75"
          >
            <title>{`${hhmm(s.t)}: ${s.batteryKw < 0 ? 'charge' : 'discharge'} ${Math.abs(s.batteryKw).toFixed(1)} kW at ${s.buyCtKwh.toFixed(1)} ct/kWh`}</title>
          </rect>
        ) : null,
      )}
      <text
        x={LEFT - 4}
        y={BANDS.power[0] + 10}
        fontSize="10"
        textAnchor="end"
        fill="var(--cui-secondary-color)"
      >
        {Math.round(kwHi)}
      </text>

      <text x="2" y={BANDS.soc[0] + 10} fontSize="11" fill="var(--cui-secondary-color)">
        SoC
      </text>
      <polyline
        points={slots
          .map((s) => `${x(s.end).toFixed(1)},${band(BANDS.soc, s.socPct, 0, 100).toFixed(1)}`)
          .join(' ')}
        fill="none"
        stroke="#0f9a96"
        strokeWidth="2"
      >
        <title>The batteries' planned state of charge, %</title>
      </polyline>
      <text
        x={LEFT - 4}
        y={BANDS.soc[0] + 8}
        fontSize="10"
        textAnchor="end"
        fill="var(--cui-secondary-color)"
      >
        100
      </text>
      <text
        x={LEFT - 4}
        y={BANDS.soc[1]}
        fontSize="10"
        textAnchor="end"
        fill="var(--cui-secondary-color)"
      >
        0
      </text>
      <text x="2" y={BANDS.heat[1]} fontSize="10" fill="var(--cui-secondary-color)">
        heat
      </text>
      {slots.map((s) =>
        s.heatingSignal && s.heatingSignal !== 2 ? (
          <rect
            key={`h${s.t}`}
            x={x(s.t)}
            width={Math.max(1, x(s.end) - x(s.t))}
            y={BANDS.heat[0]}
            height={BANDS.heat[1] - BANDS.heat[0]}
            fill={s.heatingSignal === 3 ? '#e5534b' : '#8a96a8'}
          >
            <title>{`${hhmm(s.t)}: heating - ${s.heatingSignal === 3 ? 'store heat now (cheap / sunny)' : 'hold off (dear - the tanks carry it)'}`}</title>
          </rect>
        ) : null,
      )}
      {now >= t0 && now <= t1 && (
        <line
          x1={x(now)}
          x2={x(now)}
          y1={BANDS.price[0]}
          y2={BANDS.soc[1]}
          stroke="var(--cui-danger)"
          strokeWidth="1.5"
        >
          <title>Now</title>
        </line>
      )}
    </svg>
  )
}

const STRATEGY_NAMES = {
  cost: [
    'Least cost',
    'The batteries charge when energy is cheap or free and give it back when it is dear',
  ],
  selfSufficiency: [
    'Self-sufficiency',
    'As little from the grid as possible - no charging from the grid',
  ],
  reserve: ['Reserve', 'The batteries kept high - ready for an outage (e.g. before a storm)'],
  peakShaving: [
    'Peak shaving',
    "The import under the peak limit - a business's capacity charge (Leistungspreis)",
  ],
  sales: ['Sales', 'The stored energy sold only above the price threshold'],
}

/** The strategies for the same hours: each one's forecast money and energy; the chosen one; the selection. */
const Strategies = ({ process, plan, live }) => {
  const can = useCan()
  const control = can('processes.control', { process: process.id })
  const [error, setError] = useState(null)
  const send = (action, params) => {
    setError(null)
    api.sendProcessCommand(process.id, action, params).catch((err) => setError(err.message))
  }
  const results = plan.strategies ?? []
  if (!results.length) return null
  const best = Math.min(...results.map((r) => r.eur))
  const selection = live?.plan?.selection ?? 'fixed'
  const choices = [
    ['fixed', 'Fixed', 'The plan keeps the chosen strategy'],
    [
      'propose',
      'Proposed',
      "On new day-ahead prices a cheaper strategy is proposed - applied at once or waiting for your Accept, by the ledger's AI permission (its Config level: Auto / Confirm / Off)",
    ],
    [
      'analog',
      'Similar days',
      "Each morning (and when the day's notes change) the ledger itself takes the strategy that was best on the most similar recorded days - the weather, the prices, the day's type, the season; no AI needed",
    ],
  ]
  return (
    <section aria-label="Strategies">
      <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-2">
        <b>Strategies - the same hours ahead</b>
        <div className="d-flex align-items-center gap-2 small">
          <span className="text-body-secondary">Choice:</span>
          {choices.map(([key, label, hint]) => (
            <button
              key={key}
              type="button"
              className={`btn btn-sm ${selection === key ? 'btn-secondary' : 'btn-outline-secondary'}`}
              disabled={!control}
              title={control ? hint : `${hint} - you may only watch`}
              onClick={() => send('setSelection', { selection: key })}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div
        className="d-grid"
        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 10 }}
      >
        {results.map((r) => {
          const [name, text] = STRATEGY_NAMES[r.key] ?? [r.key, '']
          const on = r.key === plan.strategy
          return (
            <button
              key={r.key}
              type="button"
              disabled={!control || on}
              aria-pressed={on}
              title={control ? `${text}${on ? ' - the plan follows it' : ' - follow it'}` : text}
              onClick={() => send('setStrategy', { key: r.key })}
              className="text-start border rounded p-2"
              style={{
                borderWidth: 2,
                borderColor: on ? 'var(--cui-primary)' : 'var(--cui-border-color)',
                background: 'transparent',
                color: 'var(--cui-body-color)',
                cursor: control && !on ? 'pointer' : 'default',
              }}
            >
              <div className="d-flex justify-content-between align-items-center gap-1">
                <b>{name}</b>
                {r.eur === best && <span className="badge bg-success">best</span>}
              </div>
              <div className="fs-5 fw-semibold">{eur(r.eur)}</div>
              <div className="small text-body-secondary">
                import {Math.round(r.importKwh)} kWh · peak {Math.round(r.peakKw)} kW
                <br />
                self-sufficiency{' '}
                {r.selfSufficiencyPct === null ? '-' : Math.round(r.selfSufficiencyPct)} % · min{' '}
                {r.minSocPct} %
              </div>
            </button>
          )
        })}
      </div>
      {error && <div className="text-danger small mt-1">{error}</div>}
      <SimilarDays analogs={live?.analogs} selection={selection} />
    </section>
  )
}

const shortDay = (iso) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })

/** The similar days (selection "analog", similar.ts): what today's choice rests on. */
const SimilarDays = ({ analogs, selection }) => {
  if (selection !== 'analog' || !analogs) return null
  const { days, choice, target } = analogs
  return (
    <div className="mt-3">
      <div className="small">
        <b>Today by the similar days:</b>{' '}
        {choice.strategy ? (
          choice.reason
        ) : (
          <span className="text-body-secondary">{choice.reason} - the strategy is kept</span>
        )}
      </div>
      <div className="small text-body-secondary">
        Today&apos;s forecast: sun {target.sunKwhM2 === null ? '-' : target.sunKwhM2.toFixed(1)}{' '}
        kWh/m², wind {target.windAvgMs === null ? '-' : target.windAvgMs.toFixed(1)} m/s,{' '}
        {target.tempMeanC === null ? '-' : Math.round(target.tempMeanC)} °C, prices{' '}
        {target.priceAvgCt === null ? '-' : target.priceAvgCt.toFixed(1)} ct/kWh,{' '}
        {target.working ? 'a working day' : 'a day off'}
      </div>
      {days.length > 0 && (
        <table className="table table-sm small mt-1 mb-0">
          <thead>
            <tr>
              <th>Day</th>
              <th className="text-end" title="How unlike today (0 - the same)">
                Distance
              </th>
              <th className="text-end" title="The saving against without the system">
                Saved
              </th>
              <th className="text-end" title="What the day could still have saved (its review)">
                Left
              </th>
              <th>Best in hindsight</th>
            </tr>
          </thead>
          <tbody>
            {days.map((d) => (
              <tr key={d.day} title={d.recommendation.join('\n')}>
                <td>{shortDay(d.day)}</td>
                <td className="text-end">{d.distance.toFixed(2)}</td>
                <td className="text-end">
                  {d.savedPct === null ? '-' : `${Math.round(d.savedPct)} %`}
                </td>
                <td className="text-end">{d.regretEur === null ? '-' : eur(d.regretEur)}</td>
                <td>{STRATEGY_NAMES[d.best]?.[0] ?? d.best ?? '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** What the ledger learnt (L4): the forecast's accuracy today, the corrections the plan uses. */
const Learnt = ({ learning }) => {
  if (!learning) return null
  const c = learning.corrections
  const a = learning.accuracy ?? {}
  const pct = (v) => (v === null || v === undefined ? '-' : `${Math.round(v)} %`)
  const factor = (v) =>
    v === null || v === undefined
      ? '-'
      : `${v >= 1 ? '+' : '−'}${Math.abs((v - 1) * 100).toFixed(0)} %`
  const load = Object.entries(c?.load ?? {})
    .map(([k, kw]) => {
      const [wd, h] = k.split('-').map(Number)
      return { wd, h, kw }
    })
    .filter((x) => Math.abs(x.kw) >= 1)
    .sort((x, y) => Math.abs(y.kw) - Math.abs(x.kw))
    .slice(0, 4)
  return (
    <section className="border rounded p-3" aria-label="What the ledger learnt">
      <b>What the ledger learnt</b>
      <div
        className="d-grid mt-2"
        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}
      >
        <div title="How well today's forecast met what happened: generation / consumption (1 - the error over the actual energy)">
          <div className="small text-body-secondary">Forecast accuracy today</div>
          <div className="fw-semibold">
            {pct(a.generationPct)} / {pct(a.consumptionPct)}
          </div>
          <div className="small text-body-secondary">
            {learning.samplesToday} quarter-hours so far
          </div>
        </div>
        <div title="The PV forecast corrected by what the panels really gave this month (the shading, the soiling, the forecast's bias)">
          <div className="small text-body-secondary">PV correction (this month)</div>
          <div className="fw-semibold">{factor(c?.pvFactor)}</div>
        </div>
        <div title="The wind forecast corrected by what the turbines really gave">
          <div className="small text-body-secondary">Wind correction</div>
          <div className="fw-semibold">{factor(c?.windFactor)}</div>
        </div>
        <div title="The consumption forecast corrected by weekday and hour - the largest corrections">
          <div className="small text-body-secondary">Consumption corrections</div>
          <div className="small">
            {load.length
              ? load.map((x) => (
                  <div key={`${x.wd}-${x.h}`}>
                    {WEEKDAYS[x.wd]} {String(x.h).padStart(2, '0')}:00 {x.kw > 0 ? '+' : '−'}
                    {Math.abs(x.kw).toFixed(1)} kW
                  </div>
                ))
              : 'none yet'}
          </div>
          <div className="small text-body-secondary">
            from {c?.samples ?? 0} quarter-hours (4 weeks)
          </div>
        </div>
      </div>
    </section>
  )
}

const PlanView = ({ process }) => {
  const live = useProcessLiveState(process.id).metrics ?? process.metrics
  const [plan, setPlan] = useState(undefined)
  const [error, setError] = useState(null)
  useEffect(() => {
    let cancelled = false
    const load = () =>
      request(`/energy-ledger/${process.id}/plan`)
        .then((d) => !cancelled && setPlan(d.plan))
        .catch((err) => !cancelled && setError(err.message))
    load()
    const timer = setInterval(load, RELOAD_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [process.id])
  if (error) return <div className="text-danger small">{error}</div>
  if (plan === undefined) return <CSpinner size="sm" />
  if (!plan?.slots?.length)
    return (
      <div className="text-body-secondary small">
        No plan yet - it is made from the next run on.
      </div>
    )
  const sum = (k) => plan.slots.reduce((a, s) => a + (s[k] ?? 0), 0)
  const saving = sum('baselineEur') - sum('costEur')
  const end = plan.slots[plan.slots.length - 1].end
  return (
    <div className="d-flex flex-column gap-3">
      <section className="border rounded p-3" aria-label="The plan">
        <div className="d-flex align-items-end gap-4 flex-wrap mb-2">
          <div title="The plan's money against the same hours without the batteries">
            <div className="small text-body-secondary">The batteries' plan saves</div>
            <div
              className="text-success"
              style={{ fontSize: '2rem', fontWeight: 700, lineHeight: 1 }}
            >
              {eur(saving)}
            </div>
          </div>
          <div className="small text-body-secondary">
            until <b className="text-body">{dayHhmm(end)}</b>
            <br />
            planned <b className="text-body">{eur(sum('costEur'))}</b> · without the batteries{' '}
            <b className="text-body">{eur(sum('baselineEur'))}</b>
          </div>
          <div
            className="ms-auto small text-body-secondary text-end"
            title="When and why the plan was made last"
          >
            made {dayHhmm(plan.madeAt)}
            <br />
            {plan.reason}
          </div>
        </div>
        <PlanChart slots={plan.slots} />
        <div className="d-flex gap-3 flex-wrap small text-body-secondary">
          <span>
            <span style={{ color: '#d93b3b' }}>━</span> buy
          </span>
          <span>
            <span style={{ color: '#1d6fd8' }}>┅</span> sell
          </span>
          <span>
            <span style={{ color: '#1f9d63' }}>■</span> generation
          </span>
          <span>
            <span style={{ color: '#e8760a' }}>━</span> consumption
          </span>
          <span>
            <span style={{ color: '#0f9a96' }}>■</span> charge
          </span>
          <span>
            <span style={{ color: '#7a5af8' }}>■</span> discharge
          </span>
          <span>
            <span style={{ color: '#0f9a96' }}>━</span> state of charge
          </span>
          <span title="The SG-Ready signal to the heat pumps">
            <span style={{ color: '#e5534b' }}>■</span> heat: store /{' '}
            <span style={{ color: '#8a96a8' }}>■</span> hold off
          </span>
        </div>
      </section>
      <Strategies process={process} plan={plan} live={live} />
      <Learnt learning={live?.learning} />
      <div style={{ overflowX: 'auto' }}>
        <CTable small className="mb-0">
          <CTableHead>
            <CTableRow>
              <CTableHeaderCell>When</CTableHeaderCell>
              <CTableHeaderCell>Batteries</CTableHeaderCell>
              <CTableHeaderCell
                className="text-end"
                title="The average purchase price in those hours"
              >
                Price
              </CTableHeaderCell>
              <CTableHeaderCell
                className="text-end"
                title="What this step saves against no batteries (a charge costs now, its discharge saves later)"
              >
                Effect
              </CTableHeaderCell>
            </CTableRow>
          </CTableHead>
          <CTableBody>
            {(plan.steps ?? []).map((s) => (
              <CTableRow key={s.from}>
                <CTableDataCell>
                  {dayHhmm(s.from)} – {hhmm(s.to)}
                </CTableDataCell>
                <CTableDataCell>
                  {ACTIONS[s.action]}
                  {s.action !== 'hold' ? ` ${Math.abs(s.avgKw).toFixed(0)} kW` : ''}
                </CTableDataCell>
                <CTableDataCell className="text-end">{s.avgBuyCtKwh.toFixed(1)} ct</CTableDataCell>
                <CTableDataCell
                  className={`text-end ${s.savingEur >= 0 ? 'text-success' : 'text-body-secondary'}`}
                >
                  {s.savingEur >= 0 ? '+' : ''}
                  {eur(s.savingEur)}
                </CTableDataCell>
              </CTableRow>
            ))}
          </CTableBody>
        </CTable>
      </div>
    </div>
  )
}

export default PlanView
