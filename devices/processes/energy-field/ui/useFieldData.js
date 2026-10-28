import { useEffect, useState } from 'react'
import { request } from 'src/api/client'
import { useProcessLiveState } from 'src/api/useLiveProcess'

// What the Energy Field's scene draws: the field process's live metrics,
// its grid process (record + live metrics - the phases, the zone, today's
// money), the weather forecast and today's / tomorrow's prices. The
// forecast and the prices are re-read rarely (a demo - the hosting
// budget); the metrics come live over the shared WebSocket feed.

const FORECAST_RELOAD_MS = 15 * 60_000
const PRICES_RELOAD_MS = 15 * 60_000

const usePolled = (path, everyMs) => {
  const [data, setData] = useState(null)
  useEffect(() => {
    if (!path) return undefined
    let cancelled = false
    const load = () =>
      request(path)
        .then((d) => !cancelled && setData(d))
        .catch(() => {})
    load()
    const timer = setInterval(load, everyMs)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [path, everyMs])
  return data
}

export const useFieldData = (process) => {
  const live = useProcessLiveState(process.id)
  const m = live.metrics ?? process.metrics ?? {}
  const gridId = process.config?.gridProcessId ?? null
  const weatherId = process.config?.weatherProcessId ?? null
  const [grid, setGrid] = useState(null)
  useEffect(() => {
    if (!gridId) return undefined
    let cancelled = false
    request(`/processes/${gridId}`)
      .then((p) => !cancelled && setGrid(p))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [gridId])
  const gridLive = useProcessLiveState(gridId)
  const gridMetrics = gridLive.metrics ?? grid?.metrics ?? null
  const forecast = usePolled(
    weatherId ? `/weather-control/${weatherId}/forecast` : null,
    FORECAST_RELOAD_MS,
  )
  const prices = usePolled(gridId ? `/energy-grid/${gridId}/prices` : null, PRICES_RELOAD_MS)
  return { m, grid, gridMetrics, forecast, prices }
}

/** The forecast's rows from now on: { hour, ... } for the next `hours`. */
export const nextHours = (forecast, hours = 8, now = Date.now()) =>
  (forecast?.hourly ?? []).filter((h) => h.t > now - 3_600_000).slice(1, hours + 1)

/** The current forecast hour (the one now falls in). */
export const currentHour = (forecast, now = Date.now()) =>
  (forecast?.hourly ?? []).filter((h) => h.t <= now).slice(-1)[0] ?? null

export const fmt = (v, d = 1) =>
  v === null || v === undefined || Number.isNaN(Number(v)) ? '-' : Number(v).toFixed(d)
