import React, { useState } from 'react'
import {
  CButton,
  CFormInput,
  CFormLabel,
  CFormSelect,
  CFormSwitch,
  CModal,
  CModalBody,
  CModalFooter,
  CModalHeader,
  CModalTitle,
} from '@coreui/react'
import { api, request } from 'src/api/client'
import { useCan } from 'src/access'
import { useNow } from 'src/hooks/useNow'
import KeyValue from 'src/components/KeyValue'
import StatTile from 'src/components/StatTile'
import { fmt } from './useFieldData'
import { LEVEL_COLOR, priceHoursOf, priceLevel, quartersOf } from './priceLevels'

// The Energy Ledger's block (the centre of the Energy scene; the user, 2026-10-30 - the same block in the
// energy's overview too): the mode (Auto / Manual / Island), today's self-sufficiency, the plan's
// decision, the next 24 hours' prices (cheap - charge, middle, dear - sell, now), the price now (buy /
// sell - coloured by their level, as the grid's gauges), today's figures (bought, sold, the balance,
// generated, consumed), the operating switches (the grid, selling, the outage reserve). Its commands -
// the energy field's (the mode) and its Energy Ledger's (the operating parameters - each change asked
// about: why, for how long, adapt the plan now).

// self-sufficiency's colour - the config's `selfSufficiencyLevels` over these (%)
const SELF_LEVELS = { good: 60, fair: 30 }
const BAR_H = 44

const CSS = `
.ef-ledger { border: 2px solid var(--ef-panel-grid); border-radius: 12px; background: var(--ef-card); padding: 14px 18px; color: var(--ef-ink); min-width: 0 }
.ef-ledger .ef-muted { color: var(--ef-muted) }
.ef-ledger-key { display: inline-block; width: 10px; height: 6px; margin-right: 4px; vertical-align: middle }
.ef-ops .form-check, .ef-ops label { margin-bottom: 0; display: flex; align-items: center; gap: 0.4rem; white-space: nowrap }
.ef-ops .form-check { min-height: 0; padding-top: 0 }
.ef-ops .form-check-input { margin-top: 0 }
.ef-ops input[type=range] { margin: 0; vertical-align: middle }
`

const FOR_CHOICES = [
  ['', 'Until changed'],
  ['20', '20 minutes'],
  ['60', '1 hour'],
  ['240', '4 hours'],
  ['eod', 'Until the end of the day'],
  ['other', 'Other...'],
]
const durationText = (min) => (min < 60 ? `${Math.round(min)} min` : `${+(min / 60).toFixed(1)} h`)

/**
 * An operating change asked about (the user, 2026-10-25): why (optional - the command log, a day note the
 * AI reads), for how long (the process puts the previous value back itself at the time), and whether to
 * adapt the batteries' plan now.
 */
