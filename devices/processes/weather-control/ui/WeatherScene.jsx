import React, { useCallback, useEffect, useState } from 'react'
import CIcon from '@coreui/icons-react'
import { CButton, CSpinner } from '@coreui/react'
import { request } from 'src/api/client'
import { useCan } from 'src/access'
import { useNow } from 'src/hooks/useNow'
import AiButton from 'src/components/ai/AiButton'
import KeyValue from 'src/components/KeyValue'
import { useDeviceValue } from 'src/views/processes/useDeviceValue'
import AnemometerIcon from './anemometer/AnemometerIcon'
import { LEVEL_BY_KEY } from './lightLevels'
import { SkyIcon } from './SkyIcon'
import { DropIcon, RainIcon, ThermoIcon } from './weatherIcons'
import {
  apparentC,
  beaufortOf,
  compassOf,
  dayOf,
  degreeDays,
  dewPointC,
  kwhM2,
  pressureTrend,
  weatherText,
  wetCode,
} from './weatherMath'
import { SunWidget, TemperatureWidget, WindWidget, currentHour, fmt } from './WeatherWidgets'

// The weather's scene - the user's Dashboard component `weatherControl.panel` (2026-10-30; the process
// row keeps the engineer's panel): the station's readings and the forecast at a glance, for a site that
// lives on the weather - its PV, its wind turbines, its heat pumps.
// - the warnings of the next 24 hours, when there are any (frost, a storm's gusts, heavy rain, heat -
//   the config's `scene` thresholds);
// - now: the sky, the station's temperature big, the weather in words, as it feels (the apparent
//   temperature), today's low / high, the light level; the day: the sun's arc from its rise to its set,
//   the sun now on it, the daylight, the day's sun (kWh/m2);
// - the tiles: the wind (the anemometer, Beaufort, the gusts, the compass), the humidity and the dew
//   point, the pressure and its 3 hours' tendency, the rain (the station's wetness, when it comes), the
//   clouds;
// - the widgets of the energy and the heating scenes (the curves, their detailed charts on a click);
// - the next 24 hours, hour by hour; the days - the low / high bar on the days' common range, the rain,
//   the wind, the sun for the PV (good / fair / poor) and the heating's degree-days.

// the forecast re-read this often (the API fetches it hourly)
const RELOAD_MS = 10 * 60_000
const HOURS_AHEAD = 24
// the scene's thresholds - the config's `scene` over these
const SCENE_DEFAULTS = {
  frostC: 0,
  stormGustMs: 17.2,
  heavyRainMmH: 4,
  heatC: 30,
  sunGoodKwhM2: 4,
  sunFairKwhM2: 2,
  heatingBaseC: 18,
}
// an hour's rain worth a mark, mm; the hourly bars' full height, mm
const RAIN_MIN_MM = 0.1
const RAIN_BAR_MM = 4
// the sun's arc: its drawing's width and height (px at a wide scene's card)
const ARC_W = 560
const ARC_PX = 96

