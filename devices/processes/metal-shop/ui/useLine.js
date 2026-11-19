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
  utilities: ['shop-utilities', (m) => m?.compressor !== undefined],
  machining: ['machining', (m) => Array.isArray(m?.machines)],
  chem: ['chem-wastewater', (m) => Array.isArray(m?.tanks) && m?.wastewater !== undefined],
  shop: ['metal-shop', (m) => Array.isArray(m?.flow)],
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

/** The utilities' zone card from their metrics. */
export const utilitiesZone = (m) => ({
  key: 'utilities',
  state: m.di.uScm > m.di.limit ? 'warn' : 'run',
  lines: [
    [
      'Compressed air',
      `${m.compressor.bar.toFixed(1)} bar - ${m.compressor.powerKw.toFixed(1)} kW`,
    ],
    ['Chiller', `${m.chiller.supplyC.toFixed(1)} °C - ${m.chiller.loadKw.toFixed(0)} kW`],
    ['DI water', `${m.di.uScm.toFixed(1)} µS/cm`],
  ],
})

/** The chemistry and wastewater zone's card from its metrics: the lowest tank, the dosing, the wastewater. */
export const chemZone = (m, tr) => {
  const low = [...m.tanks].sort((a, b) => a.levelPct - b.levelPct)[0]
  const w = m.wastewater
  const phOut = w.ph < w.discharge.minPh || w.ph > w.discharge.maxPh
  const dosing = m.dosing.filter((d) => d.pump).map((d) => tr(d.bath))
  return {
    key: 'chem',
    state: m.tanks.some((t) => t.state === 'critical')
      ? 'stop'
      : m.tanks.some((t) => t.state !== 'ok') || phOut || w.collectionPct > w.highPct
        ? 'warn'
        : 'run',
    lines: [
      low && [
        tr(low.name),
        `${Math.round(low.levelPct)} %${low.daysLeft !== null ? ` - ${Math.round(low.daysLeft)} ${tr('d')}` : ''}`,
      ],
      ['Dosing', dosing.length ? dosing.join(', ') : tr('none')],
      ['Collection tank', `${Math.round(w.collectionPct)} %${w.pump ? ` - ${tr('pumping')}` : ''}`],
      ['Discharge', `pH ${w.ph.toFixed(1)}${w.press ? ` - ${tr('press running')}` : ''}`],
    ].filter(Boolean),
  }
}

const STATE_OF = { run: 'run', setup: 'warn', idle: 'warn', alarm: 'stop', off: 'stop' }
const MACHINE_STATE = {
  run: 'running',
  setup: 'setup',
  idle: 'waiting',
  alarm: 'tool change',
  off: 'off',
}

/** A machine's line: "running - 14 / 40", "setup - 12 min". */
export const machineLine = (x, tr) =>
  x.state === 'run'
    ? `${tr('running')} - ${x.done} / ${x.qty}`
    : x.state === 'setup'
      ? `${tr('setup')} - ${Math.ceil(x.setupLeftMin)} ${tr('min')}`
      : tr(MACHINE_STATE[x.state])

/** The blanks' zone card from the machining's metrics. */
export const blanksZone = (m, tr) => {
  const low = m.stock.filter((s) => s.stockM < s.minM)
  return {
    key: 'blanks',
    state: low.length ? 'warn' : 'run',
    lines: [
      [
        'Saw',
        m.saw.cutting
          ? `${tr('cutting')} - ${tr(m.saw.cutting)}`
          : tr(m.onShift ? 'waiting' : 'off'),
      ],
      ...(low.length
        ? low.map((s) => [s.name, `${s.stockM.toFixed(1)} / ${s.minM} m`])
        : [['Stock in metres', `${Math.round(m.stock.reduce((a, s) => a + s.stockM, 0))} m`]]),
      ['Cuts today', String(m.saw.cuts)],
    ],
  }
}

/** The CNC zone's card from the machining's metrics. */
export const cncZone = (m, tr) => ({
  key: 'cnc',
  state: m.machines.some((x) => x.state === 'alarm')
    ? 'stop'
    : m.machines.every((x) => x.state === 'run')
      ? 'run'
      : 'warn',
  lines: [
    ...m.machines.map((x) => [tr(x.name), machineLine(x, tr)]),
    ['OEE today', `${m.today.oeePct} %`],
  ],
})

export { STATE_OF, MACHINE_STATE }
