import React, { useState } from 'react'
import {
  CBadge,
  CButton,
  CButtonGroup,
  CCol,
  CFormCheck,
  CFormInput,
  CProgress,
  CRow,
  CTable,
  CTableBody,
  CTableDataCell,
  CTableHead,
  CTableHeaderCell,
  CTableRow,
} from '@coreui/react'
import { api } from 'src/api/client'
import { useProcessLiveState } from 'src/api/useLiveProcess'
import { useCan } from 'src/access'
import { packageT } from 'src/i18n'
// the package's words (its own locales/, then the core's)
const tr = packageT('energy-field')

// The "energy-field" process (CORE Library package) - the engineer's view
// in the process row: the mode and its decision, the totals, today, the
// battery array, the groups' blocks and turbines with their switches.
// The user's scene is the Dashboard component (the coming stage).
// Changes are the process's commands (processes.control).

const n = (v, d = 1) => (v === null || v === undefined ? '-' : Number(v).toFixed(d))
const MODES = [
  ['auto', tr('Auto')],
  ['manual', tr('Manual')],
  ['island', tr('Island')],
]

const Total = ({ label, value, unit = 'kW', className }) => (
  <CCol xs="auto">
    <div className="text-body-secondary small">{label}</div>
    <div className={className} style={{ fontSize: '1.5rem', fontWeight: 600, lineHeight: 1.1 }}>
      {value} <small className="fs-6">{unit}</small>
    </div>
  </CCol>
)