const ChangeModal = ({ label, canAdapt, onCancel, onConfirm }) => {
  const [reason, setReason] = useState('')
  const [choice, setChoice] = useState('')
  const [amount, setAmount] = useState('30')
  const [unit, setUnit] = useState('min')
  const minutes = (() => {
    if (choice === 'eod') {
      const end = new Date()
      end.setHours(24, 0, 0, 0)
      return Math.max(1, Math.round((end.getTime() - Date.now()) / 60_000))
    }
    if (choice === 'other') {
      const n = Number(amount)
      return Number.isFinite(n) && n > 0 ? Math.round(unit === 'h' ? n * 60 : n) : null
    }
    return choice ? Number(choice) : null
  })()
  const extra = { reason: reason.trim(), forMinutes: minutes }
  const invalid = choice === 'other' && !minutes
  return (
    <CModal visible alignment="center" onClose={onCancel}>
      <CModalHeader>
        <CModalTitle>{label}</CModalTitle>
      </CModalHeader>
      <CModalBody className="d-flex flex-column gap-3">
        <div>
          <CFormLabel className="small mb-1">Why (optional)</CFormLabel>
          <CFormInput
            value={reason}
            maxLength={200}
            placeholder="e.g. a storm coming, repairs on the inverter"
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
        <div>
          <CFormLabel className="small mb-1">For</CFormLabel>
          <div className="d-flex gap-2 flex-wrap">
            <CFormSelect
              value={choice}
              style={{ width: 'auto' }}
              onChange={(e) => setChoice(e.target.value)}
            >
              {FOR_CHOICES.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </CFormSelect>
            {choice === 'other' && (
              <>
                <CFormInput
                  type="number"
                  min={1}
                  value={amount}
                  style={{ width: 90 }}
                  aria-label="How long"
                  onChange={(e) => setAmount(e.target.value)}
                />
                <CFormSelect
                  value={unit}
                  style={{ width: 'auto' }}
                  aria-label="The unit"
                  onChange={(e) => setUnit(e.target.value)}
                >
                  <option value="min">min</option>
                  <option value="h">hours</option>
                </CFormSelect>
              </>
            )}
          </div>
          {minutes && (
            <div className="small text-body-secondary mt-1">
              Put back by itself in {durationText(minutes)}.
            </div>
          )}
        </div>
        {canAdapt && (
          <div className="small">
            Adapt the batteries&apos; plan to the new value now? Otherwise the value is switched and
            the plan follows it at its next update.
          </div>
        )}
      </CModalBody>
      <CModalFooter>
        <CButton color="secondary" variant="ghost" onClick={onCancel}>
          Cancel
        </CButton>
        <CButton
          color={canAdapt ? 'secondary' : 'primary'}
          variant={canAdapt ? 'outline' : undefined}
          disabled={invalid}
          onClick={() => onConfirm(false, extra)}
        >
          {canAdapt ? 'Only switch' : 'Switch'}
        </CButton>
        {canAdapt && (
          <CButton color="primary" disabled={invalid} onClick={() => onConfirm(true, extra)}>
            Adapt the plan
          </CButton>
        )}
      </CModalFooter>
    </CModal>
  )
}

/** A legend's key: its colour's swatch and the words. */
const Key = ({ color, outline, children, title }) => (
  <span title={title}>
    <span
      className="ef-ledger-key"
      style={{ background: color, outline: outline ? '1px solid var(--ef-ink)' : undefined }}
    />
    {children}
  </span>
)

/**
 * `process` - the energy field; `data` - its useFieldData (m, gridMetrics, prices).
 */
const LedgerBlock = ({ process, data }) => {
  const { m, gridMetrics, prices } = data
  const can = useCan()
  const now = useNow(60_000)
  const [error, setError] = useState(null)
  const [pending, setPending] = useState(null)
  const [reserveDraft, setReserveDraft] = useState(null)
  const control = can('processes.control', { process: process.id })
  const ledgerId = process.config?.ledgerProcessId ?? null
  const send = (action, params) => {
    setError(null)
    api.sendProcessCommand(process.id, action, params).catch((err) => setError(err.message))
  }
  // the operating parameters belong to the Energy Ledger (its plan keeps them)
  const sendLedger = (action, params) => {
    if (!ledgerId) return
    setError(null)
    api.sendProcessCommand(ledgerId, action, params).catch((err) => setError(err.message))
  }
  // `apply(adapt, { reason, forMinutes })`; `noteOn` - the process whose day note tells why / for how long
  const ask = (label, apply, noteOn) => setPending({ label, apply, noteOn })
  const confirmChange = (adapt, { reason, forMinutes }) => {
    pending.apply(adapt, { ...(reason ? { reason } : {}), ...(forMinutes ? { forMinutes } : {}) })
    // the reason and the time - a day note of the process (the AI sees it), the window - the change's time
    if ((reason || forMinutes) && pending.noteOn) {
      const at = new Date()
      const day = `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`
      request(`/processes/${pending.noteOn}/day-notes`, {
        method: 'POST',
        body: JSON.stringify({
          day,
          kind: 'other',
          text: `${pending.label}${forMinutes ? ` for ${durationText(forMinutes)}` : ''}${reason ? ` - ${reason}` : ''}`,
          startsAt: at.toISOString(),
          endsAt: forMinutes ? new Date(at.getTime() + forMinutes * 60_000).toISOString() : null,
        }),
      }).catch((err) => setError(err.message))
    }
    setPending(null)
  }
  const reserveChosen = (pct) => {
    if (pct === (m.strategy?.reservePct ?? 20)) return setReserveDraft(null)
    if (!ledgerId) {
      send('setReserve', { pct })
      return setReserveDraft(null)
    }
    ask(
      `Outage reserve ${pct} %`,
      (adapt, extra) => {
        sendLedger('setOperating', { reservePct: pct, replan: adapt, ...extra })
        setReserveDraft(null)
      },
      ledgerId,
    )
  }
  if (!m.totals) return null

  const today = m.today ?? {}
  const balance = (gridMetrics?.today?.revenueEur ?? 0) - (gridMetrics?.today?.costEur ?? 0)
  const hours = priceHoursOf(prices, now)
  const buyQ = quartersOf(hours.map((p) => p.buy))
  const maxCt = Math.max(1, ...hours.map((p) => p.buy ?? 0))
  const buyLevel = priceLevel(
    gridMetrics?.buyCtKwh,
    hours.map((p) => p.buy),
  )
  const sellLevel = priceLevel(
    gridMetrics?.sellCtKwh,
    hours.map((p) => p.sell),
    true,
  )
  const selfLevels = { ...SELF_LEVELS, ...(process.config?.selfSufficiencyLevels ?? {}) }
  const self = today.selfSufficiencyPct
  const selfColor =
    self == null
      ? undefined
      : self >= selfLevels.good
        ? 'success'
        : self >= selfLevels.fair
          ? 'warning'
          : 'danger'
  const reserveShown = reserveDraft ?? m.strategy?.reservePct ?? 20
  const levelClass = (l) => (l ? `text-${LEVEL_COLOR[l.level]}` : undefined)

  return (
    <section className="ef-ledger">
      <style>{CSS}</style>
      <div className="d-flex align-items-center justify-content-between gap-2 flex-wrap mb-2">
        <div className="btn-group" role="group" aria-label="Mode">
          {[
            ['auto', 'Auto', 'The batteries follow the prices and the surplus by themselves'],
            ['manual', 'Manual', 'The batteries at the power you set'],
            [
              'island',
              'Island',
              'Off the grid - the site lives on its own generation and batteries',
            ],
          ].map(([key, label, hint]) => (
            <CButton
              key={key}
              color="primary"
              variant={m.mode === key ? undefined : 'outline'}
              disabled={!control}
              title={control ? hint : `${hint} - you may only watch`}
              aria-pressed={m.mode === key}
              onClick={() => send('setMode', { mode: key })}
            >
              {label}
            </CButton>
          ))}
        </div>
        <span
          className="small ef-muted"
          title={`The share of today's consumption covered by our own generation - good from ${selfLevels.good} %, fair from ${selfLevels.fair} %`}
        >
          Self-sufficiency today:{' '}
          <KeyValue
            value={fmt(self, 0)}
            unit="%"
            className={selfColor ? `text-${selfColor}` : undefined}
          />
        </span>
      </div>
      {error && <div className="small text-danger mb-1">{error}</div>}
      <div className="fw-semibold mb-2">{m.decision}</div>
      {hours.length > 0 && buyQ && (
        <div className="mb-2">
          <div className="d-flex justify-content-between small ef-muted">
            <span>Prices, the next 24 hours</span>
            <span>ct/kWh</span>
          </div>
          <div
            className="d-flex align-items-end"
            style={{ gap: 2, height: BAR_H + 2 }}
            role="img"
            aria-label="Buy prices by hour"
          >
            {hours.map((p) => (
              <div
                key={p.t}
                title={`${new Date(p.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - buy ${fmt(p.buy, 1)}, sell ${fmt(p.sell, 1)} ct/kWh`}
                style={{
                  flex: '1 1 0',
                  height: `${Math.max(3, ((p.buy ?? 0) / maxCt) * BAR_H)}px`,
                  background: p.now
                    ? 'var(--ef-grid)'
                    : p.buy <= buyQ.low
                      ? 'var(--ef-batt)'
                      : p.buy >= buyQ.high
                        ? 'var(--ef-cons)'
                        : 'var(--ef-panel-grid)',
                  outline: p.now ? '2px solid var(--ef-ink)' : undefined,
                  borderRadius: '2px 2px 0 0',
                }}
              />
            ))}
          </div>
          <div className="d-flex gap-3 small ef-muted flex-wrap mt-1">
            <Key
              color="var(--ef-batt)"
              title="The cheapest quarter of the hours - the batteries charge"
            >
              cheap - charge
            </Key>
            <Key
              color="var(--ef-panel-grid)"
              title="The hours between the cheap and the dear quarter"
            >
              middle
            </Key>
            <Key
              color="var(--ef-cons)"
              title="The dearest quarter of the hours - the batteries give, the surplus sold"
            >
              dear - sell
            </Key>
            <Key color="var(--ef-grid)" outline title="The hour now">
              now
            </Key>
            <span
              className="ms-auto"
              title="The price now - buy / sell, ct/kWh: green good for us, yellow middle, red not (as the grid's gauges)"
            >
              now{' '}
              <KeyValue value={fmt(gridMetrics?.buyCtKwh, 1)} className={levelClass(buyLevel)} /> /{' '}
              <KeyValue value={fmt(gridMetrics?.sellCtKwh, 1)} className={levelClass(sellLevel)} />
            </span>
          </div>
        </div>
      )}
      <div
        className="d-grid mb-2"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(84px, 1fr))', gap: 8 }}
      >
        <StatTile label="Bought">
          <KeyValue value={fmt(today.importKwh, 0)} unit="kWh" color="var(--ef-cost)" />
        </StatTile>
        <StatTile label="Sold">
          <KeyValue value={fmt(today.exportKwh, 0)} unit="kWh" color="var(--ef-gain)" />
        </StatTile>
        <StatTile label="Balance">
          <KeyValue
            value={`${balance >= 0 ? '+' : ''}${fmt(balance, 2)}`}
            unit="EUR"
            color={balance >= 0 ? 'var(--ef-gen)' : 'var(--ef-bad)'}
          />
        </StatTile>
        <StatTile label="Generated">
          <KeyValue
            value={fmt((today.pvKwh ?? 0) + (today.windKwh ?? 0), 0)}
            unit="kWh"
            color="var(--ef-gain)"
          />
        </StatTile>
        <StatTile label="Consumed">
          <KeyValue value={fmt(today.loadKwh, 0)} unit="kWh" color="var(--ef-cons)" />
        </StatTile>
      </div>
      {/* one line: the switches' own margin and the label's taken off (the user, 2026-10-25) */}
      <div className="d-flex gap-2 align-items-center justify-content-between small ef-ops flex-wrap">
        <CFormSwitch
          id={`ef-grid-${process.id}`}
          label="Grid connected"
          title="Connected to the grid - off switches the site to island mode"
          checked={m.mode !== 'island'}
          disabled={!control}
          onChange={(e) => {
            const mode = e.target.checked ? 'auto' : 'island'
            ask(
              mode === 'island' ? 'Island mode - off the grid' : 'Back on the grid',
              (adapt, extra) => {
                send('setMode', { mode, ...extra })
                if (adapt) sendLedger('replan', {})
              },
              process.id,
            )
          }}
        />
        <CFormSwitch
          id={`ef-export-${process.id}`}
          label="Selling allowed"
          title="The surplus may go to the grid at the sale price; off - it is stored or held back"
          checked={m.strategy?.exportAllowed ?? true}
          disabled={!control}
          onChange={(e) => {
            const allowed = e.target.checked
            if (!ledgerId) return send('setExport', { allowed })
            ask(
              allowed ? 'Selling allowed' : 'Selling not allowed',
              (adapt, extra) =>
                sendLedger('setOperating', { exportAllowed: allowed, replan: adapt, ...extra }),
              ledgerId,
            )
          }}
        />
        <label
          className="d-flex align-items-center gap-2 flex-grow-1 justify-content-end"
          htmlFor={`ef-reserve-${process.id}`}
          title="The outage reserve - the batteries' charge kept for an outage"
        >
          Reserve
          <input
            id={`ef-reserve-${process.id}`}
            type="range"
            min={0}
            max={80}
            step={5}
            value={reserveShown}
            disabled={!control}
            onChange={(e) => setReserveDraft(Number(e.target.value))}
            onMouseUp={(e) => reserveChosen(Number(e.target.value))}
            onKeyUp={(e) => reserveChosen(Number(e.target.value))}
            onTouchEnd={(e) => reserveChosen(Number(e.target.value))}
            style={{ flex: '1 1 auto', minWidth: 24, maxWidth: 110, width: 0 }}
          />
          <b className="text-nowrap">{reserveShown} %</b>
        </label>
      </div>
      {pending && (
        <ChangeModal
          label={pending.label}
          canAdapt={!!ledgerId}
          onCancel={() => (setPending(null), setReserveDraft(null))}
          onConfirm={confirmChange}
        />
      )}
    </section>
  )
}

export default LedgerBlock
