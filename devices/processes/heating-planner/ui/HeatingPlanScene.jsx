import React, { useState } from 'react'
import {
  CButton,
  CButtonGroup,
  CSpinner,
  CTable,
  CTableBody,
  CTableDataCell,
  CTableHead,
  CTableHeaderCell,
  CTableRow,
} from '@coreui/react'
import AiButton from 'src/components/ai/AiButton'
import KeyValue from 'src/components/KeyValue'
import { useNow } from 'src/hooks/useNow'
import StatTile from 'src/components/StatTile'
import { usePersistedState } from 'src/hooks/usePersistedState'
import PlanChart, { LEGEND } from './PlanChart'
import PlanSummary from './PlanSummary'
import Strategies from './Strategies'
import { fmt, hhmm, stepsOf, sumSystems, usePlan } from './usePlan'
import { packageT } from 'src/i18n'
// the package's words (its own locales/, then the core's)
const tr = packageT('heating-planner')

// The heating plan's page (P2 - iot AGENTS_TO_DO.md 2026-10-29): the process row's panel and the
// Dashboard component `heatingPlanner.plan`. On top - what the plan costs to the horizon's end against
// the band control (the same need made when needed), the saving, the heat pumps now; a system's
// switch (all of them or one); the chart over the horizon (PlanChart); the plan in words - its runs
// (from, to, the units, the mean heat, the price, the rooms' margin), and each system's line.

