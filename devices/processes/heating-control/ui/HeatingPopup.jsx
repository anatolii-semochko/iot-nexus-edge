import React, { useState } from 'react'
import { CButton, CFormCheck, CFormInput } from '@coreui/react'
import SeriesChart from 'src/components/charts/SeriesChart'
import KeyValue from 'src/components/KeyValue'
import StatTile from 'src/components/StatTile'
import UnitPopup from 'src/components/nodeInfo/UnitPopup'
import { FanCoilIcon, HeatPumpIcon, TankIcon } from './heatIcons'
import { fmt } from './useHeatingData'
import { packageT } from 'src/i18n'
// the package's words (its own locales/, then the core's)
const t = packageT('heating-control')

// A heating unit's popup (AGENTS_TO_DO.md 2026-10-20 X2, 2026-10-22 C): the
// shared UnitPopup - Status (the big live picture, the readings, today's
// charts one under another), Model, Map; a heat pump / a fan coil switched
// on / off, a room's setpoint - the process's commands.

const Stat = StatTile
// a tank's two curves (both ways the same in heating and cooling): in - amber, out - teal
export const TANK_FLOW_COLORS = ['#f08c00', '#0ca678']
// the heating's electricity beside a heat curve (the heat pumps -> tanks line, a heat pump's own chart)
export const ELECTRIC_COLOR = '#b8329e'

