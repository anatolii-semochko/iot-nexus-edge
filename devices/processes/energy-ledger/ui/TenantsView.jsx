import React, { useEffect, useState } from 'react'
import {
  CButton,
  CButtonGroup,
  CSpinner,
  CTable,
  CTableBody,
  CTableDataCell,
  CTableFoot,
  CTableHead,
  CTableHeaderCell,
  CTableRow,
} from '@coreui/react'
import { request } from 'src/api/client'
import KeyValue from 'src/components/KeyValue'

// The let units (the ledger's tenant accounts - iot AGENTS_TO_DO.md 2026-10-25): what each premises
// consumed - its meters' electricity and its fan coils' heat - and what it is to pay, over a day / a
// week / a month / a year / all; the closed days only (the current month grows once a day). A year / all
// - each month's sums too. No invoices made - the figures to re-bill.

const PERIODS = [
  ['day', 'Day'],
  ['week', 'Week'],
  ['month', 'Month'],
  ['year', 'Year'],
  ['all', 'All'],
]
const money = (v) =>
  Number(v ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const kwh = (v) => Number(v ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })
const plusDays = (day, n) =>
  new Date(Date.parse(`${day}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
const shift = (period, day, dir) => {
  if (period === 'day') return plusDays(day, dir)
  if (period === 'week') return plusDays(day, 7 * dir)
  const d = new Date(`${day}T12:00:00Z`)
  if (period === 'month') d.setUTCMonth(d.getUTCMonth() + dir, 1)
  if (period === 'year') d.setUTCFullYear(d.getUTCFullYear() + dir)
  return d.toISOString().slice(0, 10)
}
const rangeText = (data) => {
  if (!data) return ''
  if (data.period === 'all') return 'All recorded'
  if (data.period === 'day')
    return new Date(`${data.from}T12:00:00Z`).toLocaleDateString(undefined, {
      dateStyle: 'medium',
      timeZone: 'UTC',
    })
  if (data.period === 'month')
    return new Date(`${data.from}T12:00:00Z`).toLocaleDateString(undefined, {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    })
  if (data.period === 'year') return data.from.slice(0, 4)
  return `${data.from} - ${data.to}`
}

const TenantsView = ({ process }) => {
  const [period, setPeriod] = useState('month')
  const [day, setDay] = useState(null)
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  useEffect(() => {
    let cancelled = false
    request(`/energy-ledger/${process.id}/tenants?period=${period}${day ? `&day=${day}` : ''}`)
      .then((d) => !cancelled && (setData(d), setError(null)))
      .catch((err) => !cancelled && setError(err.message))
    return () => {
      cancelled = true
    }
  }, [process.id, period, day])
  const items = data?.items ?? []
  const total = items.reduce(
    (a, x) => ({
      elecKwh: a.elecKwh + x.elecKwh,
      elecEur: a.elecEur + x.elecEur,
      heatKwh: a.heatKwh + x.heatKwh,
      heatEur: a.heatEur + x.heatEur,
      totalEur: a.totalEur + x.totalEur,
    }),
    { elecKwh: 0, elecEur: 0, heatKwh: 0, heatEur: 0, totalEur: 0 },
  )
  return (
    <section className="d-flex flex-column gap-3" aria-label="The let units">
      <div className="d-flex align-items-center gap-2 flex-wrap">
        <CButtonGroup size="sm" role="group" aria-label="The period">
          {PERIODS.map(([key, label]) => (
            <CButton
              key={key}
              color="secondary"
              variant={period === key ? undefined : 'outline'}
              onClick={() => setPeriod(key)}
            >
              {label}
            </CButton>
          ))}
        </CButtonGroup>
        {period !== 'all' && data && (
          <>
            <CButton
              size="sm"
              variant="ghost"
              title="Before"
              onClick={() => setDay(shift(period, data.day, -1))}
            >
              &lsaquo;
            </CButton>
            <span className="fw-semibold">{rangeText(data)}</span>
            <CButton
              size="sm"
              variant="ghost"
              title="After"
              onClick={() => setDay(shift(period, data.day, 1))}
            >
              &rsaquo;
            </CButton>
          </>
        )}
        {data?.through && (
          <span className="small text-body-secondary ms-auto">
            {data.days} closed day{data.days === 1 ? '' : 's'}, through {data.through}
          </span>
        )}
      </div>
      {error && <div className="small text-danger">{error}</div>}
      {!data && !error && <CSpinner size="sm" />}
      {data && !items.length && (
        <div className="small text-body-secondary">
          No let units&apos; figures for this period (the tenant accounts - the ledger&apos;s
          config).
        </div>
      )}
      {items.length > 0 && (
        <CTable small responsive hover className="mb-0">
          <CTableHead>
            <CTableRow>
              <CTableHeaderCell>Premises</CTableHeaderCell>
              <CTableHeaderCell className="text-end" title="Its meters' electricity">
                Electricity, kWh
              </CTableHeaderCell>
              <CTableHeaderCell className="text-end">€</CTableHeaderCell>
              <CTableHeaderCell className="text-end" title="Its fan coils' heat">
                Heat, kWh
              </CTableHeaderCell>
              <CTableHeaderCell className="text-end">€</CTableHeaderCell>
              <CTableHeaderCell className="text-end">To pay, €</CTableHeaderCell>
            </CTableRow>
          </CTableHead>
          <CTableBody>
            {items.map((x) => (
              <CTableRow key={x.key}>
                <CTableDataCell>{x.name}</CTableDataCell>
                <CTableDataCell className="text-end">{kwh(x.elecKwh)}</CTableDataCell>
                <CTableDataCell className="text-end">{money(x.elecEur)}</CTableDataCell>
                <CTableDataCell className="text-end">{kwh(x.heatKwh)}</CTableDataCell>
                <CTableDataCell className="text-end">{money(x.heatEur)}</CTableDataCell>
                <CTableDataCell className="text-end">
                  <KeyValue value={money(x.totalEur)} />
                </CTableDataCell>
              </CTableRow>
            ))}
          </CTableBody>
          <CTableFoot>
            <CTableRow className="fw-semibold">
              <CTableDataCell>All let units</CTableDataCell>
              <CTableDataCell className="text-end">{kwh(total.elecKwh)}</CTableDataCell>
              <CTableDataCell className="text-end">{money(total.elecEur)}</CTableDataCell>
              <CTableDataCell className="text-end">{kwh(total.heatKwh)}</CTableDataCell>
              <CTableDataCell className="text-end">{money(total.heatEur)}</CTableDataCell>
              <CTableDataCell className="text-end">
                <KeyValue value={money(total.totalEur)} unit="€" />
              </CTableDataCell>
            </CTableRow>
          </CTableFoot>
        </CTable>
      )}
      {data?.months?.length > 1 && items.length > 0 && (
        <div>
          <div className="fw-semibold mb-1">By month - to pay, €</div>
          <CTable small responsive hover className="mb-0">
            <CTableHead>
              <CTableRow>
                <CTableHeaderCell>Month</CTableHeaderCell>
                {items.map((x) => (
                  <CTableHeaderCell key={x.key} className="text-end text-nowrap">
                    {x.name}
                  </CTableHeaderCell>
                ))}
              </CTableRow>
            </CTableHead>
            <CTableBody>
              {data.months.map((mo) => (
                <CTableRow key={mo.month}>
                  <CTableDataCell className="text-nowrap">
                    {new Date(`${mo.month}-15T12:00:00Z`).toLocaleDateString(undefined, {
                      month: 'short',
                      year: 'numeric',
                      timeZone: 'UTC',
                    })}
                  </CTableDataCell>
                  {items.map((x) => (
                    <CTableDataCell key={x.key} className="text-end">
                      {money(mo.items.find((y) => y.key === x.key)?.totalEur)}
                    </CTableDataCell>
                  ))}
                </CTableRow>
              ))}
            </CTableBody>
          </CTable>
        </div>
      )}
    </section>
  )
}

export default TenantsView