const STEPS_SHOWN = 12
const day = (t) =>
  new Date(t).toLocaleString(undefined, {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
const eur = (v) => (v == null ? '-' : Number(v).toFixed(2))

const HeatingPlanScene = ({ process, params }) => {
  const { m, plan, error } = usePlan(process)
  const now = useNow(60_000)
  const [pick, setPick] = usePersistedState(`nexusedge.heatingPlan.${process.id}`, {
    system: 'all',
  })
  if (error)
    return (
      <div className="small text-danger">
        {tr('The plan:')} {error}
      </div>
    )
  if (!plan)
    return m.madeAt ? (
      <CSpinner size="sm" />
    ) : (
      <div className="small text-body-secondary p-2">
        No plan yet - it waits for the Energy Ledger&apos;s plan.
      </div>
    )
  const systems = plan.systems ?? []
  const planned = systems.filter((x) => x.slots?.length)
  const chosen = planned.find((x) => String(x.processId) === String(pick.system)) ?? null
  const slots = chosen ? chosen.slots : sumSystems(planned)
  const mode = chosen ? chosen.mode : (planned[0]?.mode ?? 'heating')
  const cooling = mode === 'cooling'
  const sum = (k) => (chosen ? chosen[k] : planned.reduce((a, x) => a + (x[k] ?? 0), 0))
  const energy = sum('energyEur')
  const base = sum('baselineEur')
  const saving = base - energy
  const share = base > 0 ? (saving / base) * 100 : null
  const slotNow = slots.find((s) => s.t <= now && now < s.end) ?? null
  const ahead = slots.filter((s) => s.end > now)
  const steps = stepsOf(ahead).slice(0, STEPS_SHOWN)
  const horizonH = ahead.length ? (ahead[ahead.length - 1].end - now) / 3_600_000 : 0
  return (
    <div className="d-flex flex-column gap-3">
      {params !== undefined && (
        <strong style={{ fontSize: '1.4rem' }}>
          <AiButton
            subject={{ type: 'process', id: process.id }}
            label={process.name}
            size={30}
            className="me-2"
          />
          {process.name}
        </strong>
      )}
      <PlanSummary processId={process.id} madeAt={plan.madeAt} />
      <div
        className="d-grid"
        style={{
          gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
          gap: 12,
        }}
      >
        <StatTile label={tr('The plan')} hint={tr('When it was made and how far ahead it reaches')}>
          {hhmm(plan.madeAt)} · <KeyValue value={fmt(horizonH, 0)} unit="h" />
        </StatTile>
        <StatTile
          label={tr('Its electricity')}
          hint={tr("What the plan's heat pumps' electricity costs to the horizon's end")}
        >
          <KeyValue value={eur(energy)} unit="€" />
        </StatTile>
        <StatTile
          label={tr('By the band')}
          hint={tr(
            "The same need made when it is needed (the tanks' band control) - its electricity",
          )}
        >
          <KeyValue value={eur(base)} unit="€" />
        </StatTile>
        <StatTile
          label={tr('Saving')}
          hint={tr("The band's electricity less the plan's, to the horizon's end")}
        >
          <KeyValue value={eur(saving)} unit="€" className="text-success" />
          {share != null && (
            <span className="small text-body-secondary ms-1">{fmt(share, 0)} %</span>
          )}
        </StatTile>
        <StatTile
          label={tr('Now')}
          hint={tr("The heat pumps' {{v0}} and units in the slot now", {
            v0: cooling ? 'cold' : 'heat',
          })}
        >
          <KeyValue value={fmt(slotNow?.heatKw)} unit="kW" /> ·{' '}
          <KeyValue value={slotNow?.units ?? '-'} unit="units" />
        </StatTile>
        <StatTile
          label={tr('The rooms')}
          hint={tr('The rooms off their setpoint now ({{v0}} it) - the comfort margin in use', {
            v0: cooling ? 'above' : 'below',
          })}
        >
          {slotNow?.roomOffsetK > 0.05 ? (
            <>
              <KeyValue value={fmt(slotNow.roomOffsetK, 1)} unit="K" /> {tr('off')}
            </>
          ) : (
            tr('at setpoint')
          )}
        </StatTile>
      </div>

      <CButtonGroup
        size="sm"
        role="group"
        aria-label={tr('The system')}
        className="align-self-start flex-wrap"
      >
        {[{ processId: 'all', name: tr('All systems') }, ...planned].map((x) => (
          <CButton
            key={x.processId}
            color="primary"
            variant={
              String(pick.system) === String(x.processId) || (!chosen && x.processId === 'all')
                ? undefined
                : 'outline'
            }
            aria-pressed={String(pick.system) === String(x.processId)}
            onClick={() => setPick({ system: x.processId })}
          >
            {x.name}
          </CButton>
        ))}
      </CButtonGroup>

      <Strategies
        process={process}
        results={chosen ? chosen.strategies : plan.strategies}
        strategy={m.strategy ?? plan.strategy}
        followed={chosen?.strategy ?? planned[0]?.strategy ?? plan.strategy?.key}
      />

      <div>
        <PlanChart slots={slots} mode={mode} single={!!chosen} />
        <div className="d-flex flex-wrap gap-3 small text-body-secondary">
          {LEGEND.map(([key, color, label]) => (
            <span key={key}>
              <svg width="14" height="8" aria-hidden="true" className="me-1">
                <rect width="14" height="8" fill={color} />
              </svg>
              {label}
            </span>
          ))}
        </div>
      </div>

      <div>
        <h6 className="mb-2">{tr('The plan in words')}</h6>
        <CTable small responsive className="mb-0">
          <CTableHead>
            <CTableRow>
              <CTableHeaderCell>{tr('From')}</CTableHeaderCell>
              <CTableHeaderCell>{tr('To')}</CTableHeaderCell>
              <CTableHeaderCell>{tr('Heat pumps')}</CTableHeaderCell>
              <CTableHeaderCell title={tr('The mean heat over the run')}>
                {cooling ? tr('Cold') : tr('Heat')}
              </CTableHeaderCell>
              <CTableHeaderCell title={tr('The mean purchase price over the run')}>
                {tr('Price')}
              </CTableHeaderCell>
              <CTableHeaderCell title={tr('The rooms off their setpoint at most over the run')}>
                {tr('Rooms')}
              </CTableHeaderCell>
            </CTableRow>
          </CTableHead>
          <CTableBody>
            {steps.map((s) => (
              <CTableRow key={s.t}>
                <CTableDataCell>{day(Math.max(s.t, now))}</CTableDataCell>
                <CTableDataCell>{hhmm(s.end)}</CTableDataCell>
                <CTableDataCell>
                  {s.units ? (
                    tr('{{units}} running', { units: s.units })
                  ) : (
                    <span className="text-body-secondary">{tr('hold')}</span>
                  )}
                </CTableDataCell>
                <CTableDataCell>
                  <KeyValue value={fmt(s.heat / s.n)} unit="kW" />
                </CTableDataCell>
                <CTableDataCell>
                  <KeyValue value={fmt(s.ct / s.n)} unit="ct/kWh" />
                </CTableDataCell>
                <CTableDataCell>
                  {s.offset > 0.05
                    ? tr('{{fmt}} K off', { fmt: fmt(s.offset, 1) })
                    : tr('at setpoint')}
                </CTableDataCell>
              </CTableRow>
            ))}
          </CTableBody>
        </CTable>
      </div>

      {!chosen && (
        <div>
          <h6 className="mb-2">{tr('The systems')}</h6>
          <CTable small responsive className="mb-0">
            <CTableHead>
              <CTableRow>
                <CTableHeaderCell>{tr('System')}</CTableHeaderCell>
                <CTableHeaderCell>{tr('Mode')}</CTableHeaderCell>
                <CTableHeaderCell title={tr('Its available heat pumps')}>
                  {tr('Units')}
                </CTableHeaderCell>
                <CTableHeaderCell
                  title={tr("The tanks' band and the rooms' comfort margin together")}
                >
                  {tr('Store')}
                </CTableHeaderCell>
                <CTableHeaderCell
                  title={tr("The plan's electricity / the band's, to the horizon's end")}
                >
                  {tr('Plan / band')}
                </CTableHeaderCell>
                <CTableHeaderCell>{tr('Saving')}</CTableHeaderCell>
              </CTableRow>
            </CTableHead>
            <CTableBody>
              {systems.map((x) => (
                <CTableRow
                  key={x.processId}
                  role={x.slots?.length ? 'button' : undefined}
                  onClick={x.slots?.length ? () => setPick({ system: x.processId }) : undefined}
                  title={x.slots?.length ? tr('Show this system') : undefined}
                >
                  <CTableDataCell>{x.name}</CTableDataCell>
                  <CTableDataCell>{x.mode ?? x.note ?? '-'}</CTableDataCell>
                  <CTableDataCell>{x.units ?? '-'}</CTableDataCell>
                  <CTableDataCell>
                    <KeyValue value={fmt(x.storeKwh, 0)} unit="kWh" />
                    <span className="small text-body-secondary">
                      {' '}
                      ({fmt(x.marginKwh, 0)} {tr('the rooms)')}
                    </span>
                  </CTableDataCell>
                  <CTableDataCell>
                    <KeyValue value={eur(x.energyEur)} unit="€" /> /{' '}
                    <KeyValue value={eur(x.baselineEur)} unit="€" />
                  </CTableDataCell>
                  <CTableDataCell>
                    <KeyValue value={eur(x.savingEur)} unit="€" className="text-success" />
                  </CTableDataCell>
                </CTableRow>
              ))}
            </CTableBody>
          </CTable>
        </div>
      )}
    </div>
  )
}

export default HeatingPlanScene
