import React from 'react'
import CIcon from '@coreui/icons-react'
import { CCol, CRow } from '@coreui/react'
import { LEVEL_BY_KEY } from './lightLevels'
import { useDeviceValue } from 'src/views/processes/useDeviceValue'
import ForecastBlock from './ForecastBlock'

const Reading = ({ label, value, unit, decimals = 1 }) => (
  <CCol xs="auto">
    <div className="text-body-secondary small">{label}</div>
    <div style={{ fontSize: '1.9rem', fontWeight: 600, lineHeight: 1 }}>
      {value !== undefined && value !== null
        ? `${Number(value).toFixed(decimals)}${unit ?? ''}`
        : '-'}
    </div>
  </CCol>
)

/**
 * Expandable-row detail of the "weather-control" process kind (CORE Library
 * package devices/processes/weather-control/) - read-only: the station's
 * readings (the raw sensors plus the computed light level; wind and rain
 * when the node has them) and, with a location set, the forecast
 * (ForecastBlock). The light-level zones are edited in the process's
 * Settings (Zones), the forecast's location in its config.
 */
const WeatherControlPanel = ({ process }) => {
  const {
    temperatureDeviceId,
    humidityDeviceId,
    pressureDeviceId,
    lightDeviceId,
    lightLevelDeviceId,
    windSpeedDeviceId,
    rainDeviceId,
    forecast,
  } = process.config

  const temperature = useDeviceValue(temperatureDeviceId)
  const humidity = useDeviceValue(humidityDeviceId)
  const pressure = useDeviceValue(pressureDeviceId)
  const light = useDeviceValue(lightDeviceId)
  const lightLevel = useDeviceValue(lightLevelDeviceId)
  const windSpeed = useDeviceValue(windSpeedDeviceId)
  const rain = useDeviceValue(rainDeviceId)

  const level = typeof lightLevel === 'string' ? LEVEL_BY_KEY[lightLevel] : undefined

  return (
    <div className="pt-0 pb-3 px-2">
      <CRow className="align-items-center g-4">
        <Reading label="Temperature" value={temperature} unit="°C" />
        <Reading label="Humidity" value={humidity} unit="%RH" />
        <Reading label="Pressure" value={pressure} unit=" hPa" />
        <Reading label="Light (raw)" value={light} unit="" decimals={0} />
        {windSpeedDeviceId !== undefined && <Reading label="Wind" value={windSpeed} unit=" m/s" />}
        {rainDeviceId !== undefined && (
          <Reading label="Rain (wetness)" value={rain} unit="%" decimals={0} />
        )}
        <CCol xs="auto">
          <div className="text-body-secondary small">Light level</div>
          <div
            className="d-flex align-items-center gap-2"
            style={{ fontSize: '1.9rem', fontWeight: 600, lineHeight: 1 }}
          >
            {level ? (
              <>
                <CIcon icon={level.icon} size="lg" style={{ color: level.defaultColor }} />
                {level.label}
              </>
            ) : (
              '-'
            )}
          </div>
        </CCol>
      </CRow>
      {forecast?.latitude !== undefined && (
        <div className="mt-4">
          <ForecastBlock processId={process.id} />
        </div>
      )}
    </div>
  )
}

export default WeatherControlPanel
