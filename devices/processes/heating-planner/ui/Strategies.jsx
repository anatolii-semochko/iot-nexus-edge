import React, { useState } from 'react'
import { api } from 'src/api/client'
import { useCan } from 'src/access'
import KeyValue from 'src/components/KeyValue'
import { fmt } from './usePlan'

// The heating plan's strategies (P3 - iot AGENTS_TO_DO.md 2026-10-29): the same hours ahead under each
// one, valued in the real money - the electricity, the saving against the band, the heat pumps'
// starts, the rooms off their setpoint, the sun's heat; the one the plan follows framed; a click - the
// plan follows it (the planner's command setStrategy, processes.control); the choice - fixed or the
// cheapest at each plan (setSelection).

const NAMES = {
  cost: [
    'Least cost',
    'The heat made when the energy is cheapest, the rooms’ comfort margin used in the dear hours',
  ],
  gentle: [
    'Gentle',
    'As few starts and as low a power as possible - the heat pumps’ wear and the peaks spared',
  ],
  comfort: ['Comfort', 'The rooms always at their setpoint - the tanks alone carry the dear hours'],
  sun: ['The sun', 'The sun’s surplus stored as heat - the tanks filled higher while it shines'],
}
const CHOICES = [
  ['fixed', 'Fixed', 'The plan keeps the chosen strategy'],
  ['cheapest', 'Cheapest', 'At each plan the strategy with the least electricity'],
]

const Strategies = ({ process, results, strategy, followed }) => {
  const can = useCan()
  const control = can('processes.control', { process: process.id })
  const [error, setError] = useState(null)
  if (!results?.length) return null
  const send = (action, params) => {
    setError(null)
    api.sendProcessCommand(process.id, action, params).catch((err) => setError(err.message))
  }
  const best = Math.min(...results.map((r) => r.energyEur))
  const selection = strategy?.selection ?? 'fixed'
  return (
    <section aria-label="Strategies">
      <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-2">
        <b>Strategies - the same hours ahead</b>
        <div className="d-flex align-items-center gap-2 small">
          <span className="text-body-secondary">Choice:</span>
          {CHOICES.map(([key, label, hint]) => (
            <button
              key={key}
              type="button"
              className={`btn btn-sm ${selection === key ? 'btn-secondary' : 'btn-outline-secondary'}`}
              disabled={!control}
              aria-pressed={selection === key}
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
        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 10 }}
      >
        {results.map((r) => {
          const [name, text] = NAMES[r.key] ?? [r.key, '']
          const on = r.key === followed
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
                {r.energyEur === best && <span className="badge bg-success">best</span>}
              </div>
              <div className="fs-5">
                <KeyValue value={fmt(r.energyEur, 2)} unit="€" />
              </div>
              <div className="small text-body-secondary">
                saves <KeyValue value={fmt(r.savingEur, 2)} unit="€" className="text-success" /> ·{' '}
                <KeyValue value={r.starts} /> starts
                <br />
                rooms <KeyValue value={fmt(r.comfortKh, 1)} unit="K·h" /> off (max{' '}
                {fmt(r.maxOffsetK, 1)} K) · sun <KeyValue value={fmt(r.sunKwh, 0)} unit="kWh" />
              </div>
            </button>
          )
        })}
      </div>
      {error && <div className="text-danger small mt-1">{error}</div>}
    </section>
  )
}

export default Strategies
