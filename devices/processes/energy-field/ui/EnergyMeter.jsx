import React from 'react'
import SeriesChart from 'src/components/charts/SeriesChart'
import KeyValue from 'src/components/KeyValue'
import ModelLink from 'src/components/nodeInfo/ModelLink'
import { useProcessLiveState } from 'src/api/useLiveProcess'
import { fmt } from './useFieldData'

// One electricity meter of the site (Dashboard component
// `energyField.meter`, its card's `params.nodeId` - a sub-meter of the
// consumption; iot AGENTS_TO_DO.md 2026-10-21, C6 - a room shows its own
// electricity): the meter's display (kW now), today's kWh and EUR (at the
// slots' purchase prices), today's chart.

const MeterPicture = ({ kw }) => (
  <svg
    width="150"
    height="180"
    viewBox="0 0 150 180"
    role="img"
    aria-label={`Meter: ${fmt(kw, 1)} kW`}
  >
    <rect
      x="10"
      y="6"
      width="130"
      height="168"
      rx="10"
      fill="#e9ecef"
      stroke="#6b7178"
      strokeWidth="2"
    />
    <rect x="22" y="22" width="106" height="44" rx="4" fill="#1d2b22" />
    <text x="120" y="54" textAnchor="end" fontFamily="monospace" fontSize="24" fill="#5cf08a">
      {fmt(kw, 1)}
    </text>
    <text x="30" y="36" fontFamily="monospace" fontSize="10" fill="#5cf08a">
      kW
    </text>
    {[0, 1, 2].map((i) => (
      <circle key={i} cx={46 + i * 29} cy="92" r="7" fill="#c7ccd1" stroke="#6b7178" />
    ))}
    <circle cx="120" cy="92" r="4" fill={kw > 0.05 ? '#e5534b' : '#a3adb8'}>
      {kw > 0.05 && (
        <animate attributeName="opacity" values="1;0.2;1" dur="1.2s" repeatCount="indefinite" />
      )}
    </circle>
    <path
      d="M30 130 H120 M30 145 H120 M30 160 H90"
      stroke="#a3adb8"
      strokeWidth="3"
      strokeLinecap="round"
    />
  </svg>
)

const EnergyMeter = ({ process, params = {} }) => {
  const live = useProcessLiveState(process.id)
  const m = live.metrics ?? process.metrics ?? {}
  const meter = (m.subMeters ?? []).find((x) => x.nodeId === params.nodeId)
  if (!meter)
    return (
      <div className="text-body-secondary small p-3">
        {params.nodeId ? 'This meter has no state yet.' : 'No meter chosen for this card.'}
      </div>
    )
  return (
    <div className="p-2 d-flex flex-column gap-2">
      <div className="d-flex align-items-baseline justify-content-between flex-wrap gap-2">
        <b className="fs-5">{meter.name}</b>
        <span className="small">
          <ModelLink nodeId={meter.nodeId} />
        </span>
      </div>
      <div className="d-flex gap-4 flex-wrap align-items-center">
        <div title="The meter now">
          <MeterPicture kw={meter.kw} />
        </div>
        <div className="d-flex flex-column gap-2">
          <div title="The power the room takes now">
            <div className="small text-body-secondary">Now</div>
            <div className="fs-3">
              <KeyValue value={fmt(meter.kw, 1)} unit="kW" />
            </div>
          </div>
          <div title="Today's consumption">
            <div className="small text-body-secondary">Today</div>
            <div className="fs-5">
              <KeyValue value={fmt(meter.todayKwh, 1)} unit="kWh" />
            </div>
          </div>
          <div title="Today's consumption at each slot's purchase price">
            <div className="small text-body-secondary">Cost today</div>
            <div className="fs-5">
              <KeyValue value={fmt(meter.todayEur, 2)} unit="€" />
            </div>
          </div>
        </div>
      </div>
      <div className="small text-body-secondary">Today, kW</div>
      <SeriesChart keys={[`process:${process.id}:field.meter.${meter.nodeId}.kw`]} />
    </div>
  )
}

export default EnergyMeter
