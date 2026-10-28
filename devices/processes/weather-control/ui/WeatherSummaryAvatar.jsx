import React, { useEffect, useState } from 'react'
import { request } from 'src/api/client'
import { useNow } from 'src/hooks/useNow'
import AnemometerIcon from './anemometer/AnemometerIcon'
import SkyIcon from './SkyIcon'
import { currentHour, fmt } from './WeatherWidgets'

// The Weather's Dashboard card picture with its figures (the user, 2026-10-25 - in the energy,
// heating and ledger avatars' style): the sky and the temperature (the one in 3 hours under it), the
// wind and its gusts, the sun's radiation and the clouds, the humidity, the rain this hour, today's low /
// high - the forecast's hour now. Transparent.

const RELOAD_MS = 15 * 60_000
const ICON = 34

const DropIcon = ({ size = ICON }) => (
  <svg width={size} height={size} viewBox="0 0 34 34" aria-hidden="true">
    <path d="M17 4 C12 12 8 17 8 22 a9 9 0 0 0 18 0 C26 17 22 12 17 4 Z" fill="#4dabf7" />
    <path
      d="M13 22 a4 4 0 0 0 4 4"
      fill="none"
      stroke="#fff"
      strokeWidth="2"
      strokeLinecap="round"
    />
  </svg>
)

const RainIcon = ({ size = ICON, wet = false }) => (
  <svg width={size} height={size} viewBox="0 0 34 34" aria-hidden="true">
    <path
      d="M9 18 a6 6 0 0 1 2-11.6 a8 8 0 0 1 15 2.6 a5 5 0 0 1 0 9 Z"
      fill="var(--wx-cloud, #e9eef3)"
      stroke="var(--wx-cloud-edge, #9aa8b6)"
      strokeWidth="1.5"
    />
    {[11, 17, 23].map((x) => (
      <line
        key={x}
        x1={x}
        y1="22"
        x2={x - 2}
        y2="29"
        stroke={wet ? '#339af0' : '#a3adb8'}
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    ))}
  </svg>
)

const ThermoIcon = ({ size = ICON }) => (
  <svg width={size} height={size} viewBox="0 0 34 34" aria-hidden="true">
    <rect
      x="13.5"
      y="4"
      width="7"
      height="19"
      rx="3.5"
      fill="none"
      stroke="#868e96"
      strokeWidth="2"
    />
    <circle cx="17" cy="25" r="5.5" fill="#e8590c" />
    <rect x="15.5" y="11" width="3" height="13" fill="#e8590c" />
  </svg>
)

const Row = ({ icon, value, sub }) => (
  <div className="d-flex align-items-center" style={{ gap: 6 }}>
    <div style={{ width: 36, display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
      {icon}
    </div>
    <div style={{ lineHeight: 1.2, whiteSpace: 'nowrap' }}>
      <div className="kv" style={{ fontSize: '1rem' }}>
        {value}
      </div>
      <div className="text-body-secondary" style={{ fontSize: '0.75rem' }}>
        {sub}
      </div>
    </div>
  </div>
)

const WeatherSummaryAvatar = ({ process }) => {
  const [forecast, setForecast] = useState(null)
  const now = useNow(60_000)
  useEffect(() => {
    let cancelled = false
    const load = () =>
      request(`/weather-control/${process.id}/forecast`)
        .then((d) => !cancelled && setForecast(d))
        .catch(() => {})
    load()
    const t = setInterval(load, RELOAD_MS)
    return () => {
      cancelled = true
      clearInterval(t)
    }
  }, [process.id])
  const h = currentHour(forecast, now)
  if (!h) return null
  const in3h = (forecast?.hourly ?? []).find((x) => x.t > now + 2.5 * 3_600_000)
  const sky = {
    radiation: h.radiationWm2 ?? 0,
    cloudPct: h.cloudCoverPct ?? 0,
    isDay: h.isDay !== 0,
  }
  const rain = h.precipitationMm ?? 0
  // today's lowest and highest (the forecast's hours of today)
  const day = new Date(now).toDateString()
  const temps = (forecast?.hourly ?? [])
    .filter((x) => new Date(x.t).toDateString() === day && x.temperatureC != null)
    .map((x) => x.temperatureC)
  return (
    <div
      style={{
        height: '100%',
        display: 'grid',
        gridTemplateColumns: 'repeat(2, max-content)',
        alignContent: 'center',
        justifyContent: 'center',
        gap: '8px 14px',
        padding: '4px 6px',
      }}
    >
      <Row
        icon={<SkyIcon {...sky} height={ICON * 0.85} />}
        value={`${fmt(h.temperatureC, 1)} °C`}
        sub={in3h ? `${fmt(in3h.temperatureC, 1)} °C in 3 h` : 'Temperature'}
      />
      <Row
        icon={<AnemometerIcon windMs={h.windSpeedMs ?? 0} size={ICON * 0.75} />}
        value={`${fmt(h.windSpeedMs, 1)} m/s`}
        sub={`gusts ${fmt(h.windGustsMs, 1)} m/s`}
      />
      <Row
        icon={
          <SkyIcon
            radiation={Math.max(41, h.radiationWm2 ?? 0)}
            cloudPct={0}
            isDay
            height={ICON * 0.85}
          />
        }
        value={`${fmt(h.radiationWm2, 0)} W/m²`}
        sub={`clouds ${fmt(h.cloudCoverPct, 0)} %`}
      />
      <Row icon={<DropIcon />} value={`${fmt(h.humidityPct, 0)} %`} sub="Humidity" />
      <Row icon={<RainIcon wet={rain > 0} />} value={`${fmt(rain, 1)} mm`} sub="Rain, this hour" />
      <Row
        icon={<ThermoIcon />}
        value={
          temps.length ? `${fmt(Math.min(...temps), 0)} / ${fmt(Math.max(...temps), 0)} °C` : '-'
        }
        sub="Today low / high"
      />
    </div>
  )
}

export default WeatherSummaryAvatar
