import React, { useState } from 'react'
import { CButton } from '@coreui/react'
import { api } from 'src/api/client'
import { useCan } from 'src/access'
import KeyValue from 'src/components/KeyValue'
import ModelLink from 'src/components/nodeInfo/ModelLink'
import { FAN_COIL_SWITCH, FAN_COIL_VIEW, FanCoilIcon } from './heatIcons'
import { fmt, useHeatingData } from './useHeatingData'

// One room of the heating (Dashboard component `heatingControl.room`, its
// card's `params.nodeId` - the room's fan coil; iot AGENTS_TO_DO.md
// 2026-10-21, C6 - a building's room shows its own climate): the fan coil
// with its valve switch, the room's temperature, humidity and setpoint
// (+ / -), what the fan coil gives now, the heating's mode and signal.

const SETPOINT_STEP = 0.5
const WIDTH = 420
const SCALE = WIDTH / FAN_COIL_VIEW.w

const HeatingRoom = ({ process, params = {} }) => {
  const can = useCan()
  const { m } = useHeatingData(process)
  const control = can('processes.control', { process: process.id })
  const [error, setError] = useState(null)
  const send = (action, p) => {
    setError(null)
    api.sendProcessCommand(process.id, action, p).catch((err) => setError(err.message))
  }
  const coil = (m.consumers ?? []).find((c) => c.nodeId === params.nodeId)
  if (!coil)
    return (
      <div className="text-body-secondary small p-3">
        {params.nodeId ? "This room's fan coil has no state yet." : 'No room chosen for this card.'}
      </div>
    )
  const mode = m.mode
  const cooling = mode === 'cooling'
  const off = m.control === 'off'
  return (
    <div className="p-2 d-flex flex-column gap-2" style={{ maxWidth: WIDTH + 40 }}>
      <div className="d-flex align-items-baseline justify-content-between flex-wrap gap-2">
        <b className="fs-5">{coil.name}</b>
        <span className="small">
          <ModelLink nodeId={coil.nodeId} fallback={coil.model} />
        </span>
      </div>
      <div style={{ position: 'relative', width: WIDTH, maxWidth: '100%' }}>
        <FanCoilIcon coil={coil} mode={mode} width={WIDTH} />
        <button
          type="button"
          className="border-0 p-0 bg-transparent"
          style={{
            position: 'absolute',
            left: FAN_COIL_SWITCH.x * SCALE,
            top: FAN_COIL_SWITCH.y * SCALE,
            width: FAN_COIL_SWITCH.w * SCALE,
            height: FAN_COIL_SWITCH.h * SCALE,
            cursor: control && !off ? 'pointer' : 'default',
          }}
          disabled={!control || off}
          aria-pressed={coil.on}
          aria-label={`${coil.name}: the valve ${coil.on ? 'open - close it' : 'closed - open it'}`}
          title={
            !control
              ? `The valve is ${coil.on ? 'open' : 'closed'} - you may only watch`
              : off
                ? 'The heating is off'
                : coil.on
                  ? 'Close the valve - switch this room off'
                  : 'Open the valve - switch this room on'
          }
          onClick={() => send('setEnabled', { nodeId: coil.nodeId, enabled: !coil.on })}
        />
      </div>
      <div className="d-flex align-items-center gap-3 flex-wrap">
        <div title={`The room's target temperature (${cooling ? 'cooling' : 'heating'})`}>
          <div className="small text-body-secondary">Setpoint</div>
          <div className="d-flex align-items-center gap-2">
            <CButton
              size="sm"
              color="secondary"
              variant="outline"
              disabled={!control || !mode || coil.setpointC == null}
              aria-label="Lower the setpoint"
              title={`Lower the room's setpoint by ${SETPOINT_STEP} °C`}
              onClick={() =>
                send('setSetpoint', {
                  mode,
                  c: coil.setpointC - SETPOINT_STEP,
                  nodeId: coil.nodeId,
                })
              }
            >
              −
            </CButton>
            <span className="fs-4 fw-semibold">{fmt(coil.setpointC)} °C</span>
            <CButton
              size="sm"
              color="secondary"
              variant="outline"
              disabled={!control || !mode || coil.setpointC == null}
              aria-label="Raise the setpoint"
              title={`Raise the room's setpoint by ${SETPOINT_STEP} °C`}
              onClick={() =>
                send('setSetpoint', {
                  mode,
                  c: coil.setpointC + SETPOINT_STEP,
                  nodeId: coil.nodeId,
                })
              }
            >
              +
            </CButton>
          </div>
        </div>
        <div
          title={`The fan coil now: ${coil.working ? `${cooling ? 'cooling' : 'heating'} - its fan turns` : 'idle - the room is at its setpoint'}`}
        >
          <div className="small text-body-secondary">{coil.working ? 'Working' : 'Idle'}</div>
          <KeyValue value={fmt(Math.abs(coil.heatKw))} unit="kW" className="fs-5" />
        </div>
        <div
          title={`The room's heat meter - the ${cooling ? 'cold' : 'heat'} its fan coil gave today`}
        >
          <div className="small text-body-secondary">Heat meter today</div>
          <KeyValue value={fmt(coil.todayKwh, 1)} unit="kWh" className="fs-5" />
        </div>
        <div title="The heating's mode and the Energy Ledger's signal">
          <div className="small text-body-secondary">Mode</div>
          <div className="fw-semibold">
            {off
              ? 'off'
              : `${cooling ? 'cooling' : 'heating'} · ${m.control === 'auto' ? 'auto' : 'by hand'}`}
            {m.signal === 3 ? ' · storing heat' : m.signal === 1 ? ' · holding off' : ''}
          </div>
        </div>
      </div>
      {error && <div className="text-danger small">{error}</div>}
    </div>
  )
}

export default HeatingRoom
