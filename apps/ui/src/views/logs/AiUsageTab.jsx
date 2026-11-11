import React, { useEffect, useMemo, useState } from 'react'
import { CAlert, CButton, CButtonGroup, CSpinner, CTable } from '@coreui/react'
import { api } from '../../api/client'
import { t } from 'src/i18n'

/**
 * Logs -> AI usage (the user, 2026-11-10): the AI's tokens by day - the guests, the schedules, the people -
 * stacked, against the day limits (the guests' shared budget, each connection's) as dashed lines; a day's
 * bar names its figures on hover; a table below for the exact numbers. From api `GET /ai/usage`
 * (ai_usage_daily - counted per model call, kept after a guest's conversation is deleted).
 */

// the kinds in a fixed order, each its own colour (the reference categorical slots 1-3, light / dark)
const KINDS = [
  { key: 'guest', label: 'Guests', color: 'var(--ai-usage-1)' },
  { key: 'scheduled', label: 'Schedules', color: 'var(--ai-usage-2)' },
  { key: 'person', label: 'People', color: 'var(--ai-usage-3)' },
]
const CSS = `
.ai-usage { --ai-usage-1: #2a78d6; --ai-usage-2: #eb6834; --ai-usage-3: #1baf7a }
[data-coreui-theme='dark'] .ai-usage { --ai-usage-1: #3987e5; --ai-usage-2: #d95926; --ai-usage-3: #199e70 }
.ai-usage-chart text { fill: var(--cui-secondary-color); font-size: 11px }
.ai-usage-chart .grid { stroke: var(--cui-border-color); stroke-width: 1 }
.ai-usage-chart .limit { stroke: var(--cui-body-color); stroke-width: 1.5; stroke-dasharray: 5 4; opacity: .7 }
.ai-usage-chart .hit { fill: transparent; cursor: default }
.ai-usage-chart .hit:hover { fill: var(--cui-tertiary-bg); opacity: .6 }
.ai-usage-legend { display: flex; flex-wrap: wrap; gap: 14px; font-size: .85rem }
.ai-usage-legend i { display: inline-block; width: 12px; height: 12px; border-radius: 3px; margin-right: 6px; vertical-align: -1px }
.ai-usage-tip { position: absolute; pointer-events: none; background: var(--cui-body-bg); border: 1px solid var(--cui-border-color);
  border-radius: 8px; padding: 6px 10px; font-size: .8rem; box-shadow: 0 4px 14px rgba(0,0,0,.12); white-space: nowrap; transform: translate(-50%, calc(-100% - 8px)) }
`
const fmt = (n) =>
  n >= 1e6 ? `${(n / 1e6).toFixed(2)} M` : n >= 1e3 ? `${Math.round(n / 1e3)} k` : String(n)
const PERIODS = [7, 30, 90]

const dayList = (days) => {
  const out = []
  const now = new Date()
  for (let k = days - 1; k >= 0; k--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - k)
    out.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
    )
  }
  return out
}

const Chart = ({ days, byDay, limits }) => {
  const [tip, setTip] = useState(null)
  const W = 900
  const H = 260
  const L = 56
  const B = 24
  const T = 10
  const lines = [
    ...(limits.guests ? [{ label: t('Guests limit'), value: limits.guests }] : []),
    ...limits.connections
      .filter((c) => c.daily)
      .map((c) => ({ label: `${c.name} - ${t('day limit')}`, value: c.daily })),
  ]
  const peak = Math.max(1, ...days.map((d) => byDay[d]?.total ?? 0), ...lines.map((l) => l.value))
  // round ticks: a 1 / 2 / 2.5 / 5 x 10^n step, four to five of them
  const raw = peak / 4
  const mag = 10 ** Math.floor(Math.log10(raw))
  const tick = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((v) => v >= raw)
  const top = Math.ceil((peak * 1.04) / tick) * tick
  const y = (v) => T + (H - T - B) * (1 - v / top)
  const step = (W - L) / days.length
  const bw = Math.max(3, Math.min(28, step - 2))
  const ticks = Array.from({ length: Math.round(top / tick) + 1 }, (_, k) => k * tick)
  const labelEvery = Math.ceil(days.length / 10)
  return (
    <div className="position-relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="ai-usage-chart w-100"
        role="img"
        aria-label={t('AI tokens by day')}
      >
        {ticks.map((v) => (
          <g key={v}>
            <line className="grid" x1={L} x2={W} y1={y(v)} y2={y(v)} />
            <text x={L - 6} y={y(v) + 4} textAnchor="end">
              {fmt(v)}
            </text>
          </g>
        ))}
        {days.map((d, i) => {
          const x = L + i * step + (step - bw) / 2
          let acc = 0
          const parts = KINDS.map((k) => {
            const v = byDay[d]?.[k.key]?.tokens ?? 0
            const y0 = y(acc)
            acc += v
            return { k, v, y0, y1: y(acc) }
          }).filter((p) => p.v > 0)
          return (
            <g key={d}>
              {parts.map((p, j) => {
                const h = Math.max(0, p.y0 - p.y1 - (j > 0 ? 2 : 0))
                return (
                  <rect
                    key={p.k.key}
                    x={x}
                    width={bw}
                    y={p.y1}
                    height={h}
                    rx={j === parts.length - 1 ? 3 : 0}
                    fill={p.k.color}
                  />
                )
              })}
              {i % labelEvery === 0 && (
                <text x={x + bw / 2} y={H - 6} textAnchor="middle">
                  {d.slice(5)}
                </text>
              )}
              <rect
                className="hit"
                x={L + i * step}
                width={step}
                y={T}
                height={H - T - B}
                onMouseEnter={() =>
                  setTip({ d, x: ((L + i * step + step / 2) / W) * 100, y: (y(acc) / H) * 100 })
                }
                onMouseLeave={() => setTip(null)}
              />
            </g>
          )
        })}
        {lines.map((l) => (
          <g key={l.label}>
            <line className="limit" x1={L} x2={W} y1={y(l.value)} y2={y(l.value)} />
            <text x={W - 4} y={y(l.value) - 4} textAnchor="end">
              {l.label}: {fmt(l.value)}
            </text>
          </g>
        ))}
      </svg>
      {tip && (
        <div className="ai-usage-tip" style={{ left: `${tip.x}%`, top: `${tip.y}%` }}>
          <div className="fw-semibold mb-1">{tip.d}</div>
          {KINDS.map((k) => (
            <div key={k.key}>
              <i
                style={{
                  display: 'inline-block',
                  width: 9,
                  height: 9,
                  borderRadius: 2,
                  background: k.color,
                  marginRight: 6,
                }}
              />
              {t(k.label)}: {fmt(byDay[tip.d]?.[k.key]?.tokens ?? 0)} ·{' '}
              {byDay[tip.d]?.[k.key]?.requests ?? 0} {t('requests')}
            </div>
          ))}
          <div className="mt-1">
            {t('Total')}: <strong>{fmt(byDay[tip.d]?.total ?? 0)}</strong>
          </div>
        </div>
      )}
    </div>
  )
}

