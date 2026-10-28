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

const HeatingPopup = ({ popup, process, m, control, send, onClose }) => {
  const { kind, nodeId } = popup
  const list = kind === 'pump' ? m.pumps : kind === 'tank' ? m.tanks : m.consumers
  const x = (list ?? []).find((u) => u.nodeId === nodeId)
  const [setpoint, setSetpoint] = useState(x?.setpointC != null ? String(x.setpointC) : '')
  if (!x) return null
  const cooling = m.mode === 'cooling'
  const key = (k) => `process:${process.id}:heat.${k}`
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
      <SeriesChart
        signed={[key('tanksKw')]}
        // the heat pumps' and the rooms' power one way - the heat or the cold, up from zero; the tanks' both
        absolute={[key('heatKw'), key('consumersKw')]}
        keys={
          kind === 'pump'
            ? [key('heatKw'), key('cop')]
            : kind === 'tank'
              ? [key('tankPct'), key('tanksKw')]
              : [key('consumersKw'), key('outdoorC')]
        }
        labels={
          kind === 'pump'
            ? ['All heat pumps - heat, kW (+ heat / - cold)', cooling ? 'EER' : 'COP']
            : kind === 'tank'
              ? ['The tanks - stored heat, %', 'The tanks - kW (+ storing / - giving back)']
              : ['All consumers - heat, kW (+ heat / - cold)', 'Outdoor, °C']
        }
      />
    </UnitPopup>
  )
}

export default HeatingPopup
