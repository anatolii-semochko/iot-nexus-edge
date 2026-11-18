import React, { useState } from 'react'
import { packageT } from 'src/i18n'
import { NARROW_ONLY, WIDE_ONLY, cx } from 'src/components/table/narrow'
import picture from './factory-shop.webp'
import spots from './factory-shop.json'
import { MOCK } from './mockData'
import ZonePopup from './ZonePopup'
import { lineZone, ovenZone, qcZone, useShopProcesses } from './useLine'
// the package's words (its own locales/, then the core's)
const tr = packageT('metal-shop')

// The small metal shop's panel (iot AGENTS_TO_DO.md 2026-11-17/18 - step 1, a mockup on fixed figures):
// the whole shop as one cartoon 3D plan (images/dashboard/v2 `factory-shop`), each zone's card over its
// floor (the picture's hot spots - factory-shop.json, the zones' outlines in its shares), the shop's sums
// over it, the batches in work under it. A phone - the picture, then the zones' cards as a list.

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
.ms-line span:last-child { font-weight: 600; text-align: right }
.ms-list { display: none; gap: 8px; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)) }
.ms-list .ms-zone { position: static; transform: none; max-width: none }
@media (max-width: 991.98px) { .ms-plan .ms-zone { display: none } .ms-list { display: grid } }
.ms-batches { width: 100%; font-size: .85rem }
.ms-batches th { font-weight: 600; color: var(--cui-secondary-color); padding: 4px 8px 4px 0 }
.ms-batches td { padding: 4px 8px 4px 0; border-top: 1px solid var(--cui-border-color) }
.ms-bar { height: 6px; border-radius: 3px; background: var(--cui-secondary-bg); min-width: 80px }
.ms-bar > div { height: 100%; border-radius: 3px; background: var(--cui-primary) }
`

/** A zone's outline's middle, in the picture's shares. */
const middleOf = (poly) => {
  const xs = poly.map((p) => p[0])
  const ys = poly.map((p) => p[1])
  return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2]
}

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
  // the anodizing line - live once its process runs (step 3), the other zones still the mockup's
  const live = useShopProcesses()
  const liveZone = {
    line: live.line && lineZone(live.line.m, tr),
    oven: live.oven && ovenZone(live.oven.m, tr),
    qc: live.qc && qcZone(live.qc.m, tr),
  }
  const data = { ...MOCK, zones: MOCK.zones.map((z) => liveZone[z.key] ?? z) }
  const s = data.summary
  return (
    <div className="ms-scene">
      <style>{CSS}</style>
      <div className="ms-sums">
        <span className="ms-sum">
          <b>{s.powerKw.toFixed(1)}</b>
          <span>{tr('kW the shop now')}</span>
        </span>
        <span className="ms-sum">
          <b>{s.todayEur.toFixed(2)}</b>
          <span>{tr('€ energy today')}</span>
        </span>
        <span className="ms-sum">
          <b>{s.batches}</b>
          <span>{tr('batches in work')}</span>
        </span>
        <span className="ms-sum">
          <b>{s.oee}</b>
          <span>{tr('% OEE today')}</span>
        </span>
        <span className="small text-body-secondary ms-auto">{tr('A mockup - fixed figures')}</span>
      </div>
      <div className="ms-plan">
        <img
          src={picture}
          alt={tr(
            'The shop: the blanks, the CNC machines, the anodizing line, the oven, QC, the utilities',
          )}
        />
        {data.zones.map((z, i) => {
          const room = spots.rooms[i]
          if (!room) return null
          const [x, y] = middleOf(room.poly)
          return (
            <ZoneCard
              onOpen={() => setOpen(i)}
              key={z.key}
              zone={z}
              title={ZONE_TITLES[i]}
              style={{ left: `${x * 100}%`, top: `${y * 100}%` }}
            />
          )
        })}
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
                    {b.part} x {b.qty}
                  </div>
                </td>
                <td className={WIDE_ONLY}>{b.part}</td>
                <td className={WIDE_ONLY}>{b.qty}</td>
                <td>{tr(b.stage)}</td>
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