const EnergyFieldPanel = ({ process }) => {
  const can = useCan()
  const live = useProcessLiveState(process.id)
  const m = live.metrics ?? process.metrics ?? {}
  const t = m.totals ?? {}
  const today = m.today ?? {}
  const control = can('processes.control', { process: process.id })
  const [error, setError] = useState(null)
  const [manualKw, setManualKw] = useState(String(m.strategy?.manualBatteryKw ?? 0))
  const send = (action, params) => {
    setError(null)
    api.sendProcessCommand(process.id, action, params).catch((err) => setError(err.message))
  }
  const groups = [...(m.groups ?? []), { key: null, name: tr('Ungrouped') }]
  const itemsOf = (key) => [
    ...(m.pv ?? []).filter((x) => (x.group ?? null) === key).map((x) => ({ ...x, kind: 'PV' })),
    ...(m.wind ?? []).filter((x) => (x.group ?? null) === key).map((x) => ({ ...x, kind: 'Wind' })),
  ]

  if (!m.totals)
    return (
      <div className="text-body-secondary small px-2 pb-3">
        {tr("No state yet - the process hasn't run.")}
      </div>
    )

  return (
    <div className="pt-0 pb-3 px-2">
      <div className="d-flex align-items-center gap-3 flex-wrap mb-3">
        <CButtonGroup size="sm">
          {MODES.map(([key, label]) => (
            <CButton
              key={key}
              color="primary"
              variant={m.mode === key ? undefined : 'outline'}
              disabled={!control}
              onClick={() => send('setMode', { mode: key })}
            >
              {label}
            </CButton>
          ))}
        </CButtonGroup>
        <span>{m.decision}</span>
        {m.mode === 'manual' && control && (
          <span className="d-flex align-items-center gap-2">
            <CFormInput
              size="sm"
              type="number"
              style={{ width: '6rem' }}
              value={manualKw}
              onChange={(e) => setManualKw(e.target.value)}
            />
            <span className="small">{tr('kW (+ discharge / - charge)')}</span>
            <CButton
              size="sm"
              color="secondary"
              variant="outline"
              onClick={() => send('setManualPower', { kw: Number(manualKw) })}
            >
              {tr('Set')}
            </CButton>
          </span>
        )}
        <CFormCheck
          label={tr('Export allowed')}
          checked={m.strategy?.exportAllowed ?? true}
          disabled={!control}
          onChange={(e) => send('setExport', { allowed: e.target.checked })}
        />
        {error && <span className="text-danger small">{error}</span>}
      </div>

      <CRow className="g-4 mb-3">
        <Total label="PV" value={n(t.pvKw)} />
        <Total label={tr('Wind')} value={n(t.windKw)} />
        <Total label={tr('Consumption')} value={n(t.loadKw)} />
        <Total
          label={t.batteryKw >= 0 ? tr('Battery - discharge') : tr('Battery - charge')}
          value={n(Math.abs(t.batteryKw ?? 0))}
        />
        <Total
          label={t.gridKw >= 0 ? tr('Grid - import') : tr('Grid - export')}
          value={n(Math.abs(t.gridKw ?? 0))}
          className={t.gridKw < 0 ? 'text-success' : undefined}
        />
        <Total label={tr('Batteries')} value={n(t.socPct, 0)} unit="%" />
        {t.curtailedKw > 0 && (
          <Total label={tr('Held back')} value={n(t.curtailedKw)} className="text-warning" />
        )}
        {t.shedKw > 0 && (
          <Total label={tr('Not covered')} value={n(t.shedKw)} className="text-danger" />
        )}
      </CRow>
      <div className="small text-body-secondary mb-3">
        {tr('Today: PV')} {n(today.pvKwh)} {tr('kWh, wind')} {n(today.windKwh)}{' '}
        {tr('kWh, consumption')} {n(today.loadKwh)} {tr('kWh, charged')} {n(today.chargeKwh)}{' '}
        {tr('/ discharged')} {n(today.dischargeKwh)} {tr('kWh, import')} {n(today.importKwh)}{' '}
        {tr('/ export')} {n(today.exportKwh)} {tr('kWh, self-sufficiency')}{' '}
        {n(today.selfSufficiencyPct, 0)} %
        {m.price &&
          tr('; price now {{n}} / {{n2}} ct/kWh', {
            n: n(m.price.buyCtKwh, 2),
            n2: n(m.price.sellCtKwh, 2),
          })}
        {m.weather &&
          tr('; sun {{n}} W/m², wind {{n2}} m/s, {{n22}} °C', {
            n: n(m.weather.radiationWm2, 0),
            n2: n(m.weather.windMs),
            n22: n(m.weather.temperatureC),
          })}
      </div>

      <strong>{tr('Battery array')}</strong>
      <CTable small responsive className="mb-3">
        <CTableHead>
          <CTableRow>
            <CTableHeaderCell>{tr('Unit')}</CTableHeaderCell>
            <CTableHeaderCell style={{ width: '30%' }}>{tr('State of charge')}</CTableHeaderCell>
            <CTableHeaderCell>{tr('Power, kW')}</CTableHeaderCell>
            <CTableHeaderCell>DC</CTableHeaderCell>
            <CTableHeaderCell>{tr('On')}</CTableHeaderCell>
          </CTableRow>
        </CTableHead>
        <CTableBody>
          {(m.batteries ?? []).map((b) => (
            <CTableRow key={b.nodeId}>
              <CTableDataCell>{b.name}</CTableDataCell>
              <CTableDataCell>
                <CProgress
                  value={b.socPct}
                  color={b.socPct < 20 ? 'danger' : b.socPct < 40 ? 'warning' : 'success'}
                  className="mb-0"
                >
                  {n(b.socPct, 0)} %
                </CProgress>
              </CTableDataCell>
              <CTableDataCell>
                {b.kw > 0
                  ? tr('{{n}} out', { n: n(b.kw) })
                  : b.kw < 0
                    ? tr('{{n}} in', { n: n(-b.kw) })
                    : '0'}
              </CTableDataCell>
              <CTableDataCell>
                {n(b.voltage, 0)} {tr('V,')} {n(b.currentA)} A
              </CTableDataCell>
              <CTableDataCell>
                <CFormCheck
                  checked={b.on}
                  disabled={!control}
                  onChange={(e) =>
                    send('setEnabled', {
                      nodeId: b.nodeId,
                      enabled: e.target.checked,
                    })
                  }
                />
              </CTableDataCell>
            </CTableRow>
          ))}
        </CTableBody>
      </CTable>

      {groups.map((g) => {
        const items = itemsOf(g.key)
        if (!items.length) return null
        return (
          <div key={g.key ?? '-'} className="mb-3">
            <strong>{g.name}</strong>
            <span className="text-body-secondary small ms-2">
              PV {n(g.pvKw ?? items.filter((x) => x.kind === 'PV').reduce((a, x) => a + x.kw, 0))}{' '}
              {tr('kW, wind')}{' '}
              {n(g.windKw ?? items.filter((x) => x.kind === 'Wind').reduce((a, x) => a + x.kw, 0))}{' '}
              kW
            </span>
            <div className="d-flex flex-wrap gap-2 mt-1">
              {items.map((x) => (
                <div
                  key={x.nodeId}
                  className="border rounded px-2 py-1 small"
                  style={{ minWidth: '8rem' }}
                >
                  <div className="d-flex justify-content-between align-items-center gap-2">
                    <span className="text-truncate">{x.name}</span>
                    <CFormCheck
                      checked={x.on !== false && x.state !== 'off'}
                      disabled={!control}
                      onChange={(e) =>
                        send('setEnabled', {
                          nodeId: x.nodeId,
                          enabled: e.target.checked,
                        })
                      }
                    />
                  </div>
                  <div>
                    {n(x.kw, 2)} kW{' '}
                    {x.kind === 'Wind' && (
                      <span className="text-body-secondary">{n(x.rpm, 0)} rpm</span>
                    )}{' '}
                    {x.state === 'storm' && <CBadge color="warning">{tr('storm')}</CBadge>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default EnergyFieldPanel
