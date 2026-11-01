import React, { useCallback, useEffect, useState } from 'react'
import { CBadge, CButton, CCol, CRow, CSpinner } from '@coreui/react'
import { request } from 'src/api/client'
import { useProcessLiveState } from 'src/api/useLiveProcess'
import { useCan } from 'src/access'
import PriceChart from './PriceChart'
import { packageT } from 'src/i18n'
// the package's words (its own locales/, then the core's)
const t = packageT('energy-grid')

// The "energy-grid" process (CORE Library package): the connection
// point's meter now (phases, frequency, power - import / export), the
// prices now and today's account, and the prices of today and tomorrow
// (PriceChart). Read-only; the tariff and the market are set in Settings.

const RELOAD_MS = 15 * 60_000

const Value = ({ label, children, sub }) => (
  <CCol xs="auto">
    <div className="text-body-secondary small">{label}</div>
    <div style={{ fontSize: '1.6rem', fontWeight: 600, lineHeight: 1.1 }}>{children}</div>
    {sub && <div className="text-body-secondary small">{sub}</div>}
  </CCol>
)
const n = (v, d = 1) => (v === null || v === undefined ? '-' : Number(v).toFixed(d))

const EnergyGridPanel = ({ process }) => {
  const can = useCan()
  const live = useProcessLiveState(process.id)
  const m = live.metrics ?? process.metrics ?? {}
  const [prices, setPrices] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(
    () =>
      request(`/energy-grid/${process.id}/prices`)
        .then((p) => {
          setPrices(p)
          setError(null)
        })
        .catch((err) => setError(err.message)),
    [process.id],
  )
  useEffect(() => {
    load()
    const timer = setInterval(load, RELOAD_MS)
    return () => clearInterval(timer)
  }, [load])

  const refresh = () => {
    setBusy(true)
    request(`/energy-grid/${process.id}/prices/refresh`, { method: 'POST' })
      .then(setPrices)
      .catch((err) => setError(err.message))
      .finally(() => setBusy(false))
  }

  const flow = m.flow ?? 'none'
  const today = m.today ?? {}
  const balance = (today.revenueEur ?? 0) - (today.costEur ?? 0)

  return (
    <div className="pt-0 pb-3 px-2">
      <CRow className="align-items-end g-4 mb-3">
        <Value label={t('Grid')}>
          {m.outage ? (
            <CBadge color="danger">{t('Outage')}</CBadge>
          ) : (
            <span
              className={
                flow === 'export' ? 'text-success' : flow === 'import' ? '' : 'text-body-secondary'
              }
            >
              {flow === 'export' ? '↑ ' : flow === 'import' ? '↓ ' : ''}
              {n(Math.abs(m.powerKw ?? 0), 2)} kW
            </span>
          )}
        </Value>
        <Value label={t('Phases, V')}>
          {(m.phasesV ?? []).map((v) => n(v, 0)).join(' / ') || '-'}
        </Value>
        <Value label={t('Frequency')}>{n(m.frequencyHz, 2)} Hz</Value>
        <Value label={t('Buy now')} sub={m.tariffZone ? `zone ${m.tariffZone}` : undefined}>
          {n(m.buyCtKwh, 2)} <small className="fs-6">ct/kWh</small>
        </Value>
        <Value label={t('Sell now')}>
          {n(m.sellCtKwh, 2)} <small className="fs-6">ct/kWh</small>
        </Value>
        <Value
          label={t('Today')}
          sub={t('in {{n}} kWh ({{n2}} EUR), out {{n22}} kWh ({{n222}} EUR)', {
            n: n(today.importKwh, 1),
            n2: n(today.costEur, 2),
            n22: n(today.exportKwh, 1),
            n222: n(today.revenueEur, 2),
          })}
        >
          <span className={balance >= 0 ? 'text-success' : ''}>
            {balance >= 0 ? '+' : ''}
            {n(balance, 2)} EUR
          </span>
        </Value>
      </CRow>

      <div className="d-flex align-items-center gap-3 mb-1 flex-wrap">
        <strong>{t('Prices - today and tomorrow')}</strong>
        {prices && (
          <span className="text-body-secondary small">
            {t('buying:')}{' '}
            {prices.purchaseMode === 'market'
              ? t('market {{v0}} + surcharge', { v0: prices.biddingZone ?? '' })
              : t('tariff zones')}
            {t('; selling:')} {prices.saleMode === 'market' ? t('market') : t('fixed')}
            {prices.fetchedAt
              ? t('; market data {{toLocaleString}}', {
                  toLocaleString: new Date(prices.fetchedAt).toLocaleString(),
                })
              : ''}
          </span>
        )}
        {prices?.error && (
          <span className="text-warning small">
            {t('the last market fetch failed:')} {prices.error}
          </span>
        )}
        {prices?.biddingZone && can('processes.control', { process: process.id }) && (
          <CButton size="sm" color="secondary" variant="outline" disabled={busy} onClick={refresh}>
            {busy ? <CSpinner size="sm" /> : t('Refresh')}
          </CButton>
        )}
      </div>
      {error && !prices && (
        <div className="text-body-secondary small">
          {t('Prices:')} {error}
        </div>
      )}
      {!error && !prices && <CSpinner size="sm" />}
      {prices && <PriceChart slots={prices.slots} />}
      {prices?.attribution && (
        <div className="text-body-secondary" style={{ fontSize: '0.75rem' }}>
          {prices.attribution}
        </div>
      )}
    </div>
  )
}

export default EnergyGridPanel
