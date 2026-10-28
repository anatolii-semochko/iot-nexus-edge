import React from 'react'
import KeyValue from 'src/components/KeyValue'
import StatTile from 'src/components/StatTile'

// The day's review (review.ts, iot AGENTS_TO_DO.md 2026-10-25 stage A): what
// the day could have cost at best, how much of the gap is the forecast's and
// how much the strategy's, the day's prices, and what to do next time - the
// system's own recommendation (no AI needed). A day recorded before the
// batteries' actual power was sampled (2026-10-25) has only the strategy's part.

const money = (v) =>
  v === null || v === undefined
    ? '-'
    : Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const DayReview = ({ day, labels }) => {
  const v = day?.review
  if (!v && !day?.prices) return null
  const name = (k) => labels[k] ?? k
  return (
    <section className="d-flex flex-column gap-3" aria-label="The day's review">
      <div className="fw-semibold">
        What the day could have done better
        {day.dayType && (
          <span className="small fw-normal text-body-secondary ms-2">
            {WEEKDAYS[day.dayType.weekday]} - {day.dayType.working ? 'a working day' : 'a day off'}
            {day.dayType.reason ? ` (${day.dayType.reason})` : ''}
          </span>
        )}
      </div>
      {day.notes?.length > 0 && (
        <ul className="mb-0 ps-3 small">
          {day.notes.map((n, i) => (
            <li key={n.id ?? i}>
              <span className="fw-semibold">{n.kind}</span>
              {n.text ? ` - ${n.text}` : ''}
            </li>
          ))}
        </ul>
      )}
      <div
        className="d-grid"
        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}
      >
        {v && v.regretEur !== null && (
          <StatTile
            label="Could have saved"
            hint="The day as it ran against the best strategy planned on the day as it really was (a perfect forecast); the energy left in the batteries counted"
          >
            <KeyValue value={money(v.regretEur)} unit="€" />
          </StatTile>
        )}
        {v && v.forecastEur !== null && (
          <StatTile
            label="The forecast's part"
            hint="The day as it ran against the same strategy with a perfect forecast - the forecast's misses (and the plan's execution)"
          >
            <KeyValue value={money(v.forecastEur)} unit="€" />
          </StatTile>
        )}
        {v && (
          <StatTile
            label="The strategy's part"
            hint={`"${name(v.ran)}" against the best one, "${name(v.best)}", both with a perfect forecast`}
          >
            <KeyValue value={money(v.strategyEur)} unit="€" />
          </StatTile>
        )}
        {day.prices && (
          <StatTile
            label="Purchase prices"
            hint="The day's lowest / average / highest purchase price"
          >
            <KeyValue value={day.prices.minCt.toFixed(1)} /> /{' '}
            <KeyValue value={day.prices.avgCt.toFixed(1)} /> /{' '}
            <KeyValue value={day.prices.maxCt.toFixed(1)} unit="ct/kWh" />
          </StatTile>
        )}
      </div>
      {v && (
        <div>
          <div className="small text-body-secondary mb-1">
            Next time
            {v.recommendation.strategy && (
              <>
                {' '}
                - <span className="fw-semibold text-body">{name(v.recommendation.strategy)}</span>
              </>
            )}
          </div>
          <ul className="mb-0 ps-3">
            {v.recommendation.reasons.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

export default DayReview
