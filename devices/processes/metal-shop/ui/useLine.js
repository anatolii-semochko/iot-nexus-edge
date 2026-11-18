import { useEffect, useState } from 'react'
import { api, request } from 'src/api/client'
import { useProcessesLiveState } from 'src/api/useLiveProcess'

// The shop's live processes for its panel (steps 3-4, iot AGENTS_TO_DO.md 2026-11-18): the first
// `anodizing-line` and `drying-oven` processes the person sees, their metrics (live over the processes'
// stream). Each null - none yet (the panel keeps its mockup figures for that zone).

const KINDS = {
  line: ['anodizing-line', (m) => m?.baths],
  oven: ['drying-oven', (m) => m?.tempC !== undefined],
  qc: ['quality-control', (m) => m?.today?.passed !== undefined],
}

export const useShopProcesses = () => {
  const [list, setList] = useState(null)
  const live = useProcessesLiveState()
  useEffect(() => {
    let cancelled = false
    api
      .listProcesses()
      .then((l) => !cancelled && setList(l))
      .catch(() => !cancelled && setList([]))
    return () => {
      cancelled = true
    }
  }, [])
  return Object.fromEntries(
    Object.entries(KINDS).map(([key, [kind, ready]]) => {
      const process = list?.find((p) => p.kind === kind)
      const m = process ? (live[process.id]?.metrics ?? process.metrics ?? null) : null
      return [key, process && ready(m) ? { process, m } : null]
    }),
  )
}

/** Today's points of the line's series (`keys` - the value keys), reloaded every `reloadMs`. */
export const useLineSeries = (processId, keys, now) => {
  const [series, setSeries] = useState({})
  const joined = keys.join(',')
  useEffect(() => {
    if (!processId || !joined) return undefined
    let cancelled = false
    const start = new Date(now)
    start.setHours(0, 0, 0, 0)
    const full = joined.split(',').map((k) => `process:${processId}:${k}`)
    request(
      `/series/data?keys=${encodeURIComponent(full.join(','))}&from=${start.getTime()}&to=${now}&points=288`,
    )
      .then((d) => {
        if (cancelled) return
        setSeries(
          Object.fromEntries(joined.split(',').map((k, i) => [k, d.series?.[full[i]] ?? []])),
        )
      })
      .catch(() => !cancelled && setSeries({}))
    return () => {
      cancelled = true
    }
  }, [processId, joined, now])
  return series
}

/** The bar's step as "3 / 8" (a bar loaded, not yet in a bath - 0). */
export const barStep = (b) => `${Math.max(0, b.step + 1)} / ${b.steps}`

/** The zone card's lines and state from the line's metrics. */
export const lineZone = (m, tr) => {
  const anodize = m.baths.find((b) => b.role === 'anodize')
  const h = m.hoist ?? {}
  const carried = m.bars?.find((b) => b.carried)
  const station = h.to ?? h.from
  const target =
    station === 0
      ? tr('load')
      : station === m.baths.length + 1
        ? tr('unload')
        : (m.baths[station - 1]?.name ?? '-')
  const hoist =
    h.state === 'idle'
      ? tr('waiting')
      : carried
        ? `${tr(target)} - ${carried.id}`
        : `${tr('to')} ${tr(target)}`
  const r = m.rectifier ?? {}
  return {
    key: 'line',
    state: 'run',
    lines: [
      ['Hoist', hoist],
      [
        'Anodize',
        anodize ? `${anodize.tempC.toFixed(1)} °C - ${(r.densityAdm2 ?? 0).toFixed(1)} A/dm²` : '-',
      ],
      ['Rectifier', r.on ? `${r.voltageV.toFixed(1)} V - ${r.currentA} A` : tr('off')],
      ['Bars today', `${m.today?.bars ?? 0} - ${m.today?.parts ?? 0} ${tr('parts')}`],
    ],
  }
}

/** The oven's zone card from its metrics. */
export const ovenZone = (m, tr) => ({
  key: 'oven',
  state: 'run',
  lines: [
    ['Oven', `${m.tempC.toFixed(1)} °C${m.heating ? ' ▲' : ''}`],
    ...(m.drying ?? []).map((b) => [b.id, `${tr('left')} ${Math.ceil(b.leftMin)} ${tr('min')}`]),
    ['Waiting', String(m.queue?.length ?? 0)],
    ['Dried today', String(m.today?.batches ?? 0)],
  ],
})

/** QC and packing's zone card from its metrics. */
export const qcZone = (m, tr) => ({
  key: 'qc',
  state: m.results?.at(-1)?.verdict === 'check' ? 'warn' : 'run',
  lines: [
    ['In QC', m.current ? `${m.current.id} - ${m.current.reading ?? '-'} µm` : tr('waiting')],
    ['Passed today', `${m.today.passed} / ${m.today.rejected} ${tr('rejected')}`],
    ['Pallets packed', String(m.today.pallets)],
    [`${tr('Pallet')} ${m.today.pallets + 1}`, `${m.pallets?.filling ?? 0} / ${m.spec?.perPallet}`],
  ],
})