const CSS = `
.ws { container-type: inline-size; display: flex; flex-direction: column; gap: 14px;
  --ws-card: var(--cui-body-bg); --ws-line: var(--cui-border-color); --ws-muted: var(--cui-secondary-color);
  --ws-tint: color-mix(in srgb, var(--cui-body-color) 3%, transparent);
  --ws-sun: #f59f00; --ws-rain: #339af0; --ws-cold: #1c7ed6; --ws-warm: #e8590c; --ws-wind: #1c7ed6;
  --wx-sun: #f6b73c; --wx-cloud: #e9eef3; --wx-cloud-edge: #9aa8b6; --wx-moon: #8fb4e0 }
[data-coreui-theme='dark'] .ws { --ws-sun: #ffc94d; --ws-rain: #74c0fc; --ws-cold: #74c0fc; --ws-warm: #ff9a3c; --ws-wind: #74c0fc;
  --wx-cloud: #c9d3de; --wx-cloud-edge: #8c99a8; --wx-moon: #7da7da }
.ws-card { border: 1px solid var(--ws-line); border-radius: 12px; background: var(--ws-card); padding: 14px 18px; min-width: 0 }
.ws-muted { color: var(--ws-muted) }
.ws-hero { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr); gap: 14px }
.ws-now { display: flex; align-items: center; gap: 22px }
.ws-temp { font-size: 3.4rem; line-height: 1 }
.ws-tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 14px }
.ws-tile { display: flex; flex-direction: column; gap: 6px }
.ws-tile-head { display: flex; align-items: center; gap: 8px; color: var(--ws-muted); font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.04em }
.ws-tile .kv.ws-main { font-size: 1.6rem }
.ws-widgets { display: grid; grid-template-columns: repeat(auto-fit, minmax(330px, 1fr)); gap: 14px }
.ws-hours { display: flex; overflow-x: auto; gap: 2px; padding-bottom: 4px }
.ws-hour { flex: 0 0 64px; display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 6px 0; border-radius: 8px }
.ws-hour.ws-nowcol { background: var(--ws-tint); outline: 1px solid var(--ws-line) }
.ws-rainbar { width: 10px; height: 28px; display: flex; align-items: flex-end; background: var(--ws-tint); border-radius: 3px }
.ws-days { display: grid; grid-template-columns: max-content max-content minmax(120px, 1fr) repeat(4, max-content); gap: 10px 18px; align-items: center }
.ws-range { position: relative; height: 8px; border-radius: 4px; background: var(--ws-tint); border: 1px solid var(--ws-line) }
.ws-range > span { position: absolute; top: -1px; bottom: -1px; border-radius: 4px; background: linear-gradient(90deg, var(--ws-cold), var(--ws-sun), var(--ws-warm)) }
.ws-alerts { display: flex; flex-wrap: wrap; gap: 8px }
.ws-alert { border-radius: 999px; padding: 4px 12px; font-size: 0.9rem; border: 1px solid }
@container (max-width: 860px) {
  .ws-hero { grid-template-columns: minmax(0, 1fr) }
  .ws-days { grid-template-columns: max-content max-content minmax(80px, 1fr) max-content }
  .ws-days .ws-wide { display: none }
}
@container (max-width: 480px) {
  .ws-now { flex-direction: column; align-items: flex-start; gap: 10px }
}
`

const hhmm = (t) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
const hourOnly = (t) => new Date(t).toLocaleTimeString([], { hour: 'numeric' })
const dayName = (t, now) =>
  dayOf(t) === dayOf(now)
    ? 'Today'
    : dayOf(t) === dayOf(now + 86_400_000)
      ? 'Tomorrow'
      : new Date(t).toLocaleDateString([], { weekday: 'long' })
const duration = (ms) =>
  `${Math.floor(ms / 3_600_000)} h ${Math.round((ms % 3_600_000) / 60_000)} min`

/** The stored forecast, re-read; `refresh()` - fetch now (processes.control). */
const useForecast = (processId) => {
  const [forecast, setForecast] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const load = useCallback(
    () =>
      request(`/weather-control/${processId}/forecast`)
        .then((f) => {
          setForecast(f)
          setError(null)
        })
        .catch((err) => setError(err.message)),
    [processId],
  )
  useEffect(() => {
    load()
    const timer = setInterval(load, RELOAD_MS)
    return () => clearInterval(timer)
  }, [load])
  const refresh = () => {
    setBusy(true)
    request(`/weather-control/${processId}/forecast/refresh`, { method: 'POST' })
      .then((f) => {
        setForecast(f)
        setError(null)
      })
      .catch((err) => setError(err.message))
      .finally(() => setBusy(false))
  }
  return { forecast, error, busy, refresh }
}

/** The hour's picture: rain falling - the cloud with rain, else the sky. */
const HourSky = ({ h, height }) =>
  (h.precipitationMm ?? 0) >= RAIN_MIN_MM || wetCode(h.weatherCode) ? (
    <RainIcon size={height} wet />
  ) : (
    <SkyIcon
      radiation={h.radiationWm2 ?? 0}
      cloudPct={h.cloudCoverPct ?? 0}
      isDay={h.isDay !== 0}
      height={height}
    />
  )

/** The wind's direction - an arrow the way it blows (from `deg`, so pointing to deg + 180). */
const WindArrow = ({ deg, size = 16, color = 'currentColor' }) =>
  deg == null ? null : (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <g transform={`rotate(${deg + 180} 8 8)`}>
        <path d="M8 1 L12 11 L8 9 L4 11 Z" fill={color} />
      </g>
    </svg>
  )

