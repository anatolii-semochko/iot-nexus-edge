import React from 'react'
import SeriesChart from 'src/components/charts/SeriesChart'
import KeyValue from 'src/components/KeyValue'
import ModelLink from 'src/components/nodeInfo/ModelLink'
import { useProcessLiveState } from 'src/api/useLiveProcess'
import { fmt } from './useFieldData'
import { packageT } from 'src/i18n'
// the package's words (its own locales/, then the core's)
const t = packageT('energy-field')

// One electricity meter of the site (Dashboard component
// `energyField.meter`, its card's `params.nodeId` - a sub-meter of the
// consumption; iot AGENTS_TO_DO.md 2026-10-21, C6 - a room shows its own
// electricity): the meter's display (kW now), today's kWh and EUR (at the
// slots' purchase prices), today's chart.

// the meter's picture - also the card's (EnergyMeterAvatar), `height` scales it
export const MeterPicture = ({ kw, height = 180 }) => (
  <svg
    width={(height * 150) / 180}
    height={height}
    viewBox="0 0 150 180"
    role="img"
    aria-label={t('Meter: {{fmt}} kW', { fmt: fmt(kw, 1) })}
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
    {/* the LED's blink - a CSS opacity animation (an SVG <animate> re-laid the page out every frame) */}
    <style>{'@keyframes em-led { 0%, 100% { opacity: 1 } 50% { opacity: 0.2 } }'}</style>
    <circle
      cx="120"
      cy="92"
      r="4"
      fill={kw > 0.05 ? '#e5534b' : '#a3adb8'}
      style={kw > 0.05 ? { animation: 'em-led 1.2s ease-in-out infinite' } : undefined}
    />
    <path
      d="M30 130 H120 M30 145 H120 M30 160 H90"
      stroke="#a3adb8"
      strokeWidth="3"
      strokeLinecap="round"
    />
  </svg>
)

/** The card's meter (`params.nodeId`) from the process's live state - null while it has none. */
export const useMeter = (process, nodeId) => {
  const live = useProcessLiveState(process.id)
  const m = live.metrics ?? process.metrics ?? {}
  return (m.subMeters ?? []).find((x) => x.nodeId === nodeId) ?? null
}

const EnergyMeter = ({ process, params = {} }) => {
  const meter = useMeter(process, params.nodeId)
  if (!meter)
    return (
      <div className="text-body-secondary small p-3">
        {params.nodeId ? t('This meter has no state yet.') : t('No meter chosen for this card.')}
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
        <div title={t('The meter now')}>
          <MeterPicture kw={meter.kw} />
        </div>
        <div className="d-flex flex-column gap-2">
          <div title={t('The power the room takes now')}>
            <div className="small text-body-secondary">{t('Now')}</div>
            <div className="fs-3">
              <KeyValue value={fmt(meter.kw, 1)} unit="kW" />
            </div>
          </div>
          <div title={t("Today's consumption")}>
            <div className="small text-body-secondary">{t('Today')}</div>
            <div className="fs-5">
              <KeyValue value={fmt(meter.todayKwh, 1)} unit="kWh" />
            </div>
          </div>
          <div title={t("Today's consumption at each slot's purchase price")}>
            <div className="small text-body-secondary">{t('Cost today')}</div>
            <div className="fs-5">
              <KeyValue value={fmt(meter.todayEur, 2)} unit="€" />
            </div>
          </div>
        </div>
      </div>
      <div className="small text-body-secondary">{t('Today, kW')}</div>
      <SeriesChart keys={[`process:${process.id}:field.meter.${meter.nodeId}.kw`]} />
    </div>
  )
}

export default EnergyMeter
