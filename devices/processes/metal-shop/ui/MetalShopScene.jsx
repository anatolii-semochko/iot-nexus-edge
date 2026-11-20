import React, { useState } from 'react'
import { packageT } from 'src/i18n'
import { NARROW_ONLY, WIDE_ONLY, cx } from 'src/components/table/narrow'
import picture from './factory-shop.webp'
import spots from './factory-shop.json'
import { MOCK } from './mockData'
import LineHoist from './LineHoist'
import BathFronts from './BathFronts'
import CncMachines from './CncMachines'
import BandSaw from './BandSaw'
import ZonePopup from './ZonePopup'
import ZoneGauge, { GAUGE_CSS } from './ZoneGauge'
import UnitLights, { LIGHTS_CSS, ovenLight, utilityLights } from './UnitLights'
import {
  blanksZone,
  cncZone,
  lineZone,
  ovenZone,
  qcZone,
  useShopProcesses,
  utilitiesZone,
  chemZone,
} from './useLine'
// the package's words (its own locales/, then the core's)
const tr = packageT('metal-shop')

// The small metal shop's panel (iot AGENTS_TO_DO.md 2026-11-17/18 - step 1, a mockup on fixed figures):
// the whole shop as one cartoon 3D plan (images/dashboard/v2 `factory-shop`), the shop's sums over it, the
// zones' cards and the batches in work under it. On the plan (2026-11-20 - the user: the cards over the plan
// never fitted every width): each zone's outline (the picture's hot spots - factory-shop.json) lights up under the
// pointer and opens the zone's window, like the Dashboard's map; each zone's main figures - gauges between its
// machines (ZoneGauge, GAUGE_AT); the rest - the zone's card under the plan (a link to the window too).

const STATE_COLORS = {
  run: 'var(--cui-success)',
  warn: 'var(--cui-warning)',
  stop: 'var(--cui-danger)',
}
const STATE_LABELS = { run: 'running', warn: 'attention', stop: 'stopped' }
const ZONE_TITLES = [
  'Blanks and saw',
  'CNC machining',
  'Anodizing line',
  'Drying oven',
  'QC and packing',
  'Utilities',
  'Chemistry and wastewater',
]

const CSS = `
.ms-scene { display: flex; flex-direction: column; gap: 12px }
.ms-sums { display: flex; flex-wrap: wrap; gap: 6px 22px; align-items: baseline }
.ms-sum b { font-size: 1.35rem; font-weight: 700 }
.ms-sum span { color: var(--cui-secondary-color); margin-left: 4px }
.ms-plan { position: relative }
.ms-plan > img { width: 100%; height: auto; display: block }
.ms-zone { text-align: left; color: inherit; cursor: pointer; position: absolute; transform: translate(-50%, -50%); min-width: 175px; max-width: 240px;
  background: color-mix(in srgb, var(--cui-body-bg) 45%, transparent); border: 1px solid var(--cui-border-color);
  border-radius: 8px; padding: 4px 8px; font-size: .78rem; line-height: 1.25; box-shadow: 0 2px 6px rgba(0,0,0,.12) }
.ms-zone:hover { border-color: var(--cui-primary) }
.ms-zone-head { display: flex; align-items: center; gap: 6px; font-weight: 600; font-size: .82rem }
.ms-dot { width: 9px; height: 9px; border-radius: 50%; flex: 0 0 auto }
.ms-line { display: flex; justify-content: space-between; gap: 8px }
.ms-line span:first-child { color: var(--cui-secondary-color) }
.ms-line span:first-child { min-width: 0 }
.ms-line span:last-child { font-weight: 600; text-align: right; white-space: nowrap }
.ms-list { display: grid; gap: 8px; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)) }
.ms-list .ms-zone { position: static; transform: none; max-width: none }
.ms-rooms { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; z-index: 3 }
.ms-room { cursor: pointer; pointer-events: all; fill: var(--cui-primary); fill-opacity: 0; stroke: var(--cui-primary);
  stroke-opacity: 0; stroke-width: 2.5; vector-effect: non-scaling-stroke; stroke-linejoin: round }
.ms-room:hover, .ms-room:focus-visible { fill-opacity: .1; stroke-opacity: .95; outline: none }
.ms-gauges { position: absolute; inset: 0; pointer-events: none; z-index: 4 }
.ms-tip { position: absolute; transform: translate(-50%, calc(-100% - 6px)); z-index: 5; pointer-events: none; white-space: nowrap;
  display: flex; align-items: center; gap: 6px; padding: 3px 10px; border-radius: 6px; font-size: .82rem; font-weight: 600;
  background: var(--cui-body-bg); border: 1px solid var(--cui-border-color); box-shadow: 0 2px 6px rgba(0,0,0,.15) }
.ms-batches { width: 100%; font-size: .85rem }
.ms-batches th { font-weight: 600; color: var(--cui-secondary-color); padding: 4px 8px 4px 0 }
.ms-batches td { padding: 4px 8px 4px 0; border-top: 1px solid var(--cui-border-color) }
.ms-bar { height: 6px; border-radius: 3px; background: var(--cui-secondary-bg); min-width: 80px }
.ms-bar > div { height: 100%; border-radius: 3px; background: var(--cui-primary) }
`

