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

// The "energy-field" process (CORE Library package) - the engineer's view
// in the process row: the mode and its decision, the totals, today, the
// battery array, the groups' blocks and turbines with their switches.
// The user's scene is the Dashboard component (the coming stage).
// Changes are the process's commands (processes.control).

const n = (v, d = 1) => (v === null || v === undefined ? '-' : Number(v).toFixed(d))
const MODES = [
  ['auto', 'Auto'],
  ['manual', 'Manual'],
  ['island', 'Island'],
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
  const groups = [...(m.groups ?? []), { key: null, name: 'Ungrouped' }]
  const itemsOf = (key) => [
    ...(m.pv ?? []).filter((x) => (x.group ?? null) === key).map((x) => ({ ...x, kind: 'PV' })),
    ...(m.wind ?? []).filter((x) => (x.group ?? null) === key).map((x) => ({ ...x, kind: 'Wind' })),
  ]

  if (!m.totals)
    return (
      <div className="text-body-secondary small px-2 pb-3">
        No state yet - the process hasn't run.
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
            <span className="small">kW (+ discharge / - charge)</span>
            <CButton
              size="sm"
              color="secondary"
              variant="outline"
              onClick={() => send('setManualPower', { kw: Number(manualKw) })}
            >
              Set
            </CButton>
          </span>
        )}
        <CFormCheck
          label="Export allowed"
          checked={m.strategy?.exportAllowed ?? true}
          disabled={!control}
          onChange={(e) => send('setExport', { allowed: e.target.checked })}
        />
        {error && <span className="text-danger small">{error}</span>}
      </div>

      <CRow className="g-4 mb-3">
        <Total label="PV" value={n(t.pvKw)} />
        <Total label="Wind" value={n(t.windKw)} />
        <Total label="Consumption" value={n(t.loadKw)} />
        <Total
          label={t.batteryKw >= 0 ? 'Battery - discharge' : 'Battery - charge'}
          value={n(Math.abs(t.batteryKw ?? 0))}
        />
        <Total
          label={t.gridKw >= 0 ? 'Grid - import' : 'Grid - export'}
          value={n(Math.abs(t.gridKw ?? 0))}
          className={t.gridKw < 0 ? 'text-success' : undefined}
        />
        <Total label="Batteries" value={n(t.socPct, 0)} unit="%" />
        {t.curtailedKw > 0 && (
          <Total label="Held back" value={n(t.curtailedKw)} className="text-warning" />
        )}
        {t.shedKw > 0 && <Total label="Not covered" value={n(t.shedKw)} className="text-danger" />}
      </CRow>
      <div className="small text-body-secondary mb-3">
        Today: PV {n(today.pvKwh)} kWh, wind {n(today.windKwh)} kWh, consumption {n(today.loadKwh)}{' '}
        kWh, charged {n(today.chargeKwh)} / discharged {n(today.dischargeKwh)} kWh, import{' '}
        {n(today.importKwh)} / export {n(today.exportKwh)} kWh, self-sufficiency{' '}
        {n(today.selfSufficiencyPct, 0)} %
        {m.price && `; price now ${n(m.price.buyCtKwh, 2)} / ${n(m.price.sellCtKwh, 2)} ct/kWh`}
        {m.weather &&
          `; sun ${n(m.weather.radiationWm2, 0)} W/m², wind ${n(m.weather.windMs)} m/s, ${n(m.weather.temperatureC)} °C`}
      </div>

      <strong>Battery array</strong>
      <CTable small responsive className="mb-3">
        <CTableHead>
          <CTableRow>
            <CTableHeaderCell>Unit</CTableHeaderCell>
            <CTableHeaderCell style={{ width: '30%' }}>State of charge</CTableHeaderCell>
            <CTableHeaderCell>Power, kW</CTableHeaderCell>
            <CTableHeaderCell>DC</CTableHeaderCell>
            <CTableHeaderCell>On</CTableHeaderCell>
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
                {b.kw > 0 ? `${n(b.kw)} out` : b.kw < 0 ? `${n(-b.kw)} in` : '0'}
              </CTableDataCell>
              <CTableDataCell>
                {n(b.voltage, 0)} V, {n(b.currentA)} A
              </CTableDataCell>
              <CTableDataCell>
                <CFormCheck
                  checked={b.on}
                  disabled={!control}
                  onChange={(e) =>
                    send('setEnabled', { nodeId: b.nodeId, enabled: e.target.checked })
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
              kW, wind{' '}
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
                        send('setEnabled', { nodeId: x.nodeId, enabled: e.target.checked })
                      }
                    />
                  </div>
                  <div>
                    {n(x.kw, 2)} kW{' '}
                    {x.kind === 'Wind' && (
                      <span className="text-body-secondary">{n(x.rpm, 0)} rpm</span>
                    )}{' '}
                    {x.state === 'storm' && <CBadge color="warning">storm</CBadge>}
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
