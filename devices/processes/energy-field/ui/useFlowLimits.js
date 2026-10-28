import { useEffect, useState } from 'react'
import { request } from 'src/api/client'

// The lines the grid's and the consumption's charts draw (their popups - the user, 2026-10-25): where
// the flows turn red or yellow on the scene (the process's alerts.ts) - red: the connection's import /
// export limits, the Energy Ledger's peak limit; yellow: the plan's expected import / consumption plus
// the tolerance (the field's `alerts` - overPlanPct, overPlanMinKw). The plan's expectation over the
// day: the ledger's samples (the past slots' forecast) and its plan (the slots ahead).

const DEFAULTS = { overPlanPct: 30, overPlanMinKw: 20 }
const SLOT_MID_MS = 7.5 * 60_000

export const useFlowLimits = (process, grid, enabled) => {
  const ledgerId = process.config?.ledgerProcessId ?? null
  const [data, setData] = useState(null)
  useEffect(() => {
    if (!enabled || !ledgerId) return undefined
    let cancelled = false
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    Promise.all([
      request(`/processes/${ledgerId}`).catch(() => null),
      request(`/energy-ledger/${ledgerId}/samples?from=${start.getTime()}&to=${Date.now()}`).catch(
        () => null,
      ),
      request(`/energy-ledger/${ledgerId}/plan`).catch(() => null),
    ]).then(([ledger, samples, plan]) => !cancelled && setData({ ledger, samples, plan }))
    return () => {
      cancelled = true
    }
  }, [enabled, ledgerId])

  const tol = { ...DEFAULTS, ...(process.config?.alerts ?? {}) }
  const over = (v) => v + Math.max(tol.overPlanMinKw, (Math.max(0, v) * tol.overPlanPct) / 100)
  const limits = grid?.config?.limits ?? {}
  const peak = data?.ledger?.config?.strategy?.peakLimitKw ?? null
  const past = (data?.samples?.samples ?? []).map((s) => ({
    t: s.t + SLOT_MID_MS,
    load: s.loadF,
    grid: s.loadF - s.pvF - s.windF - (s.batA ?? 0),
  }))
  const lastPast = past.length ? past[past.length - 1].t : 0
  const ahead = (data?.plan?.plan?.slots ?? [])
    .filter((s) => s.t + SLOT_MID_MS > lastPast)
    .map((s) => ({ t: s.t + SLOT_MID_MS, load: s.loadKw, grid: s.gridKw }))
  const expected = [...past, ...ahead]
  const line = (k) => expected.map((p) => ({ t: p.t, v: over(Math.max(0, p[k])) }))

  return {
    grid: [
      ...(limits.maxImportKw != null
        ? [{ value: limits.maxImportKw, level: 'critical', label: 'connection limit' }]
        : []),
      ...(limits.maxExportKw != null
        ? [{ value: -limits.maxExportKw, level: 'critical', label: 'export limit' }]
        : []),
      ...(peak != null ? [{ value: peak, level: 'critical', label: 'peak limit' }] : []),
      ...(expected.length
        ? [{ points: line('grid'), level: 'warning', label: 'well over the plan' }]
        : []),
    ],
    load: expected.length
      ? [{ points: line('load'), level: 'warning', label: 'well over the plan' }]
      : [],
  }
}
