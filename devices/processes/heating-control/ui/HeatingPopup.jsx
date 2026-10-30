import React, { useState } from 'react'
import { CButton, CFormCheck, CFormInput } from '@coreui/react'
import SeriesChart from 'src/components/charts/SeriesChart'
import KeyValue from 'src/components/KeyValue'
import StatTile from 'src/components/StatTile'
import UnitPopup from 'src/components/nodeInfo/UnitPopup'
import { FanCoilIcon, HeatPumpIcon, TankIcon } from './heatIcons'
import { fmt } from './useHeatingData'

// A heating unit's popup (AGENTS_TO_DO.md 2026-10-20 X2, 2026-10-22 C): the
// shared UnitPopup - Status (the big live picture, the readings, today's
// charts one under another), Model, Map; a heat pump / a fan coil switched
// on / off, a room's setpoint - the process's commands.

const Stat = StatTile
// a tank's two curves (both ways the same in heating and cooling): in - amber, out - teal
export const TANK_FLOW_COLORS = ['#f08c00', '#0ca678']

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
        label={kind === 'coil' ? 'Valve open (the fan coil on)' : 'In operation'}
        checked={!!x.on}
        disabled={!control || m.control === 'off'}
        title={!control ? 'You may only watch' : undefined}
        onChange={(e) => send('setEnabled', { nodeId, enabled: e.target.checked })}
      />
      {kind === 'coil' && m.mode && (
        <div className="d-flex align-items-center gap-2">
          <label htmlFor={`ht-sp-${nodeId}`} className="small text-body-secondary">
            {`Setpoint (${m.mode})`}
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
            title="The room's own target temperature, °C (5-35)"
            onChange={(e) => setSetpoint(e.target.value)}
          />
          <CButton
            size="sm"
            color="primary"
            disabled={!control || setpoint === '' || Number(setpoint) === x.setpointC}
            title="Set this room's target temperature"
            onClick={() => send('setSetpoint', { mode: m.mode, c: Number(setpoint), nodeId })}
          >
            Set
          </CButton>
        </div>
      )}
      <span className="small text-body-secondary">Parameters - in the process's configuration</span>
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
              ? [unitKey('kw'), unitKey('cop')]
              : kind === 'tank'
                ? [[unitKey('inKw'), unitKey('outKw')], unitKey('pct')]
                : [unitKey('kw'), unitKey('roomC')]
          }
          labels={
            kind === 'pump'
              ? [`${cooling ? 'Cold' : 'Heat'}, kW`, cooling ? 'EER' : 'COP']
              : kind === 'tank'
                ? [`${cooling ? 'Cold' : 'Heat'} in and out, kW`, 'Stored heat, %']
                : [`${cooling ? 'Cold' : 'Heat'} to the room, kW`, 'The room, °C']
          }
          legends={kind === 'tank' ? [['in - from the heat pumps', 'out - to the fan coils']] : []}
          colors={kind === 'tank' ? [TANK_FLOW_COLORS] : []}
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
        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 12 }}
      >
        {kind === 'pump' && (
          <>
            <Stat label="State" hint="Off - switched off; standby - the tanks need nothing now">
              {!x.on ? 'off' : x.running ? `running ${fmt(x.modulation * 100, 0)} %` : 'standby'}
            </Stat>
            <Stat
              label={cooling ? 'Cold' : 'Heat'}
              hint="The heat it gives (or the cold it makes) now"
            >
              <KeyValue value={fmt(Math.abs(x.heatKw))} unit="kW" />
            </Stat>
            <Stat label="Electricity" hint="The electric power it takes now">
              <KeyValue value={fmt(x.electricKw)} unit="kW" />
            </Stat>
            <Stat label={cooling ? 'EER' : 'COP'} hint="The heat per unit of electricity">
              <KeyValue value={fmt(x.cop)} />
            </Stat>
            <Stat label="Flow / return" hint="The water to the tanks / back from them">
              {fmt(x.flowC)} / {fmt(x.returnC)} °C
            </Stat>
            <Stat label="Water flow" hint="Through the heat pump">
              <KeyValue value={fmt(x.flowLpm)} unit="l/min" />
            </Stat>
            <Stat label="Fan" hint="The outdoor fan's speed">
              <KeyValue value={fmt(x.fanRpm, 0)} unit="rpm" />
            </Stat>
            <Stat label="Rated" hint="The heat output at A7/W35">
              <KeyValue value={fmt(x.ratedHeatKw, 0)} unit="kW" />
            </Stat>
          </>
        )}
        {kind === 'tank' && (
          <>
            <Stat label="Stored" hint="The heat above the lowest useful temperature">
              {fmt(x.storedKwh)} of {fmt(x.fullKwh)} kWh
            </Stat>
            <Stat label="Charge">{fmt(x.pct, 0)} %</Stat>
            <Stat label="In" hint="From the heat pumps now">
              <KeyValue value={fmt(x.inKw)} unit="kW" color={TANK_FLOW_COLORS[0]} />
            </Stat>
            <Stat label="Out" hint="To the fan coils now">
              <KeyValue value={fmt(x.outKw)} unit="kW" color={TANK_FLOW_COLORS[1]} />
            </Stat>
            <Stat label="Average" hint="The middle sensor">
              <KeyValue value={fmt(x.avgC)} unit="°C" />
            </Stat>
            <Stat label="Top / bottom" hint="The stratification - hot on top, cold below">
              {fmt(x.topC)} / {fmt(x.bottomC)} °C
            </Stat>
            <Stat label="Volume">{x.volumeL} l</Stat>
            <Stat label="Useful range" hint="0 % at the lower, 100 % at the upper">
              {x.tMinC}–{x.tMaxC} °C
            </Stat>
          </>
        )}
        {kind === 'coil' && (
          <>
            <Stat label="Room">{fmt(x.roomC)} °C</Stat>
            <Stat label="Humidity">{fmt(x.humidityPct, 0)} %</Stat>
            <Stat label="Setpoint" hint="The room's target temperature in this mode">
              <KeyValue value={fmt(x.setpointC)} unit="°C" />
            </Stat>
            <Stat label={cooling ? 'Cold' : 'Heat'} hint="What the fan coil gives the room now">
              <KeyValue value={fmt(Math.abs(x.heatKw))} unit="kW" />
            </Stat>
            <Stat label="Fan" hint="The fan's share and its electric power">
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
  const what = cooling ? 'Cold' : 'Heat'
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
              ? [`${what} to the tanks and the heating's electricity, kW`]
              : [`${what} to the rooms, kW`, 'Outdoor, °C']
          }
          legends={pumps ? [[`${what.toLowerCase()} to the tanks`, 'electricity']] : []}
          colors={pumps ? [[TANK_FLOW_COLORS[0], '#b8329e']] : [TANK_FLOW_COLORS[1]]}
        />
      }
      title={pumps ? 'From the heat pumps to the tanks' : 'From the tanks to the rooms'}
      processId={process.id}
      onClose={onClose}
    >
      <div
        className="d-grid mb-3"
        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 12 }}
      >
        <Stat label={what} hint="The power the water carries now">
          <KeyValue value={fmt(Math.abs(line?.kw ?? 0))} unit="kW" />
        </Stat>
        <Stat label="Warm" hint="The warm pipe's water">
          <KeyValue value={fmt(line?.warmC)} unit="°C" />
        </Stat>
        <Stat label="Cold" hint="The cold pipe's water">
          <KeyValue value={fmt(line?.coldC)} unit="°C" />
        </Stat>
        <Stat label="Difference" hint="Warm less cold - the more, the more heat per litre">
          <KeyValue value={line ? fmt(line.warmC - line.coldC) : null} unit="K" />
        </Stat>
      </div>
    </UnitPopup>
  )
}

export default HeatingPopup
