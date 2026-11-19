import React, { useState } from 'react'
import UnitPopup from 'src/components/nodeInfo/UnitPopup'
import StatTile from 'src/components/StatTile'
import KeyValue from 'src/components/KeyValue'
import { packageT } from 'src/i18n'
import picture from './factory-shop.webp'
import spots from './factory-shop.json'
import MockChart from './MockChart'
import { daySeries, SERIES } from './mockSeries'
import { barStep, MACHINE_STATE, machineLine, STATE_OF, useLineSeries } from './useLine'
import ZoneScene, { zonePicture } from './ZoneScene'
// the package's words (its own locales/, then the core's)
const tr = packageT('metal-shop')

// A zone's popup (step 2 - a mockup, iot AGENTS_TO_DO.md 2026-11-18): the zone's piece of the shop's plan
// on the left (the picture cut to its outline - factory-shop.json), its readings, its machines or baths
// in a table, today's charts - all on fixed figures (mockData / mockSeries) in the live process's shape.

// the picture's size in px (written by the trim with the hot spots)
const [PIC_W, PIC_H] = spots.size ?? [1425, 607]
// "5 min" in the viewer's language
const mins = (n) => `${n} ${tr('min')}`
const C = {
  a: 'var(--cui-primary)',
  b: 'var(--cui-success)',
  c: 'var(--cui-warning)',
  d: 'var(--cui-danger)',
  grey: 'var(--cui-secondary-color)',
}

/** The zone's piece of the plan - an <svg> showing only the zone's outline's box of the picture. */
const ZonePicture = ({ index }) => {
  const poly = spots.rooms[index]?.poly ?? [
    [0, 0],
    [1, 1],
  ]
  const xs = poly.map((p) => p[0] * PIC_W)
  const ys = poly.map((p) => p[1] * PIC_H)
  const pad = 20
  const x0 = Math.max(0, Math.min(...xs) - pad)
  const y0 = Math.max(0, Math.min(...ys) - pad * 3)
  const w = Math.min(PIC_W, Math.max(...xs) + pad) - x0
  const h = Math.min(PIC_H, Math.max(...ys) + pad) - y0
  return (
    <svg viewBox={`${x0} ${y0} ${w} ${h}`} role="img" aria-hidden="true">
      <image href={picture} width={PIC_W} height={PIC_H} />
    </svg>
  )
}

// the plan's wide middle zones - their picture across the popup; the narrow side ones (the user,
// 2026-11-18) - a third of a wide screen beside the readings, above them on a narrow one
const WIDE_ZONES = new Set(['line', 'utilities'])
const SPLIT_CSS = `
.ms-zone-split { display: grid; grid-template-columns: 1fr 2fr; gap: 16px; align-items: start }
@media (max-width: 991.98px) { .ms-zone-split { grid-template-columns: 1fr } }
`

const Stats = ({ items }) => (
  <div
    className="d-grid mb-3"
    style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 12 }}
  >
    {items.map(([label, value, unit, color]) => (
      <StatTile key={label} label={tr(label)}>
        <KeyValue value={value} unit={unit} color={color} />
      </StatTile>
    ))}
  </div>
)

