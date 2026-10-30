import { useEffect, useState } from 'react'
import { request } from 'src/api/client'
import { useProcessLiveState } from 'src/api/useLiveProcess'

// The heating planner's latest plan (GET /heating-planner/:id/plan) - read again when the process made
// a new one (its live metrics' madeAt) and every few minutes; its metrics live too.

const RELOAD_MS = 5 * 60_000

export const usePlan = (process) => {
  const m = useProcessLiveState(process.id).metrics ?? process.metrics ?? {}
  const [plan, setPlan] = useState(null)
  const [error, setError] = useState(null)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((x) => x + 1), RELOAD_MS)
    return () => clearInterval(id)
  }, [])
  useEffect(() => {
    let cancelled = false
    request(`/heating-planner/${process.id}/plan`)
      .then((d) => !cancelled && (setPlan(d.plan), setError(null)))
      .catch((err) => !cancelled && setError(err.message))
    return () => {
      cancelled = true
    }
  }, [process.id, m.madeAt, tick])
  return { m, plan, error }
}

export const fmt = (v, d = 1) =>
  v === null || v === undefined || !Number.isFinite(Number(v)) ? '-' : Number(v).toFixed(d)
export const hhmm = (t) =>
  new Date(t).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })

/** The systems' slots summed slot by slot (all of them - "All"). */
export const sumSystems = (systems) => {
  const live = systems.filter((x) => x.slots?.length)
  if (!live.length) return []
  return live[0].slots.map((s, i) => {
    const at = live.map((x) => x.slots[i]).filter(Boolean)
    const add = (k) => at.reduce((a, x) => a + (x[k] ?? 0), 0)
    return {
      ...s,
      needKw: add('needKw'),
      heatKw: add('heatKw'),
      units: add('units'),
      electricKw: add('electricKw'),
      storeKwh: add('storeKwh'),
      costEur: add('costEur'),
      baselineEur: add('baselineEur'),
      roomOffsetK: Math.max(...at.map((x) => x.roomOffsetK ?? 0)),
      tankC: null,
      cheapKw: live[0].slots[i].cheapKw,
    }
  })
}

/** The plan in words: the runs of one choice (the units) - from, to, the units, the mean heat. */
export const stepsOf = (slots) =>
  slots.reduce((out, s) => {
    const last = out[out.length - 1]
    if (last && last.units === s.units) {
      last.end = s.end
      last.heat += s.heatKw
      last.n += 1
      last.offset = Math.max(last.offset, s.roomOffsetK ?? 0)
      last.ct += s.buyCtKwh
    } else
      out.push({
        t: s.t,
        end: s.end,
        units: s.units,
        heat: s.heatKw,
        n: 1,
        offset: s.roomOffsetK ?? 0,
        ct: s.buyCtKwh,
      })
    return out
  }, [])
