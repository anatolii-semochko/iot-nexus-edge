import React, { useState } from 'react'
import CIcon from '@coreui/icons-react'
import { cilPlus, cilTrash } from '@coreui/icons'
import { CButton, CCol, CFormInput, CFormLabel, CFormSelect, CRow } from '@coreui/react'

// The energy-grid process's Settings ("Configuration" tab): the purchase
// (a time-of-use tariff or the market plus surcharge, the tariff zones),
// the sale (fixed or market), the market's bidding zone, the connection's
// limits, the supply quality tolerances and the time zone. Staged locally;
// the changed sections reach the process when the modal's Save runs
// (registered with the '*' field).

const num = (text) => (text.trim() === '' ? undefined : Number(text))

const Field = ({ label, sm = 3, children }) => (
  <CCol sm={sm}>
    <CFormLabel className="small mb-1">{label}</CFormLabel>
    {children}
  </CCol>
)

const EnergyGridSettingsSection = ({ process, extraConfigRef }) => {
  const c = process.config
  const [purchase, setPurchase] = useState(c.purchase ?? { mode: 'tariff', zones: [] })
  const [sale, setSale] = useState(c.sale ?? { mode: 'fixed' })
  const [market, setMarket] = useState(c.market ?? {})
  const [limits, setLimits] = useState(c.limits ?? {})
  const [quality, setQuality] = useState(c.quality ?? {})
  const [timeZone, setTimeZone] = useState(c.timeZone ?? '')

  const stage = (section, value) => {
    extraConfigRef.current = { ...(extraConfigRef.current ?? {}), [section]: value }
  }
  // one section's field; an empty value - the key dropped (the default)
  const edit = (section, current, set, key, value) => {
    const next = { ...current, [key]: value }
    if (value === undefined || value === '') delete next[key]
    set(next)
    stage(section, next)
  }
  const editPurchase = (key, value) => edit('purchase', purchase, setPurchase, key, value)
  const editSale = (key, value) => edit('sale', sale, setSale, key, value)
  const editMarket = (key, value) => edit('market', market, setMarket, key, value)
  const editLimits = (key, value) => edit('limits', limits, setLimits, key, value)
  const editQuality = (key, value) => edit('quality', quality, setQuality, key, value)
  const zones = purchase.zones ?? []
  const setZones = (next) => editPurchase('zones', next)
  const editZone = (i, key, value) =>
    setZones(zones.map((z, j) => (j === i ? { ...z, [key]: value } : z)))

  return (
    <>
      <h6>Buying</h6>
      <CRow className="g-3 mb-2">
        <Field label="Price">
          <CFormSelect
            value={purchase.mode ?? 'tariff'}
            onChange={(e) => editPurchase('mode', e.target.value)}
          >
            <option value="tariff">Tariff zones</option>
            <option value="market">Market (dynamic tariff)</option>
          </CFormSelect>
        </Field>
        <Field label="Surcharge on the market price, ct/kWh">
          <CFormInput
            type="number"
            step="0.01"
            min={0}
            disabled={purchase.mode !== 'market'}
            value={purchase.surchargeCtKwh ?? ''}
            onChange={(e) => editPurchase('surchargeCtKwh', num(e.target.value))}
          />
        </Field>
      </CRow>
      <div className="small text-body-secondary mb-1">
        Tariff zones - the time of day, local; a zone may wrap midnight. With the market price they
        label the slots and price them when the market data is missing.
      </div>
      {zones.map((z, i) => (
        <CRow key={i} className="g-2 mb-1 align-items-center">
          <CCol xs={3}>
            <CFormInput
              size="sm"
              placeholder="key, e.g. night"
              value={z.key}
              onChange={(e) => editZone(i, 'key', e.target.value)}
            />
          </CCol>
          <CCol xs={2}>
            <CFormInput
              size="sm"
              type="time"
              value={z.from}
              onChange={(e) => editZone(i, 'from', e.target.value)}
            />
          </CCol>
          <CCol xs={2}>
            <CFormInput
              size="sm"
              type="time"
              value={z.to}
              onChange={(e) => editZone(i, 'to', e.target.value)}
            />
          </CCol>
          <CCol xs={3}>
            <CFormInput
              size="sm"
              type="number"
              step="0.01"
              placeholder="ct/kWh"
              value={z.priceCtKwh ?? ''}
              onChange={(e) => editZone(i, 'priceCtKwh', num(e.target.value))}
            />
          </CCol>
          <CCol xs={2}>
            <CButton
              size="sm"
              color="danger"
              variant="ghost"
              title="Remove the zone"
              onClick={() => setZones(zones.filter((_, j) => j !== i))}
            >
              <CIcon icon={cilTrash} />
            </CButton>
          </CCol>
        </CRow>
      ))}
      <CButton
        size="sm"
        color="secondary"
        variant="outline"
        onClick={() => setZones([...zones, { key: '', from: '00:00', to: '00:00', priceCtKwh: 0 }])}
      >
        <CIcon icon={cilPlus} /> Zone
      </CButton>

      <h6 className="mt-4">Selling</h6>
      <CRow className="g-3">
        <Field label="Price">
          <CFormSelect
            value={sale.mode ?? 'fixed'}
            onChange={(e) => editSale('mode', e.target.value)}
          >
            <option value="fixed">Fixed (feed-in tariff)</option>
            <option value="market">Market (direct marketing)</option>
          </CFormSelect>
        </Field>
        <Field label="Fixed price, ct/kWh">
          <CFormInput
            type="number"
            step="0.01"
            min={0}
            disabled={sale.mode === 'market'}
            value={sale.fixedCtKwh ?? ''}
            onChange={(e) => editSale('fixedCtKwh', num(e.target.value))}
          />
        </Field>
        <Field label="Marketer's fee, ct/kWh">
          <CFormInput
            type="number"
            step="0.01"
            min={0}
            disabled={sale.mode !== 'market'}
            value={sale.deductionCtKwh ?? ''}
            onChange={(e) => editSale('deductionCtKwh', num(e.target.value))}
          />
        </Field>
      </CRow>

      <h6 className="mt-4">Market, connection, quality</h6>
      <CRow className="g-3">
        <Field label="Bidding zone">
          <CFormInput
            placeholder="DE-LU"
            value={market.biddingZone ?? ''}
            onChange={(e) => editMarket('biddingZone', e.target.value.trim())}
          />
        </Field>
        <Field label="Market refresh, min">
          <CFormInput
            type="number"
            min={15}
            placeholder="60"
            value={market.refreshMinutes ?? ''}
            onChange={(e) => editMarket('refreshMinutes', num(e.target.value))}
          />
        </Field>
        <Field label="Max import, kW">
          <CFormInput
            type="number"
            min={0}
            value={limits.maxImportKw ?? ''}
            onChange={(e) => editLimits('maxImportKw', num(e.target.value))}
          />
        </Field>
        <Field label="Max export, kW">
          <CFormInput
            type="number"
            min={0}
            value={limits.maxExportKw ?? ''}
            onChange={(e) => editLimits('maxExportKw', num(e.target.value))}
          />
        </Field>
        <Field label="Nominal voltage, V">
          <CFormInput
            type="number"
            placeholder="230"
            value={quality.nominalV ?? ''}
            onChange={(e) => editQuality('nominalV', num(e.target.value))}
          />
        </Field>
        <Field label="Voltage tolerance, %">
          <CFormInput
            type="number"
            placeholder="10"
            value={quality.voltageTolerancePct ?? ''}
            onChange={(e) => editQuality('voltageTolerancePct', num(e.target.value))}
          />
        </Field>
        <Field label="Frequency tolerance, Hz">
          <CFormInput
            type="number"
            step="0.01"
            placeholder="0.2"
            value={quality.frequencyToleranceHz ?? ''}
            onChange={(e) => editQuality('frequencyToleranceHz', num(e.target.value))}
          />
        </Field>
        <Field label="Time zone (tariff zones, the day)">
          <CFormInput
            placeholder="the server's"
            value={timeZone}
            onChange={(e) => {
              setTimeZone(e.target.value)
              stage('timeZone', e.target.value.trim() || undefined)
            }}
          />
        </Field>
      </CRow>
    </>
  )
}

EnergyGridSettingsSection.settingsTabs = ['Configuration']

export default EnergyGridSettingsSection