const HeatingPopup = ({ popup, process, m, control, send, onClose }) => {
  const { kind, nodeId } = popup
  const list = kind === 'pump' ? m.pumps : kind === 'tank' ? m.tanks : m.consumers
  const x = (list ?? []).find((u) => u.nodeId === nodeId)
  const [setpoint, setSetpoint] = useState(x?.setpointC != null ? String(x.setpointC) : '')
  if (!x) return null
  const cooling = m.mode === 'cooling'
  const unitKey = (k) => `process:${process.id}:heat.${kind}.${nodeId}.${k}`
  const picture =
    kind === 'pump' ? (
      <HeatPumpIcon pump={x} mode={m.mode} height={200} />
    ) : kind === 'tank' ? (
      <TankIcon tank={x} height={300} />
    ) : (
      <FanCoilIcon coil={x} mode={m.mode} width={420} />
    )
  const footer = kind !== 'tank' && (
    <div className="d-flex justify-content-between align-items-center border-top pt-2 mt-2 flex-wrap gap-3">
      <CFormCheck
        id={`ht-on-${nodeId}`}
        label={kind === 'coil' ? t('Valve open (the fan coil on)') : t('In operation')}
        checked={!!x.on}
        disabled={!control || m.control === 'off'}
        title={!control ? t('You may only watch') : undefined}
        onChange={(e) => send('setEnabled', { nodeId, enabled: e.target.checked })}
      />
      {kind === 'coil' && m.mode && (
        <div className="d-flex align-items-center gap-2">
          <label htmlFor={`ht-sp-${nodeId}`} className="small text-body-secondary">
            {t('Setpoint ({{mode}})', { mode: m.mode })}
          </label>
          <CFormInput
            id={`ht-sp-${nodeId}`}
            size="sm"
            type="number"
            step="0.5"
            min="5"
            max="35"
            style={{ width: 90 }}
            value={setpoint}
            disabled={!control}
            title={t("The room's own target temperature, °C (5-35)")}
            onChange={(e) => setSetpoint(e.target.value)}
          />
          <CButton
            size="sm"
            color="primary"
            disabled={!control || setpoint === '' || Number(setpoint) === x.setpointC}
            title={t("Set this room's target temperature")}
            onClick={() => send('setSetpoint', { mode: m.mode, c: Number(setpoint), nodeId })}
          >
            {t('Set')}
          </CButton>
        </div>
      )}
      <span className="small text-body-secondary">
        {t("Parameters - in the process's configuration")}
      </span>
    </div>
  )
  return (
    <UnitPopup
      // the unit's own today (2026-10-29 - not all of the block's)
      charts={
        <SeriesChart
          absolute={[unitKey('kw'), unitKey('inKw'), unitKey('outKw')]}
          keys={
            kind === 'pump'
              ? [[unitKey('kw'), unitKey('electricKw')], unitKey('cop')]
              : kind === 'tank'
                ? [[unitKey('inKw'), unitKey('outKw')], unitKey('pct')]
                : [unitKey('kw'), unitKey('roomC')]
          }
          labels={
            kind === 'pump'
              ? [
                  t('{{what}} and electricity, kW', { what: cooling ? t('Cold') : t('Heat') }),
                  cooling ? 'EER' : 'COP',
                ]
              : kind === 'tank'
                ? [
                    t('{{v0}} in and out, kW', {
                      v0: cooling ? 'Cold' : 'Heat',
                    }),
                    t('Stored heat, %'),
                  ]
                : [
                    t('{{v0}} to the room, kW', {
                      v0: cooling ? 'Cold' : 'Heat',
                    }),
                    t('The room, °C'),
                  ]
          }
          legends={
            kind === 'tank'
              ? [[t('in - from the heat pumps'), t('out - to the fan coils')]]
              : kind === 'pump'
                ? [[(cooling ? t('Cold') : t('Heat')).toLowerCase(), t('electricity')]]
                : []
          }
          colors={
            kind === 'tank'
              ? [TANK_FLOW_COLORS]
              : kind === 'pump'
                ? [[TANK_FLOW_COLORS[0], ELECTRIC_COLOR]]
                : []
          }
          limits={
            kind === 'coil' && x.setpointC != null
              ? {
                  [unitKey('roomC')]: [{ value: x.setpointC, level: 'warning', label: 'setpoint' }],
                }
              : {}
          }
        />
      }
      title={x.name}
      nodeId={nodeId}
      processId={process.id}
      picture={picture}
      footer={footer}
      onClose={onClose}
    >
      <div
        className="d-grid mb-3"
        style={{
          gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
          gap: 12,
        }}
      >
        {kind === 'pump' && (
          <>
            <Stat
              label={t('State')}
              hint={t('Off - switched off; standby - the tanks need nothing now')}
            >
              {!x.on
                ? t('off')
                : x.running
                  ? t('running {{fmt}} %', { fmt: fmt(x.modulation * 100, 0) })
                  : t('standby')}
            </Stat>
            <Stat
              label={cooling ? t('Cold') : t('Heat')}
              hint={t('The heat it gives (or the cold it makes) now')}
            >
              <KeyValue value={fmt(Math.abs(x.heatKw))} unit="kW" />
            </Stat>
            <Stat label={t('Electricity')} hint={t('The electric power it takes now')}>
              <KeyValue value={fmt(x.electricKw)} unit="kW" />
            </Stat>
            <Stat label={cooling ? 'EER' : 'COP'} hint={t('The heat per unit of electricity')}>
              <KeyValue value={fmt(x.cop)} />
            </Stat>
            <Stat label={t('Flow / return')} hint={t('The water to the tanks / back from them')}>
              {fmt(x.flowC)} / {fmt(x.returnC)} °C
            </Stat>
            <Stat label={t('Water flow')} hint={t('Through the heat pump')}>
              <KeyValue value={fmt(x.flowLpm)} unit="l/min" />
            </Stat>
            <Stat label={t('Fan')} hint={t("The outdoor fan's speed")}>
              <KeyValue value={fmt(x.fanRpm, 0)} unit="rpm" />
            </Stat>
            <Stat label={t('Rated')} hint={t('The heat output at A7/W35')}>
              <KeyValue value={fmt(x.ratedHeatKw, 0)} unit="kW" />
            </Stat>
          </>
        )}
        {kind === 'tank' && (
          <>
            <Stat label={t('Stored')} hint={t('The heat above the lowest useful temperature')}>
              {fmt(x.storedKwh)} {t('of')} {fmt(x.fullKwh)} kWh
            </Stat>
            <Stat label={t('Charge')}>{fmt(x.pct, 0)} %</Stat>
            <Stat label={t('In')} hint={t('From the heat pumps now')}>
              <KeyValue value={fmt(x.inKw)} unit="kW" color={TANK_FLOW_COLORS[0]} />
            </Stat>
            <Stat label={t('Out')} hint={t('To the fan coils now')}>
              <KeyValue value={fmt(x.outKw)} unit="kW" color={TANK_FLOW_COLORS[1]} />
            </Stat>
            <Stat label={t('Average')} hint={t('The middle sensor')}>
              <KeyValue value={fmt(x.avgC)} unit="°C" />
            </Stat>
            <Stat label={t('Top / bottom')} hint={t('The stratification - hot on top, cold below')}>
              {fmt(x.topC)} / {fmt(x.bottomC)} °C
            </Stat>
            <Stat label={t('Volume')}>{x.volumeL} l</Stat>
            <Stat label={t('Useful range')} hint={t('0 % at the lower, 100 % at the upper')}>
              {x.tMinC}–{x.tMaxC} °C
            </Stat>
          </>
        )}
        {kind === 'coil' && (
          <>
            <Stat label={t('Room')}>{fmt(x.roomC)} °C</Stat>
            <Stat label={t('Humidity')}>{fmt(x.humidityPct, 0)} %</Stat>
            <Stat label={t('Setpoint')} hint={t("The room's target temperature in this mode")}>
              <KeyValue value={fmt(x.setpointC)} unit="°C" />
            </Stat>
            <Stat
              label={cooling ? t('Cold') : t('Heat')}
              hint={t('What the fan coil gives the room now')}
            >
              <KeyValue value={fmt(Math.abs(x.heatKw))} unit="kW" />
            </Stat>
            <Stat label={t('Fan')} hint={t("The fan's share and its electric power")}>
              {fmt(x.fan * 100, 0)} % · {fmt(x.fanW, 0)} W
            </Stat>
          </>
        )}
      </div>
    </UnitPopup>
  )
}