/** The compass: N / E / S / W and the wind's arrow on it. */
const Compass = ({ deg, size = 64 }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="Wind direction">
    <circle cx="32" cy="32" r="29" fill="var(--ws-tint)" stroke="var(--ws-line)" />
    {[
      ['N', 32, 12],
      ['E', 54, 35],
      ['S', 32, 58],
      ['W', 10, 35],
    ].map(([l, x, y]) => (
      <text key={l} x={x} y={y} fontSize="9" textAnchor="middle" fill="var(--ws-muted)">
        {l}
      </text>
    ))}
    {deg != null && (
      <g transform={`rotate(${deg + 180} 32 32)`}>
        <path d="M32 14 L38 40 L32 35 L26 40 Z" fill="var(--ws-wind)" />
      </g>
    )}
  </svg>
)

/** The sun's day: its arc from the rise to the set, the sun now on it. */
const SunArc = ({ sunrise, sunset, now, width = ARC_W }) => {
  // as wide as a card's half of a wide scene (the arc flatter than a half circle)
  const h = ARC_PX
  const share = sunrise && sunset ? (now - sunrise) / (sunset - sunrise) : null
  const up = share != null && share >= 0 && share <= 1
  const p = up ? share : null
  const x = (s) => 14 + s * (width - 28)
  const y = (s) => h - 6 - Math.sin(s * Math.PI) * (h - 18)
  const arc = Array.from(
    { length: 41 },
    (_, i) => `${x(i / 40).toFixed(1)},${y(i / 40).toFixed(1)}`,
  )
  return (
    <svg
      width="100%"
      height={ARC_PX}
      viewBox={`0 0 ${width} ${h}`}
      role="img"
      aria-label="The sun's day"
    >
      <line x1="4" x2={width - 4} y1={h - 6} y2={h - 6} stroke="var(--ws-line)" />
      <polyline points={arc.join(' ')} fill="none" stroke="var(--ws-line)" strokeDasharray="4 4" />
      {p != null && (
        <>
          <polyline
            points={arc.slice(0, Math.round(p * 40) + 1).join(' ')}
            fill="none"
            stroke="var(--ws-sun)"
            strokeWidth="2.5"
          />
          <circle cx={x(p)} cy={y(p)} r="8" fill="var(--ws-sun)" />
        </>
      )}
    </svg>
  )
}

const Tile = ({ icon, title, children, hint }) => (
  <section className="ws-card ws-tile" title={hint}>
    <div className="ws-tile-head">
      {icon}
      {title}
    </div>
    {children}
  </section>
)

