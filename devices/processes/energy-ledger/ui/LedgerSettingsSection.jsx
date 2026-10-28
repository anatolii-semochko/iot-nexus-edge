import React, { useState } from 'react'
import { CCol, CFormInput, CFormLabel, CFormSwitch, CRow } from '@coreui/react'

// The Energy Ledger's engineer settings (Processes -> its Settings; processes.config - iot
// AGENTS_TO_DO.md 2026-10-25, S3): how it manages the energy - the operating parameters its plan keeps
// (the outage reserve, selling, charging from the grid - also switched on the Energy scene), the
// strategies' parameters, the plan's timing and the batteries' wear, the holidays' calendar. The
// operation (the strategy, the selection, the day's notes) stays on the Ledger's scene. The cost
// accounts - in the config (JSON) for now. Staged; the modal's Save sends the changed sections ('*').

const numberOr = (text) => (text.trim() === '' ? undefined : Number(text))

const Num = ({ label, hint, value, placeholder, onChange, step }) => (
  <CCol sm={4}>
    <CFormLabel title={hint}>{label}</CFormLabel>
    <CFormInput
      type="number"
      step={step}
      value={value ?? ''}
      placeholder={placeholder}
      onChange={(e) => onChange(numberOr(e.target.value))}
    />
  </CCol>
)

const LedgerSettingsSection = ({ process, extraConfigRef }) => {
  const c = process.config ?? {}
  const [strategy, setStrategy] = useState(c.strategy ?? {})
  const [plan, setPlan] = useState(c.plan ?? {})
  const [calendar, setCalendar] = useState(c.calendar ?? {})
  const stage = (section, value) => {
    extraConfigRef.current = { ...(extraConfigRef.current ?? {}), [section]: value }
  }
  const edit = (state, setState, section, key, value) => {
    const next = { ...state, [key]: value }
    if (value === undefined || value === '') delete next[key]
    setState(next)
    stage(section, next)
  }
  const s = (key, value) => edit(strategy, setStrategy, 'strategy', key, value)
  const p = (key, value) => edit(plan, setPlan, 'plan', key, value)
  const cal = (key, value) => edit(calendar, setCalendar, 'calendar', key, value)

  return (
    <>
      <h6>Operating parameters</h6>
      <p className="small text-body-secondary mb-2">
        What the plan keeps, over the energy field&apos;s own (empty - the field&apos;s). The
        operator switches them on the Energy scene too.
      </p>
      <CRow className="g-3 mb-2">
        <Num
          label="Outage reserve, %"
          hint="The batteries' charge the plan keeps for an outage (an outage note's window may use it)"
          value={strategy.reservePct}
          placeholder="the field's"
          onChange={(v) => s('reservePct', v)}
        />
      </CRow>
      <div className="d-flex gap-4 mb-4 flex-wrap">
        <CFormSwitch
          id={`ledger-export-${process.id}`}
          label="Selling allowed"
          checked={strategy.exportAllowed ?? true}
          onChange={(e) => s('exportAllowed', e.target.checked)}
        />
        <CFormSwitch
          id={`ledger-gridcharge-${process.id}`}
          label="Charging from the grid allowed"
          checked={strategy.gridChargeAllowed ?? true}
          onChange={(e) => s('gridChargeAllowed', e.target.checked)}
        />
      </div>

      <h6>Strategies</h6>
      <CRow className="g-3 mb-4">
        <Num
          label="Reserve strategy's level, %"
          hint='"Reserve" keeps the batteries this high (e.g. before a storm)'
          value={strategy.reserveHighPct}
          placeholder="80"
          onChange={(v) => s('reserveHighPct', v)}
        />
        <Num
          label="Peak limit, kW"
          hint={`"Peak shaving" keeps the import under it (a business's capacity charge); empty - not offered`}
          value={strategy.peakLimitKw}
          placeholder="none"
          onChange={(v) => s('peakLimitKw', v ?? null)}
        />
        <Num
          label="Over the peak, ct/kWh"
          hint="What a kWh over the peak limit counts as"
          value={strategy.peakPenaltyCtKwh}
          placeholder="200"
          onChange={(v) => s('peakPenaltyCtKwh', v)}
        />
        <Num
          label="Sell above, ct/kWh"
          hint='"Sales" sells the stored energy only above this price'
          value={strategy.sellThresholdCt}
          placeholder="15"
          step="0.1"
          onChange={(v) => s('sellThresholdCt', v)}
        />
        <Num
          label="A change pays over, EUR"
          hint="A strategy is proposed / recommended only when it saves more than this"
          value={strategy.minGainEur}
          placeholder="1"
          step="0.1"
          onChange={(v) => s('minGainEur', v)}
        />
      </CRow>

      <h6>The plan</h6>
      <CRow className="g-3 mb-4">
        <Num
          label="Re-made every, min"
          hint="The plan's regular update (also on new day-ahead prices, the day's notes, a drift)"
          value={plan.intradayMinutes}
          placeholder="60"
          onChange={(v) => p('intradayMinutes', v)}
        />
        <Num
          label="Re-made on a drift over, %"
          hint="When the batteries' charge leaves the plan's by this much"
          value={plan.deviationPct}
          placeholder="10"
          onChange={(v) => p('deviationPct', v)}
        />
        <Num
          label="Batteries' wear, ct/kWh"
          hint="Per kWh discharged - the plan weighs it against the price gaps"
          value={plan.wearCtKwh}
          placeholder="3"
          step="0.1"
          onChange={(v) => p('wearCtKwh', v)}
        />
        <Num
          label="One-way efficiency"
          hint="The batteries' charge / discharge efficiency, 0.7..1"
          value={plan.efficiency}
          placeholder="0.97"
          step="0.01"
          onChange={(v) => p('efficiency', v)}
        />
      </CRow>

      <h6>The holidays&apos; calendar</h6>
      <p className="small text-body-secondary mb-2">
        The public holidays of the country written as the Ledger&apos;s notes ahead (the plan takes
        a holiday&apos;s consumption as a day off&apos;s). Empty country - none.
      </p>
      <CRow className="g-3">
        <CCol sm={4}>
          <CFormLabel title="ISO 3166 code, e.g. DE">Country</CFormLabel>
          <CFormInput
            value={calendar.country ?? ''}
            maxLength={3}
            placeholder="DE"
            onChange={(e) => cal('country', e.target.value.trim().toUpperCase() || undefined)}
          />
        </CCol>
        <CCol sm={4}>
          <CFormLabel title="The state / province code, e.g. HE (Hesse)">Region</CFormLabel>
          <CFormInput
            value={calendar.region ?? ''}
            maxLength={10}
            placeholder="HE"
            onChange={(e) => cal('region', e.target.value.trim().toUpperCase() || undefined)}
          />
        </CCol>
        <Num
          label="Days ahead"
          value={calendar.aheadDays}
          placeholder="14"
          onChange={(v) => cal('aheadDays', v)}
        />
      </CRow>
    </>
  )
}

export default LedgerSettingsSection