/**
 * A water line's popup (the user, 2026-10-29): the power it carries between two blocks - the heat
 * pumps to the tanks (with their electricity), the tanks to the rooms (with the outdoor temperature) -
 * today, big; its temperatures now.
 */
export const FlowPopup = ({ flow, process, m, onClose }) => {
  const cooling = m.mode === 'cooling'
  const what = cooling ? t('Cold') : t('Heat')
  const key = (k) => `process:${process.id}:heat.${k}`
  const pumps = flow === 'pumpsTanks'
  const line = m.lines?.[flow]
  return (
    <UnitPopup
      charts={
        <SeriesChart
          absolute={[key('tanksInKw'), key('tanksOutKw')]}
          keys={
            pumps ? [[key('tanksInKw'), key('electricKw')]] : [key('tanksOutKw'), key('outdoorC')]
          }
          labels={
            pumps
              ? [
                  t("{{what}} to the tanks and the heating's electricity, kW", {
                    what,
                  }),
                ]
              : [t('{{what}} to the rooms, kW', { what }), t('Outdoor, °C')]
          }
          legends={
            pumps
              ? [
                  [
                    t('{{toLowerCase}} to the tanks', {
                      toLowerCase: what.toLowerCase(),
                    }),
                    t('electricity'),
                  ],
                ]
              : []
          }
          colors={pumps ? [[TANK_FLOW_COLORS[0], ELECTRIC_COLOR]] : [TANK_FLOW_COLORS[1]]}
        />
      }
      title={pumps ? t('From the heat pumps to the tanks') : t('From the tanks to the rooms')}
      processId={process.id}
      onClose={onClose}
    >
      <div
        className="d-grid mb-3"
        style={{
          gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
          gap: 12,
        }}
      >
        <Stat label={what} hint={t('The power the water carries now')}>
          <KeyValue value={fmt(Math.abs(line?.kw ?? 0))} unit="kW" />
        </Stat>
        <Stat label={t('Warm')} hint={t("The warm pipe's water")}>
          <KeyValue value={fmt(line?.warmC)} unit="°C" />
        </Stat>
        <Stat label={t('Cold')} hint={t("The cold pipe's water")}>
          <KeyValue value={fmt(line?.coldC)} unit="°C" />
        </Stat>
        <Stat
          label={t('Difference')}
          hint={t('Warm less cold - the more, the more heat per litre')}
        >
          <KeyValue value={line ? fmt(line.warmC - line.coldC) : null} unit="K" />
        </Stat>
      </div>
    </UnitPopup>
  )
}

export default HeatingPopup