const WeatherScene = ({ process, params }) => {
  const can = useCan()
  const now = useNow(60_000)
  const { forecast, error, busy, refresh } = useForecast(process.id)
  const c = process.config ?? {}
  const station = {
    temperatureC: useDeviceValue(c.temperatureDeviceId),
    humidityPct: useDeviceValue(c.humidityDeviceId),
    pressureHpa: useDeviceValue(c.pressureDeviceId),
    windMs: useDeviceValue(c.windSpeedDeviceId),
    wetnessPct: useDeviceValue(c.rainDeviceId),
    lightLevel: useDeviceValue(c.lightLevelDeviceId),
  }
  const num = (v) => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v))
  const scene = { ...SCENE_DEFAULTS, ...(c.scene ?? {}) }

  if (error && !forecast)
    return <div className="small text-body-secondary p-2">The forecast: {error}</div>
  if (!forecast) return <CSpinner size="sm" />

  const hourly = forecast.hourly ?? []
  const hourNow = currentHour(forecast, now)
  const ahead = hourly.filter((h) => h.t > now - 3_600_000).slice(0, HOURS_AHEAD + 1)
  const next24 = ahead.filter((h) => h.t > now - 3_600_000 && h.t <= now + HOURS_AHEAD * 3_600_000)
  // the station first, the forecast's hour where it has no reading
  const tC = num(station.temperatureC) ?? hourNow?.temperatureC ?? null
  const rh = num(station.humidityPct) ?? hourNow?.humidityPct ?? null
  const hpa = num(station.pressureHpa) ?? hourNow?.pressureHpa ?? null
  const windMs = num(station.windMs) ?? hourNow?.windSpeedMs ?? null
  const feels = apparentC(tC, rh, windMs)
  const dew = dewPointC(tC, rh)
  const bft = beaufortOf(windMs)
  const trend = pressureTrend(hourly, now)
  const level = LEVEL_BY_KEY[station.lightLevel]
  const daily = (forecast.daily ?? []).filter((d) => d.t >= dayOf(now))
  const today = daily.find((d) => dayOf(d.t) === dayOf(now)) ?? null
  const rainNext = next24.find(
    (h) => h.t >= now - 3_600_000 && (h.precipitationMm ?? 0) >= RAIN_MIN_MM,
  )
  const rain6h = next24
    .filter((h) => h.t < now + 6 * 3_600_000)
    .reduce((a, h) => a + (h.precipitationMm ?? 0), 0)
  const sky = hourNow
    ? {
        radiation: hourNow.radiationWm2 ?? 0,
        cloudPct: hourNow.cloudCoverPct ?? 0,
        isDay: hourNow.isDay !== 0,
      }
    : { radiation: 0, cloudPct: 0, isDay: true }

  // the next 24 hours' warnings
  const temps24 = next24.map((h) => h.temperatureC).filter((v) => v != null)
  const lo24 = temps24.length ? Math.min(...temps24) : null
  const hi24 = temps24.length ? Math.max(...temps24) : null
  const gust = next24.reduce(
    (a, h) => ((h.windGustsMs ?? 0) > (a?.windGustsMs ?? -1) ? h : a),
    null,
  )
  const wettest = next24.reduce(
    (a, h) => ((h.precipitationMm ?? 0) > (a?.precipitationMm ?? -1) ? h : a),
    null,
  )
  const firstAt = (test) => next24.find(test)?.t
  const alerts = [
    lo24 != null &&
      lo24 <= scene.frostC && {
        key: 'frost',
        color: 'info',
        text: `Frost from ${hhmm(firstAt((h) => h.temperatureC <= scene.frostC))}, down to ${fmt(lo24, 1)} °C`,
      },
    gust &&
      gust.windGustsMs >= scene.stormGustMs && {
        key: 'storm',
        color: 'danger',
        text: `Storm gusts up to ${fmt(gust.windGustsMs, 0)} m/s at ${hhmm(gust.t)} - the turbines may stop`,
      },
    wettest &&
      wettest.precipitationMm >= scene.heavyRainMmH && {
        key: 'rain',
        color: 'primary',
        text: `Heavy rain, ${fmt(wettest.precipitationMm, 1)} mm/h at ${hhmm(wettest.t)}`,
      },
    hi24 != null &&
      hi24 >= scene.heatC && {
        key: 'heat',
        color: 'warning',
        text: `Heat up to ${fmt(hi24, 0)} °C - the cooling's day`,
      },
  ].filter(Boolean)

  // the days: their hours, the low / high on the days' common range
  const days = daily.map((d) => {
    const hours = hourly.filter((h) => dayOf(h.t) === dayOf(d.t))
    const noon = hours.find((h) => new Date(h.t).getHours() === 12) ?? hours[0]
    const sun = kwhM2(d.radiationMjM2)
    return {
      ...d,
      noon,
      sun,
      sunLevel:
        sun == null
          ? null
          : sun >= scene.sunGoodKwhM2
            ? 'good'
            : sun >= scene.sunFairKwhM2
              ? 'fair'
              : 'poor',
      hdd: degreeDays(hours, scene.heatingBaseC),
    }
  })
  const lows = days.map((d) => d.temperatureMinC).filter((v) => v != null)
  const highs = days.map((d) => d.temperatureMaxC).filter((v) => v != null)
  const rangeLo = lows.length ? Math.floor(Math.min(...lows)) : 0
  const rangeHi = highs.length ? Math.ceil(Math.max(...highs)) : 1
  const pos = (v) => ((v - rangeLo) / (rangeHi - rangeLo || 1)) * 100
  const SUN_CLASS = { good: 'text-success', fair: 'text-warning', poor: 'text-body-secondary' }

  return (
    <div className="ws">
      <style>{CSS}</style>
      <div className="d-flex align-items-baseline justify-content-between gap-2 flex-wrap">
        <div className="d-flex align-items-baseline gap-3 flex-wrap">
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
          <span className="ws-muted">
            {forecast.location?.place ?? ''}
            {forecast.fetchedAt ? ` · the forecast of ${hhmm(forecast.fetchedAt)}` : ''}
          </span>
          {forecast.error && (
            <span className="small text-warning">the last fetch failed: {forecast.error}</span>
          )}
        </div>
        {can('processes.control', { process: process.id }) && (
          <CButton size="sm" color="secondary" variant="outline" disabled={busy} onClick={refresh}>
            {busy ? <CSpinner size="sm" /> : 'Refresh'}
          </CButton>
        )}
      </div>

      {alerts.length > 0 && (
        <div className="ws-alerts" role="status">
          {alerts.map((a) => (
            <span
              key={a.key}
              className={`ws-alert text-${a.color} border-${a.color} bg-${a.color}-subtle`}
            >
              {a.text}
            </span>
          ))}
        </div>
      )}

      <div className="ws-hero">
        <section className="ws-card ws-now">
          <div style={{ flexShrink: 0 }}>
            <SkyIcon {...sky} height={110} />
          </div>
          <div style={{ minWidth: 0 }}>
            <KeyValue
              value={fmt(tC, 1)}
              unit="°C"
              className="ws-temp"
              title="The station's temperature now"
            />
            <div className="fs-5 fw-semibold mt-1">{weatherText(hourNow?.weatherCode) ?? '-'}</div>
            <div className="ws-muted">
              Feels like <KeyValue value={fmt(feels, 0)} unit="°C" />
              {today && (
                <>
                  {' '}
                  · low{' '}
                  <KeyValue
                    value={fmt(today.temperatureMinC, 0)}
                    unit="°C"
                    color="var(--ws-cold)"
                  />{' '}
                  · high{' '}
                  <KeyValue
                    value={fmt(today.temperatureMaxC, 0)}
                    unit="°C"
                    color="var(--ws-warm)"
                  />
                </>
              )}
            </div>
          </div>
        </section>
        <section className="ws-card">
          <div className="d-flex justify-content-between ws-muted small">
            <span>Sunrise {today?.sunrise ? hhmm(today.sunrise) : '-'}</span>
            <span>Sunset {today?.sunset ? hhmm(today.sunset) : '-'}</span>
          </div>
          <SunArc sunrise={today?.sunrise} sunset={today?.sunset} now={now} />
          <div className="d-flex justify-content-between gap-2 flex-wrap">
            <span title="From the sunrise to the sunset">
              <span className="ws-muted">Daylight </span>
              {today?.sunrise && today?.sunset ? duration(today.sunset - today.sunrise) : '-'}
            </span>
            <span title="The day's sun on a square metre - what the PV can make of">
              <span className="ws-muted">Sun today </span>
              <KeyValue
                value={fmt(kwhM2(today?.radiationMjM2), 1)}
                unit="kWh/m²"
                color="var(--ws-sun)"
              />
            </span>
            <span title="The sun's radiation now">
              <span className="ws-muted">Now </span>
              <KeyValue value={fmt(hourNow?.radiationWm2, 0)} unit="W/m²" />
            </span>
          </div>
        </section>
      </div>

      <div className="ws-tiles">
        <Tile
          icon={<AnemometerIcon windMs={windMs ?? 0} size={22} />}
          title="Wind"
          hint="The station's wind, the forecast's gusts and direction (where it blows from)"
        >
          <div className="d-flex align-items-center justify-content-between gap-2">
            <div>
              <KeyValue value={fmt(windMs, 1)} unit="m/s" className="ws-main" />
              <div className="ws-muted small">
                {bft ? `${bft.force} Bft - ${bft.name}` : '-'}
                <br />
                gusts <KeyValue value={fmt(hourNow?.windGustsMs, 1)} unit="m/s" />
                {hourNow?.windDirectionDeg != null &&
                  ` · from ${compassOf(hourNow.windDirectionDeg)}`}
              </div>
            </div>
            <Compass deg={hourNow?.windDirectionDeg} />
          </div>
        </Tile>
        <Tile
          icon={<DropIcon size={22} />}
          title="Humidity"
          hint="The station's relative humidity; the dew point - where the air's water condenses"
        >
          <KeyValue value={fmt(rh, 0)} unit="%" className="ws-main" />
          <div className="ws-muted small">
            Dew point <KeyValue value={fmt(dew, 1)} unit="°C" />
          </div>
          <div className="ws-range" aria-hidden="true">
            <span
              style={{ left: 0, width: `${Math.min(100, rh ?? 0)}%`, background: 'var(--ws-rain)' }}
            />
          </div>
        </Tile>
        <Tile
          icon={<ThermoIcon size={22} />}
          title="Pressure"
          hint="The station's air pressure; its tendency - the forecast's last 3 hours"
        >
          <KeyValue value={fmt(hpa, 0)} unit="hPa" className="ws-main" />
          <div className="ws-muted small">
            {trend
              ? `${trend.word === 'rising' ? '↑' : trend.word === 'falling' ? '↓' : '→'} ${trend.word}, ${trend.deltaHpa >= 0 ? '+' : ''}${fmt(trend.deltaHpa, 1)} hPa in 3 h`
              : '-'}
          </div>
          <div className="ws-muted small">
            {trend?.word === 'falling'
              ? 'Weather may turn worse'
              : trend?.word === 'rising'
                ? 'Weather settling'
                : 'Weather stable'}
          </div>
        </Tile>
        <Tile
          icon={<RainIcon size={22} wet={(num(station.wetnessPct) ?? 0) > 0} />}
          title="Rain"
          hint="The station's wetness; the forecast's rain"
        >
          <KeyValue value={fmt(rain6h, 1)} unit="mm in 6 h" className="ws-main" />
          <div className="ws-muted small">
            {rainNext
              ? rainNext.t <= now
                ? 'Raining now'
                : `Rain from ${hhmm(rainNext.t)}`
              : `Dry the next ${HOURS_AHEAD} h`}
            <br />
            wetness <KeyValue value={fmt(num(station.wetnessPct), 0)} unit="%" />
          </div>
        </Tile>
        <Tile
          icon={<SkyIcon radiation={200} cloudPct={60} isDay height={18} />}
          title="Clouds"
          hint="The forecast's cloud cover now"
        >
          <KeyValue value={fmt(hourNow?.cloudCoverPct, 0)} unit="%" className="ws-main" />
          <div className="ws-range" aria-hidden="true">
            <span
              style={{
                left: 0,
                width: `${hourNow?.cloudCoverPct ?? 0}%`,
                background: 'var(--wx-cloud-edge)',
              }}
            />
          </div>
        </Tile>
        <Tile
          icon={level ? <CIcon icon={level.icon} style={{ color: level.defaultColor }} /> : null}
          title="Light"
          hint="The station's light sensor - its level by the configured zones"
        >
          <div className="fs-4 fw-bold" style={{ lineHeight: 1.2 }}>
            {level?.label ?? '-'}
          </div>
          <div className="ws-muted small">
            sun <KeyValue value={fmt(hourNow?.radiationWm2, 0)} unit="W/m²" />
          </div>
        </Tile>
      </div>

      <div className="ws-widgets">
        <TemperatureWidget
          forecast={forecast}
          outdoor={{
            temperatureC: tC,
            in3hC: hourly.find((h) => h.t > now + 2.5 * 3_600_000)?.temperatureC ?? null,
          }}
          weatherId={process.id}
        />
        <SunWidget
          m={{ weather: { radiationWm2: hourNow?.radiationWm2 ?? 0 } }}
          forecast={forecast}
          weatherId={process.id}
        />
        <WindWidget
          m={{ weather: { windMs: windMs ?? 0 } }}
          forecast={forecast}
          weatherId={process.id}
        />
      </div>

      <section className="ws-card">
        <div className="fw-semibold mb-2">The next {HOURS_AHEAD} hours</div>
        <div className="ws-hours" role="list">
          {next24.map((h) => {
            const isNow = h.t <= now && now < h.t + 3_600_000
            const mm = h.precipitationMm ?? 0
            return (
              <div
                key={h.t}
                role="listitem"
                className={`ws-hour${isNow ? ' ws-nowcol' : ''}`}
                title={`${hhmm(h.t)} - ${weatherText(h.weatherCode) ?? ''}, ${fmt(h.temperatureC, 1)} °C, clouds ${fmt(h.cloudCoverPct, 0)} %, sun ${fmt(h.radiationWm2, 0)} W/m², rain ${fmt(mm, 1)} mm, wind ${fmt(h.windSpeedMs, 1)} (${fmt(h.windGustsMs, 1)}) m/s`}
              >
                <span className="small ws-muted">{isNow ? 'Now' : hourOnly(h.t)}</span>
                <span style={{ height: 30, display: 'flex', alignItems: 'center' }}>
                  <HourSky h={h} height={26} />
                </span>
                <KeyValue value={fmt(h.temperatureC, 0)} unit="°" />
                <span className="ws-rainbar" aria-hidden="true">
                  <span
                    style={{
                      width: '100%',
                      height: `${Math.min(100, (mm / RAIN_BAR_MM) * 100)}%`,
                      background: 'var(--ws-rain)',
                      borderRadius: 3,
                    }}
                  />
                </span>
                <span
                  className="small"
                  style={{ color: mm >= RAIN_MIN_MM ? 'var(--ws-rain)' : 'var(--ws-muted)' }}
                >
                  {mm >= RAIN_MIN_MM ? fmt(mm, 1) : '-'}
                </span>
                <span className="small d-flex align-items-center gap-1 ws-muted">
                  <WindArrow deg={h.windDirectionDeg} size={12} color="var(--ws-wind)" />
                  {fmt(h.windSpeedMs, 0)}
                </span>
              </div>
            )
          })}
        </div>
        <div className="small ws-muted mt-1">°C · rain, mm · wind, m/s and where it blows</div>
      </section>

      <section className="ws-card">
        <div className="fw-semibold mb-2">The days</div>
        <div className="ws-days">
          {days.map((d) => (
            <React.Fragment key={d.t}>
              <span className="fw-semibold">{dayName(d.t, now)}</span>
              <span>{d.noon ? <HourSky h={{ ...d.noon, isDay: 1 }} height={26} /> : null}</span>
              <span
                className="d-flex align-items-center gap-2"
                title="The day's low and high on the days' common range"
              >
                <KeyValue value={fmt(d.temperatureMinC, 0)} unit="°" color="var(--ws-cold)" />
                <span className="ws-range flex-grow-1">
                  <span
                    style={{
                      left: `${pos(d.temperatureMinC)}%`,
                      width: `${Math.max(2, pos(d.temperatureMaxC) - pos(d.temperatureMinC))}%`,
                    }}
                  />
                </span>
                <KeyValue value={fmt(d.temperatureMaxC, 0)} unit="°" color="var(--ws-warm)" />
              </span>
              <span
                title="The day's rain"
                style={{
                  color: (d.precipitationMm ?? 0) >= RAIN_MIN_MM ? 'var(--ws-rain)' : undefined,
                }}
              >
                <KeyValue value={fmt(d.precipitationMm, 1)} unit="mm" />
              </span>
              <span className="ws-wide" title="The day's strongest wind">
                <KeyValue value={fmt(d.windSpeedMaxMs, 0)} unit="m/s" />
              </span>
              <span
                className="ws-wide"
                title={`The day's sun - the PV's: good from ${scene.sunGoodKwhM2}, fair from ${scene.sunFairKwhM2} kWh/m²`}
              >
                <KeyValue value={fmt(d.sun, 1)} unit="kWh/m²" className={SUN_CLASS[d.sunLevel]} />{' '}
                <span className="small ws-muted">{d.sunLevel ?? ''}</span>
              </span>
              <span
                className="ws-wide"
                title={`The heating's degree-days - the mean shortfall under ${scene.heatingBaseC} °C: the more, the more heat the buildings need`}
              >
                <KeyValue value={fmt(d.hdd, 1)} unit="K·d" />{' '}
                <span className="small ws-muted">heating</span>
              </span>
            </React.Fragment>
          ))}
        </div>
      </section>

      <div className="small ws-muted">
        The station&apos;s readings now; the forecast - {forecast.attribution}
      </div>
    </div>
  )
}

export default WeatherScene