const AiUsageTab = () => {
  const [days, setDays] = useState(30)
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  useEffect(() => {
    api
      .getAiUsage(days)
      .then((d) => {
        setError(null)
        setData(d)
      })
      .catch((e) => setError(e.message))
  }, [days])
  const list = useMemo(() => dayList(days), [days])
  const byDay = useMemo(() => {
    const m = {}
    for (const r of data?.usage ?? []) {
      m[r.day] = m[r.day] ?? { total: 0 }
      m[r.day][r.kind] = { tokens: r.tokens, requests: r.requests }
      m[r.day].total += r.tokens
    }
    return m
  }, [data])
  const today = byDay[list[list.length - 1]]
  return (
    <div className="ai-usage">
      <style>{CSS}</style>
      <div className="d-flex flex-wrap align-items-center gap-3 mb-3">
        <CButtonGroup size="sm" role="group" aria-label={t('Period')}>
          {PERIODS.map((p) => (
            <CButton
              key={p}
              color="secondary"
              variant={p === days ? undefined : 'outline'}
              onClick={() => setDays(p)}
            >
              {t('{{n}} days', { n: p })}
            </CButton>
          ))}
        </CButtonGroup>
        <div className="ai-usage-legend">
          {KINDS.map((k) => (
            <span key={k.key}>
              <i style={{ background: k.color }} />
              {t(k.label)}
            </span>
          ))}
        </div>
        {data && (
          <div className="ms-auto small text-body-secondary">
            {t('Today')}: <strong className="text-body">{fmt(today?.total ?? 0)}</strong>
            {data.limits.guests ? (
              <>
                {' · '}
                {t('Guests')}:{' '}
                <strong className="text-body">{fmt(today?.guest?.tokens ?? 0)}</strong> /{' '}
                {fmt(data.limits.guests)}
              </>
            ) : null}
          </div>
        )}
      </div>
      {error && <CAlert color="danger">{error}</CAlert>}
      {!data && !error && <CSpinner size="sm" />}
      {data && (
        <>
          <Chart days={list} byDay={byDay} limits={data.limits} />
          <CTable small hover responsive className="mt-3 small">
            <thead>
              <tr>
                <th>{t('Day')}</th>
                {KINDS.map((k) => (
                  <th key={k.key} className="text-end">
                    {t(k.label)}
                  </th>
                ))}
                <th className="text-end">{t('Total')}</th>
              </tr>
            </thead>
            <tbody>
              {[...list]
                .reverse()
                .filter((d) => byDay[d])
                .map((d) => (
                  <tr key={d}>
                    <td>{d}</td>
                    {KINDS.map((k) => (
                      <td key={k.key} className="text-end">
                        {fmt(byDay[d][k.key]?.tokens ?? 0)}
                        <span className="text-body-secondary">
                          {' '}
                          · {byDay[d][k.key]?.requests ?? 0}
                        </span>
                      </td>
                    ))}
                    <td className="text-end fw-semibold">{fmt(byDay[d].total)}</td>
                  </tr>
                ))}
            </tbody>
          </CTable>
        </>
      )}
    </div>
  )
}

export default AiUsageTab
