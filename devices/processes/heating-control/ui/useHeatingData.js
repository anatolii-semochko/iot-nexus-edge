import { useEffect, useState } from 'react'
import { request } from 'src/api/client'
import { useProcessLiveState } from 'src/api/useLiveProcess'

// What the heating scene draws: the process's live metrics (over the shared
// WebSocket feed) and its weather process's forecast - re-read rarely (a
// demo - the hosting budget).

const FORECAST_RELOAD_MS = 15 * 60_000

export const useHeatingData = (process) => {
  const live = useProcessLiveState(process.id)
  const m = live.metrics ?? process.metrics ?? {}
  const weatherId = process.config?.weatherProcessId ?? null
  const [forecast, setForecast] = useState(null)
  useEffect(() => {
    if (!weatherId) return undefined
    let cancelled = false
    const load = () =>
      request(`/weather-control/${weatherId}/forecast`)
        .then((d) => !cancelled && setForecast(d))
        .catch(() => {})
    load()
    const timer = setInterval(load, FORECAST_RELOAD_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [weatherId])
  return { m, forecast }
}

export const fmt = (v, d = 1) =>
  v === null || v === undefined || Number.isNaN(Number(v)) ? '-' : Number(v).toFixed(d)
