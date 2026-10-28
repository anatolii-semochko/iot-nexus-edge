import React, { useState } from 'react'
import { CCol, CFormCheck, CFormInput, CFormLabel, CRow } from '@coreui/react'
import WeatherZonesSection from './WeatherZonesSection'

// The weather-control process's Settings section: the light-level zones
// and the forecast (its location, how often it is fetched) with the
// simulated node following it. Staged locally; the changed config
// sections reach the process when the modal's Save runs (registered with
// the '*' field - extraConfigRef holds { zones?, forecast?, simulation? }).

const numberOr = (text) => (text.trim() === '' ? undefined : Number(text))

const WeatherSettingsSection = ({ process, extraConfigRef }) => {
  const [forecast, setForecast] = useState(process.config.forecast ?? {})
  const [simulation, setSimulation] = useState(process.config.simulation ?? {})
  const stage = (section, value) => {
    extraConfigRef.current = {
      ...(extraConfigRef.current ?? {}),
      [section]: value,
    }
  }
  const editForecast = (key, value) => {
    const next = { ...forecast, [key]: value }
    if (value === undefined || value === '') delete next[key]
    setForecast(next)
    stage('forecast', next)
  }
  const editSimulation = (key, value) => {
    const next = { ...simulation, [key]: value }
    setSimulation(next)
    stage('simulation', next)
  }

  return (
    <>
      <WeatherZonesSection process={process} onChange={(zones) => stage('zones', zones)} />
      <h6 className="mt-4">Forecast (Open-Meteo)</h6>
      <CRow className="g-3">
        <CCol sm={3}>
          <CFormLabel>Latitude</CFormLabel>
          <CFormInput
            type="number"
            step="0.0001"
            value={forecast.latitude ?? ''}
            onChange={(e) => editForecast('latitude', numberOr(e.target.value))}
          />
        </CCol>
        <CCol sm={3}>
          <CFormLabel>Longitude</CFormLabel>
          <CFormInput
            type="number"
            step="0.0001"
            value={forecast.longitude ?? ''}
            onChange={(e) => editForecast('longitude', numberOr(e.target.value))}
          />
        </CCol>
        <CCol sm={3}>
          <CFormLabel>Place</CFormLabel>
          <CFormInput
            value={forecast.place ?? ''}
            maxLength={80}
            onChange={(e) => editForecast('place', e.target.value)}
          />
        </CCol>
        <CCol sm={3}>
          <CFormLabel>Refresh, min</CFormLabel>
          <CFormInput
            type="number"
            min={10}
            max={1440}
            placeholder="60"
            value={forecast.refreshMinutes ?? ''}
            onChange={(e) => editForecast('refreshMinutes', numberOr(e.target.value))}
          />
        </CCol>
      </CRow>
      <div className="text-body-secondary small mt-1">
        No location - no forecast. Fetched by the server, kept when a later fetch fails.
      </div>
      <CRow className="g-3 mt-1 align-items-end">
        <CCol sm={6}>
          <CFormCheck
            label="A simulated node follows the forecast"
            checked={simulation.followForecast !== false}
            onChange={(e) => editSimulation('followForecast', e.target.checked)}
          />
        </CCol>
        <CCol sm={3}>
          <CFormLabel>Every, s</CFormLabel>
          <CFormInput
            type="number"
            min={30}
            max={3600}
            placeholder="300"
            value={simulation.intervalSeconds ?? ''}
            onChange={(e) => editSimulation('intervalSeconds', numberOr(e.target.value))}
          />
        </CCol>
      </CRow>
    </>
  )
}

// one tab - "System" (the modal's own) + "Configuration" (this section)
WeatherSettingsSection.settingsTabs = ['Configuration']

export default WeatherSettingsSection
