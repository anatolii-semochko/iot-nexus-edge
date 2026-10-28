import React, { useCallback, useEffect, useState } from 'react'
import {
  CButton,
  CSpinner,
  CTable,
  CTableBody,
  CTableDataCell,
  CTableHead,
  CTableHeaderCell,
  CTableRow,
} from '@coreui/react'
import { request } from 'src/api/client'
import { useCan } from 'src/access'
import { useNow } from 'src/hooks/useNow'

// The weather-control process's forecast (api.ts - Open-Meteo, stored; the
// last good one kept when a fetch fails): the place, when fetched, the next
// hours and the days. Refresh - with the right to control the process.
const HOURS_SHOWN = 12
// re-read the stored forecast this often (the API fetches it hourly)
const RELOAD_MS = 10 * 60_000

const time = (ms) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
const day = (ms) =>
  new Date(ms).toLocaleDateString([], {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
const num = (v, d = 0) => (v === null || v === undefined ? '-' : Number(v).toFixed(d))

const ForecastBlock = ({ processId }) => {
  const can = useCan()
  const [forecast, setForecast] = useState(null)
  const [error, setError] = useState(null)
  const now = useNow(60_000)
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
    request(`/weather-control/${processId}/forecast/refresh`, {
      method: 'POST',
    })
      .then((f) => {
        setForecast(f)
        setError(null)
      })
      .catch((err) => setError(err.message))
      .finally(() => setBusy(false))
  }

  if (error && !forecast) return <div className="text-body-secondary small">Forecast: {error}</div>
  if (!forecast) return <CSpinner size="sm" />
  const hours = forecast.hourly.filter((h) => h.t >= now - 3_600_000).slice(0, HOURS_SHOWN)
  const days = forecast.daily.filter((d) => d.t >= now - 86_400_000)

  return (
    <div>
      <div className="d-flex align-items-center gap-3 mb-2 flex-wrap">
        <strong>
          Forecast
          {forecast.location?.place ? ` - ${forecast.location.place}` : ''}
        </strong>
        <span className="text-body-secondary small">
          {forecast.fetchedAt
            ? `fetched ${new Date(forecast.fetchedAt).toLocaleString()}`
            : 'not fetched yet'}
        </span>
        {forecast.error && (
          <span
            className="text-warning small"
            title={forecast.errorAt ? new Date(forecast.errorAt).toLocaleString() : undefined}
          >
            the last fetch failed: {forecast.error}
          </span>
        )}
        {can('processes.control', { process: processId }) && (
          <CButton size="sm" color="secondary" variant="outline" disabled={busy} onClick={refresh}>
            {busy ? <CSpinner size="sm" /> : 'Refresh'}
          </CButton>
        )}
      </div>
      {hours.length > 0 && (
        <CTable small responsive className="mb-2">
          <CTableHead>
            <CTableRow>
              <CTableHeaderCell>Hour</CTableHeaderCell>
              <CTableHeaderCell>Temperature, °C</CTableHeaderCell>
              <CTableHeaderCell>Clouds, %</CTableHeaderCell>
              <CTableHeaderCell>Sun, W/m²</CTableHeaderCell>
              <CTableHeaderCell>Wind, m/s</CTableHeaderCell>
              <CTableHeaderCell>Rain, mm</CTableHeaderCell>
            </CTableRow>
          </CTableHead>
          <CTableBody>
            {hours.map((h) => (
              <CTableRow key={h.t}>
                <CTableDataCell>{time(h.t)}</CTableDataCell>
                <CTableDataCell>{num(h.temperatureC, 1)}</CTableDataCell>
                <CTableDataCell>{num(h.cloudCoverPct)}</CTableDataCell>
                <CTableDataCell>{num(h.radiationWm2)}</CTableDataCell>
                <CTableDataCell>
                  {num(h.windSpeedMs, 1)}{' '}
                  <span className="text-body-secondary small">({num(h.windGustsMs, 1)})</span>
                </CTableDataCell>
                <CTableDataCell>{num(h.precipitationMm, 1)}</CTableDataCell>
              </CTableRow>
            ))}
          </CTableBody>
        </CTable>
      )}
      {days.length > 0 && (
        <div className="d-flex gap-4 flex-wrap small mb-1">
          {days.map((d) => (
            <div key={d.t}>
              <div className="fw-semibold">{day(d.t)}</div>
              <div>
                {num(d.temperatureMinC)} .. {num(d.temperatureMaxC)} °C, rain{' '}
                {num(d.precipitationMm, 1)} mm
              </div>
              <div className="text-body-secondary">
                sun {d.sunrise ? time(d.sunrise) : '-'} - {d.sunset ? time(d.sunset) : '-'}
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="text-body-secondary" style={{ fontSize: '0.75rem' }}>
        {forecast.attribution}
      </div>
    </div>
  )
}

export default ForecastBlock