const Table = ({ head, rows }) => (
  <div className="table-responsive mb-3">
    <table className="table table-sm mb-0 small">
      <thead>
        <tr>
          {head.map((h) => (
            <th key={h} className="fw-semibold text-body-secondary">
              {tr(h)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r[0]}>
            {r.map((c, i) => (
              <td key={i} className={i === 0 ? 'fw-semibold' : undefined}>
                {typeof c === 'string' ? tr(c) : c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
)

const STATE = (s, text) => (
  <span>
    <span
      className="d-inline-block rounded-circle me-1"
      style={{ width: 8, height: 8, background: s === 'run' ? C.b : s === 'warn' ? C.c : C.d }}
    />
    {tr(text)}
  </span>
)

// each zone: its readings, its table, its charts (the order - the plan's zones)
const ZONES = [
  {
    key: 'blanks',
    title: 'Blanks and saw',
    labels: { saw: 'cutting', blanks: '214 m' },
    stats: [
      ['Saw', tr('cutting')],
      ['Blade', 61, 'h'],
      ['Cuts today', 124],
      ['Stock in metres', 214, 'm'],
    ],
    table: {
      head: ['Material', 'Size', 'In stock', 'Minimum'],
      rows: [
        ['6061 bar', 'Ø40', '38 m', '20 m'],
        ['6061 bar', 'Ø60', '22 m', '15 m'],
        ['6082 flat', '60 x 10', '96 m', '40 m'],
        ['7075 bar', 'Ø30', '9 m', '12 m'],
      ],
    },
    charts: [{ title: 'Cuts per hour', unit: '', lines: [['cuts', 'cutsPerHour', C.a]] }],
  },
  {
    key: 'cnc',
    title: 'CNC machining',
    labels: { cnc1: 'CNC 1 - 14 / 40', cnc2: 'CNC 2 - setup' },
    stats: [
      ['Running', '1 / 2'],
      ['Parts today', 86],
      ['OEE today', 71, '%'],
      ['Energy per part', 0.42, 'kWh'],
    ],
    table: {
      head: ['Machine', 'State', 'Program', 'Parts', 'Cycle', 'OEE'],
      rows: [
        ['CNC 1', STATE('run', 'running'), 'A-12 housing', '14 / 40', '6:20', '78 %'],
        ['CNC 2', STATE('warn', 'setup'), 'K-7 bracket', '0 / 120', '-', '64 %'],
      ],
    },
    charts: [
      {
        title: 'Power, kW',
        unit: 'kW',
        lines: [
          ['CNC 1', 'cnc1Kw', C.a],
          ['CNC 2', 'cnc2Kw', C.b],
        ],
      },
      { title: 'Parts per hour', unit: '', lines: [['parts', 'partsPerHour', C.c]] },
    ],
  },
  {
    key: 'line',
    title: 'Anodizing line',
    stats: [
      ['Hoist', tr('Anodize')],
      ['Flight bar', '3 / 6'],
      ['Current', 2860, 'A'],
      ['Voltage', 14.2, 'V'],
      ['Current density', 1.4, 'A/dm²'],
      ['Coating', '11.3 / 15', 'µm'],
    ],
    table: {
      head: ['Bath', 'Temperature', 'Set', 'Level', 'Time'],
      rows: [
        ['Degrease', '58.6 °C', '60 °C', '94 %', mins(5)],
        ['Rinse 1', '21.0 °C', '-', '97 %', mins(1)],
        ['Etch', '54.8 °C', '55 °C', '91 %', mins(3)],
        ['Rinse 2', '20.8 °C', '-', '96 %', mins(1)],
        ['Anodize', '19.8 °C', '20 °C', '95 %', mins(45)],
        ['Rinse 3', '20.6 °C', '-', '97 %', mins(1)],
        ['Dye', '55.1 °C', '55 °C', '93 %', mins(10)],
        ['Seal', '96.4 °C', '97 °C', '90 %', mins(30)],
      ],
    },
    charts: [
      {
        title: 'Anodize bath, °C',
        unit: '°C',
        lines: [
          ['bath', 'anodizeC', C.a],
          ['set', 'anodizeSetC', C.grey, true],
        ],
      },
      { title: 'Rectifier, A', unit: 'A', lines: [['current', 'rectifierA', C.c]] },
    ],
  },
  {
    key: 'oven',
    title: 'Drying oven',
    labels: { oven: '82 °C - B-0412' },
    stats: [
      ['Temperature', 82, '°C'],
      ['Set', 82, '°C'],
      ['Batch', 'B-0412'],
      ['Left', 12, 'min'],
      ['Power', 18.5, 'kW'],
    ],
    charts: [
      {
        title: 'The oven, °C',
        unit: '°C',
        lines: [
          ['oven', 'ovenC', C.d],
          ['set', 'ovenSetC', C.grey, true],
        ],
      },
    ],
  },
  {
    key: 'qc',
    title: 'QC and packing',
    labels: { qc: '312 / 2', packing: 'Pallet 2' },
    stats: [
      ['Passed today', 312],
      ['Rejected', 2],
      ['Rejects', 0.6, '%'],
      ['Pallets packed', 3],
    ],
    table: {
      head: ['Batch', 'Coating, mean', 'Min', 'Max', 'Result'],
      rows: [
        ['B-0408', '15.4 µm', '14.1', '16.8', STATE('run', 'passed')],
        ['B-0409', '15.1 µm', '13.6', '16.2', STATE('run', 'passed')],
        ['B-0410', '14.6 µm', '12.9', '15.9', STATE('warn', 'check')],
      ],
    },
    charts: [{ title: 'Rejects, %', unit: '%', lines: [['rejects', 'rejectsPct', C.d]] }],
  },
  {
    key: 'utilities',
    title: 'Utilities',
    labels: {
      compressor: '7.1 bar',
      chiller: '9.0 °C',
      wastewater: 'pH 7.4',
      'di-water': '2.1 µS/cm',
    },
    stats: [
      ['Compressed air', 7.1, 'bar'],
      ['Compressor', 11, 'kW'],
      ['Chiller', 9.0, '°C'],
      ['Wastewater', 7.4, 'pH'],
      ['Dosing', tr('acid')],
      ['DI water', 2.1, 'µS/cm'],
    ],
    charts: [
      { title: 'Compressed air, bar', unit: 'bar', lines: [['air', 'airBar', C.a]] },
      { title: 'Wastewater, pH', unit: 'pH', lines: [['pH', 'wastewaterPh', C.b]] },
    ],
  },
]

/** The anodizing line's zone from its live metrics (step 3): the same parts, its series for the charts. */
const liveLine = (m) => {
  const anodize = m.baths.find((b) => b.role === 'anodize')
  const r = m.rectifier ?? {}
  const inAnodize = m.bars?.find((b) => b.id === r.barId)
  const bathOf = new Map((m.bars ?? []).filter((b) => !b.carried).map((b) => [b.bath, b]))
  return {
    key: 'line',
    title: 'Anodizing line',
    live: true,
    labels: Object.fromEntries(
      m.baths.map((b) => {
        const bar = bathOf.get(b.name)
        return [
          `bath:${b.name}`,
          <>
            <b>{b.tempC.toFixed(1)} °C</b>
            {b.heating ? ' ▲' : b.cooling ? ' ▼' : ''}
            {bar && <div className="ms-tag-sub">{bar.id}</div>}
          </>,
        ]
      }),
    ),
    stats: [
      ['Power', m.powerKw, 'kW'],
      ['Current', r.currentA ?? 0, 'A'],
      ['Voltage', r.voltageV ?? 0, 'V'],
      ['Current density', r.densityAdm2 ?? 0, 'A/dm²'],
      ['Coating', inAnodize ? inAnodize.coatingUm : '-', inAnodize ? 'µm' : undefined],
      ['Bars today', m.today?.bars ?? 0],
      ['Parts today', m.today?.parts ?? 0],
      ['Energy today', m.today?.kwh ?? 0, 'kWh'],
    ],
    table: {
      head: ['Bath', 'Temperature', 'Set', 'Level', 'Bar', 'Time'],
      rows: m.baths.map((b) => {
        const bar = bathOf.get(b.name)
        return [
          b.name,
          `${b.tempC.toFixed(1)} °C${b.heating ? ' ▲' : b.cooling ? ' ▼' : ''}`,
          b.setC === null ? '-' : `${b.setC} °C`,
          `${Math.round(b.levelPct)} %`,
          bar ? `${bar.id} (${barStep(bar)})` : '-',
          bar ? `${Math.floor(bar.elapsedMin)} / ${mins(bar.needMin)}` : '-',
        ]
      }),
    },
    charts: [
      {
        title: 'Anodize bath, °C',
        unit: '°C',
        lines: anodize ? [['bath', `line.bath.${anodize.nodeId}.tempC`, C.a]] : [],
      },
      { title: 'Rectifier, A', unit: 'A', lines: [['current', 'line.rectifierA', C.c]] },
      { title: "The line's electricity, kW", unit: 'kW', lines: [['power', 'line.powerKw', C.b]] },
    ],
  }
}

/** The drying oven's zone from its live metrics (step 4). */
const liveOven = (m) => ({
  key: 'oven',
  title: 'Drying oven',
  live: true,
  labels: { oven: `${m.tempC.toFixed(1)} °C${m.heating ? ' ▲' : ''}` },
  stats: [
    ['Temperature', m.tempC, '°C'],
    ['Set', m.setC, '°C'],
    ['Power', m.powerKw, 'kW'],
    ['Drying', `${m.drying?.length ?? 0} / ${m.capacity}`],
    ['Waiting', m.queue?.length ?? 0],
    ['Dried today', m.today?.batches ?? 0],
    ['Energy today', m.today?.kwh ?? 0, 'kWh'],
  ],
  table: {
    head: ['Bar', 'State', 'Left'],
    rows: [
      ...(m.drying ?? []).map((b) => [b.id, 'drying', mins(Math.ceil(b.leftMin))]),
      ...(m.queue ?? []).map((id) => [id, 'waiting', '-']),
    ],
  },
  charts: [
    { title: 'The oven, °C', unit: '°C', lines: [['oven', 'oven.tempC', C.d]] },
    { title: 'Power, kW', unit: 'kW', lines: [['power', 'oven.powerKw', C.a]] },
  ],
})

/** QC and packing's zone from its live metrics (step 5). */
const liveQc = (m) => ({
  key: 'qc',
  title: 'QC and packing',
  live: true,
  labels: {
    qc: m.current ? `${m.current.id} - ${m.current.reading ?? '-'} µm` : 'waiting',
    packing: `${tr('Pallet')} ${m.today.pallets + 1}: ${m.pallets?.filling ?? 0} / ${m.spec?.perPallet}`,
  },
  stats: [
    ['Passed today', m.today.passed],
    ['Rejected', m.today.rejected],
    ['Rejects', m.today.rejectsPct, '%'],
    ['Pallets packed', m.today.pallets],
    ['Waiting', m.queue?.length ?? 0],
  ],
  table: {
    head: ['Batch', 'Coating, mean', 'Min', 'Max', 'Result'],
    rows: [
      ...(m.current
        ? [[m.current.id, `${m.current.reading ?? '-'} µm`, '-', '-', 'measuring']]
        : []),
      ...[...(m.results ?? [])]
        .reverse()
        .map((x) => [
          x.id,
          `${x.meanUm} µm`,
          String(x.minUm),
          String(x.maxUm),
          STATE(
            x.verdict === 'passed' ? 'run' : 'warn',
            x.verdict === 'passed' ? 'passed' : 'check',
          ),
        ]),
    ],
  },
  charts: [
    { title: 'Passed today', unit: '', lines: [['passed', 'qc.passed', C.b]] },
    { title: 'Rejects, %', unit: '%', lines: [['rejects', 'qc.rejectsPct', C.d]] },
  ],
})

/** The utilities' zone from their live metrics (step 6). */
const liveUtilities = (m) => {
  const STATES = { loaded: 'loaded', unloaded: 'unloaded', off: 'off' }
  return {
    key: 'utilities',
    title: 'Utilities',
    live: true,
    labels: {
      compressor: `${m.compressor.bar.toFixed(1)} bar`,
      chiller: `${m.chiller.supplyC.toFixed(1)} / ${m.chiller.returnC.toFixed(1)} °C`,
      wastewater: `pH ${m.wastewater.ph.toFixed(2)}`,
      'di-water': `${m.di.uScm.toFixed(1)} µS/cm`,
    },
    stats: [
      ['Compressed air', m.compressor.bar, 'bar'],
      ['Compressor', m.compressor.powerKw, 'kW'],
      ['Chiller', m.chiller.powerKw, 'kW'],
      ['Wastewater', m.wastewater.ph, 'pH'],
      ['DI water', m.di.uScm, 'µS/cm'],
      ['Energy today', r1(m.today.compressorKwh + m.today.chillerKwh), 'kWh'],
    ],
    table: {
      head: ['Unit', 'State', 'Reading', 'Today'],
      rows: [
        [
          'Compressor',
          STATES[m.compressor.state],
          `${m.compressor.demandM3Min} m³/min`,
          `${m.today.compressorKwh} kWh`,
        ],
        [
          'Chiller',
          m.chiller.running ? 'running' : 'off',
          `${m.chiller.loadKw} kW ${tr('of heat')}`,
          `${m.today.chillerKwh} kWh`,
        ],
        [
          'Wastewater',
          m.wastewater.naoh ? 'dosing' : m.wastewater.acid ? 'acid dosing' : 'neutral',
          `${m.wastewater.inflowLMin} l/min`,
          `NaOH ${m.today.naohL} l`,
        ],
        [
          'DI water',
          m.di.regenLeftMin > 0 ? 'regenerating' : 'in service',
          `${tr('column')} ${m.di.column}`,
          `${m.today.diM3} m³`,
        ],
      ],
    },
    charts: [
      { title: 'Compressed air, bar', unit: 'bar', lines: [['air', 'util.airBar', C.a]] },
      { title: 'Wastewater, pH', unit: 'pH', lines: [['pH', 'util.wastewaterPh', C.b]] },
      { title: 'Utilities, kW', unit: 'kW', lines: [['power', 'util.powerKw', C.c]] },
    ],
  }
}
const r1 = (x) => Math.round(x * 10) / 10

/** The blanks' zone from the machining's live metrics (step 7). */
const liveBlanks = (m) => ({
  key: 'blanks',
  title: 'Blanks and saw',
  live: true,
  labels: {
    saw: m.saw.cutting ? `${tr('cutting')} - ${tr(m.saw.cutting)}` : m.onShift ? 'waiting' : 'off',
    blanks: `${Math.round(m.stock.reduce((a, s) => a + s.stockM, 0))} m`,
  },
  stats: [
    ['Saw', tr(m.saw.cutting ? 'cutting' : m.onShift ? 'waiting' : 'off')],
    ['Cuts today', m.saw.cuts],
    ['Stock in metres', Math.round(m.stock.reduce((a, s) => a + s.stockM, 0)), 'm'],
    ['Power', m.saw.powerKw, 'kW'],
  ],
  table: {
    head: ['Material', 'In stock', 'Minimum'],
    rows: m.stock.map((s) => [
      s.name,
      STATE(s.stockM < s.minM ? 'warn' : 'run', `${s.stockM.toFixed(1)} m`),
      `${s.minM} m`,
    ]),
  },
  charts: [{ title: 'Machining, kW', unit: 'kW', lines: [['power', 'mach.powerKw', C.a]] }],
})

/** The CNC zone from the machining's live metrics (step 7). */
const liveCnc = (m) => ({
  key: 'cnc',
  title: 'CNC machining',
  live: true,
  labels: Object.fromEntries(
    m.machines.map((x, k) => [`cnc${k + 1}`, `${tr(x.name)} - ${machineLine(x, tr)}`]),
  ),
  stats: [
    ['Running', `${m.machines.filter((x) => x.state === 'run').length} / ${m.machines.length}`],
    ['Parts today', m.today.parts],
    ['OEE today', m.today.oeePct, '%'],
    [
      'Energy per part',
      m.today.parts ? Math.round((m.today.kwh / m.today.parts) * 100) / 100 : '-',
      m.today.parts ? 'kWh' : undefined,
    ],
  ],
  table: {
    head: ['Machine', 'State', 'Program', 'Parts', 'Cycle', 'Tool', 'OEE'],
    rows: m.machines.map((x) => [
      x.name,
      STATE(STATE_OF[x.state], MACHINE_STATE[x.state]),
      x.part,
      `${x.done} / ${x.qty}`,
      x.cycleLeftS !== null
        ? `${Math.floor(x.cycleLeftS / 60)}:${String(x.cycleLeftS % 60).padStart(2, '0')}`
        : '-',
      mins(x.toolLeftMin),
      `${x.oeePct} %`,
    ]),
  },
  charts: [
    {
      title: 'Power, kW',
      unit: 'kW',
      lines: m.machines.map((x, k) => [x.name, `mach.m${k}.powerKw`, [C.a, C.b, C.c][k % 3]]),
    },
    { title: 'Parts today', unit: '', lines: [['parts', 'mach.parts', C.c]] },
  ],
})

const ZonePopup = ({ index, live, onClose }) => {
  // "now" when the popup opened - the curves run to it (a render stays pure)
  const [now] = useState(() => Date.now())
  const z =
    index === 0 && live.machining
      ? liveBlanks(live.machining.m)
      : index === 1 && live.machining
        ? liveCnc(live.machining.m)
        : index === 2 && live.line
          ? liveLine(live.line.m)
          : index === 3 && live.oven
            ? liveOven(live.oven.m)
            : index === 4 && live.qc
              ? liveQc(live.qc.m)
              : index === 5 && live.utilities
                ? liveUtilities(live.utilities.m)
                : ZONES[index]
  const source = [live.machining, live.machining, live.line, live.oven, live.qc, live.utilities][
    index
  ]
  const keys = z?.live ? z.charts.flatMap((c) => c.lines.map((l) => l[1])) : []
  const series = useLineSeries(z?.live ? source?.process.id : null, keys, now)
  if (!z) return null
  return (
    <UnitPopup
      title={z.live ? tr(z.title) : `${tr(z.title)} - ${tr('a mockup')}`}
      picture={zonePicture(z.key) ? null : <ZonePicture index={index} />}
      charts={
        <div className="d-grid gap-3">
          {z.charts.map((c) => (
            <MockChart
              key={c.title}
              title={tr(c.title)}
              unit={c.unit}
              now={now}
              lines={c.lines.map(([label, key, color, dashed]) => ({
                label: tr(label),
                color,
                dashed,
                points: z.live ? (series[key] ?? []) : daySeries(now, SERIES[key]),
              }))}
            />
          ))}
        </div>
      }
      onClose={onClose}
    >
      <div className={WIDE_ZONES.has(z.key) ? undefined : 'ms-zone-split'}>
        <style>{SPLIT_CSS}</style>
        <ZoneScene
          zone={z.key}
          title={z.title}
          labels={Object.fromEntries(
            Object.entries(z.labels ?? {}).map(([k, v]) => [k, typeof v === 'string' ? tr(v) : v]),
          )}
        />
        <div>
          <Stats items={z.stats} />
          {z.table?.rows.length > 0 && <Table head={z.table.head} rows={z.table.rows} />}
        </div>
      </div>
    </UnitPopup>
  )
}

export default ZonePopup