// each zone's gauges on the plan (the picture's shares, the gauges' order - useLine.js): over the zone's free floor,
// between its machines (2026-11-20)
const GAUGE_AT = {
  blanks: [[0.229, 0.3]], // right of the rack and the saw
  cnc: [[0.17, 0.85]], // in front of the machines
  line: [[0.532, 0.43]], // the walkway, in front of the anodize bath
  oven: [[0.67, 0.86]], // in front of the oven
  qc: [[0.93, 0.62]], // right of the QC table
  utilities: [
    [0.298, 0.86], // the compressor's
    [0.41, 0.86], // the chiller's
  ],
  chem: [
    [0.8, 0.45], // the concentrates - in front of the collection tank
    [0.88, 0.45], // the wastewater - in front of the settler
  ],
}
// a gauge's width - a share of the plan's (ZoneGauge clamps it)
const GAUGE_SIZE = 0.05

const ZoneCard = ({ zone, title, style, onOpen }) => (
  <button
    type="button"
    className="ms-zone"
    style={style}
    title={tr('{{title}} - the details, the charts', { title: tr(title) })}
    onClick={onOpen}
  >
    <div className="ms-zone-head">
      <span
        className="ms-dot"
        style={{ background: STATE_COLORS[zone.state] }}
        title={tr(STATE_LABELS[zone.state])}
      />
      {tr(title)}
    </div>
    {zone.lines.map(([label, value]) => (
      <div key={label} className="ms-line">
        <span>{tr(label)}</span>
        <span>{tr(value)}</span>
      </div>
    ))}
  </button>
)

const MetalShopScene = () => {
  // the zone whose popup is open (its index in the plan's zones), null - none
  const [open, setOpen] = useState(null)
  // the zone under the pointer (its index) - its name over its outline
  const [tip, setTip] = useState(null)
  // each zone live once its process runs (steps 3-7), the mockup's figures until then
  const live = useShopProcesses()
  const liveZone = {
    line: live.line && lineZone(live.line.m, tr, live.line.process.config),
    oven: live.oven && ovenZone(live.oven.m, tr, live.oven.process.config),
    qc: live.qc && qcZone(live.qc.m, tr),
    utilities: live.utilities && utilitiesZone(live.utilities.m, tr),
    chem: live.chem && chemZone(live.chem.m, tr),
    blanks: live.machining && blanksZone(live.machining.m, tr),
    cnc: live.machining && cncZone(live.machining.m, tr),
  }
  const shop = live.shop?.m
  // the sums and the bars in work - the summary process's (step 8), the mockup's until it runs
  const s = shop
    ? {
        powerKw: shop.powerKw,
        todayEur: shop.today.eur,
        todayKwh: shop.today.kwh,
        batches: shop.inWork,
        oee: shop.oeePct ?? '-',
        // the day's peak - the highest 15-minute average (the grid's billing peak)
        peakKw: shop.today.peakKw || null,
      }
    : MOCK.summary
  const batches = shop
    ? shop.flow.map((b) => ({
        id: b.id,
        part: b.part ?? '-',
        qty: b.qty,
        stage: b.stage,
        where: b.where,
        pct: b.pct,
        eta: new Date(b.readyAt).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        }),
      }))
    : MOCK.batches
  const data = { zones: MOCK.zones.map((z) => liveZone[z.key] ?? z), batches }
  return (
    <div className="ms-scene">
      <style>{CSS + GAUGE_CSS + LIGHTS_CSS}</style>
      <div className="ms-sums">
        <span className="ms-sum">
          <b>{s.powerKw.toFixed(1)}</b>
          <span>{tr('kW the shop now')}</span>
        </span>
        <span className="ms-sum">
          {/* no grid price yet - the kWh instead of the euros */}
          <b>{s.todayEur !== null ? s.todayEur.toFixed(2) : s.todayKwh.toFixed(1)}</b>
          <span>{tr(s.todayEur !== null ? '€ energy today' : 'kWh today')}</span>
        </span>
        {s.peakKw ? (
          <span className="ms-sum">
            <b>{s.peakKw.toFixed(0)}</b>
            <span>{tr("kW the day's peak (15 min)")}</span>
          </span>
        ) : null}
        <span className="ms-sum">
          <b>{s.batches}</b>
          <span>{tr('batches in work')}</span>
        </span>
        <span className="ms-sum">
          <b>{s.oee}</b>
          <span>{tr('% OEE today')}</span>
        </span>
        {!shop && (
          <span className="small text-body-secondary ms-auto">
            {tr('A mockup - fixed figures')}
          </span>
        )}
      </div>
      <div className="ms-plan">
        <img
          src={picture}
          alt={tr(
            'The shop: the blanks, the CNC machines, the anodizing line, the oven, QC, the utilities',
          )}
        />
        {live.line && (
          <BathFronts
            m={live.line.m}
            cfg={live.line.process.config}
            chem={live.chem?.m}
            view="shop"
          />
        )}
        {live.line && <LineHoist m={live.line.m} view="shop" />}
        {live.machining && <CncMachines m={live.machining.m} view="shop" />}
        {live.machining && <BandSaw m={live.machining.m} view="shop" />}
        <UnitLights
          spots={spots}
          states={{
            ...(live.utilities ? utilityLights(live.utilities.m) : {}),
            ...(live.oven ? ovenLight(live.oven.m, live.oven.process.config) : {}),
          }}
        />
        <svg className="ms-rooms" viewBox="0 0 1 1" preserveAspectRatio="none">
          {data.zones.map((z, i) => {
            const room = spots.rooms[i]
            if (!room) return null
            const title = tr(ZONE_TITLES[i])
            return (
              <polygon
                key={z.key}
                className="ms-room"
                points={room.poly.map((p) => p.join(',')).join(' ')}
                tabIndex={0}
                role="link"
                aria-label={title}
                onMouseEnter={() => setTip(i)}
                onMouseLeave={() => setTip((x) => (x === i ? null : x))}
                onFocus={() => setTip(i)}
                onBlur={() => setTip(null)}
                onClick={() => setOpen(i)}
                onKeyDown={(e) => e.key === 'Enter' && setOpen(i)}
              />
            )
          })}
        </svg>
        <div className="ms-gauges" aria-hidden="true">
          {data.zones.flatMap((z) =>
            (z.gauges ?? []).map((g, k) =>
              GAUGE_AT[z.key]?.[k] ? (
                <ZoneGauge key={`${z.key}${k}`} at={GAUGE_AT[z.key][k]} size={GAUGE_SIZE} g={g} />
              ) : null,
            ),
          )}
        </div>
        {tip !== null && spots.rooms[tip] && (
          <span
            className="ms-tip"
            style={{
              left: `${(Math.min(...spots.rooms[tip].poly.map((p) => p[0])) + Math.max(...spots.rooms[tip].poly.map((p) => p[0]))) * 50}%`,
              top: `${Math.min(...spots.rooms[tip].poly.map((p) => p[1])) * 100}%`,
            }}
          >
            <span className="ms-dot" style={{ background: STATE_COLORS[data.zones[tip].state] }} />
            {tr(ZONE_TITLES[tip])}
            <span className="fw-normal text-body-secondary">
              · {tr(STATE_LABELS[data.zones[tip].state])}
            </span>
          </span>
        )}
      </div>
      <div className="ms-list">
        {data.zones.map((z, i) => (
          <ZoneCard onOpen={() => setOpen(i)} key={z.key} zone={z} title={ZONE_TITLES[i]} />
        ))}
      </div>
      <section>
        <b>{tr('Batches in work')}</b>
        <table className="ms-batches">
          <thead>
            <tr>
              <th>{tr('Batch')}</th>
              <th className={WIDE_ONLY}>{tr('Part')}</th>
              <th className={WIDE_ONLY}>{tr('Qty')}</th>
              <th>{tr('Where')}</th>
              <th>{tr('Done')}</th>
              <th>{tr('Ready at')}</th>
            </tr>
          </thead>
          <tbody>
            {data.batches.map((b) => (
              <tr key={b.id}>
                <td className="fw-semibold">
                  {b.id}
                  {/* a phone: the part and the quantity under the batch - no columns of their own */}
                  <div className={cx(NARROW_ONLY, 'small fw-normal text-body-secondary')}>
                    {tr(b.part)} x {b.qty}
                  </div>
                </td>
                <td className={WIDE_ONLY}>{tr(b.part)}</td>
                <td className={WIDE_ONLY}>{b.qty}</td>
                <td>
                  {tr(b.stage)}
                  {b.where && <span className="text-body-secondary"> - {tr(b.where)}</span>}
                </td>
                <td>
                  <div className="ms-bar" title={`${b.pct} %`}>
                    <div style={{ width: `${b.pct}%` }} />
                  </div>
                </td>
                <td>{b.eta}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {open !== null && <ZonePopup index={open} live={live} onClose={() => setOpen(null)} />}
    </div>
  )
}

export default MetalShopScene
