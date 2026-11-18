import React from 'react'
import { packageT } from 'src/i18n'
// the package's words (its own locales/, then the core's)
const tr = packageT('metal-shop')

// A zone's own picture across its popup's width (2026-11-18, the user: a child object's picture is
// stretched to the popup's width - not the plan's piece in its original size): the zone rendered alone in
// the plan's frontal style (factory-<zone>.webp), `labels` - the live figures over its machines, keyed by
// the render's hot spots (factory-<zone>.json `items` - `bath:<name>`, `cnc1`, `oven`...).

const PICTURES = import.meta.glob('./factory-*.webp', { eager: true, import: 'default' })
const SPOTS = import.meta.glob('./factory-*.json', { eager: true, import: 'default' })

/** The zone's picture and hot spots (null - not rendered yet). */
export const zonePicture = (zone) => {
  const src = PICTURES[`./factory-${zone}.webp`]
  return src ? { src, spots: SPOTS[`./factory-${zone}.json`] ?? {} } : null
}

const CSS = `
.ms-zone-scene { position: relative; margin-bottom: 12px }
.ms-zone-scene > img { width: 100%; height: auto; display: block }
.ms-tag { position: absolute; transform: translate(-50%, -100%); text-align: center; white-space: nowrap;
  background: color-mix(in srgb, var(--cui-body-bg) 90%, transparent); border: 1px solid var(--cui-border-color);
  border-radius: 6px; padding: 1px 6px; font-size: .8rem; line-height: 1.25; box-shadow: 0 1px 4px rgba(0,0,0,.12) }
.ms-tag b { font-weight: 700 }
.ms-tag .ms-tag-sub { color: var(--cui-primary); font-weight: 600 }
@media (max-width: 575.98px) { .ms-tag { font-size: .62rem; padding: 0 3px } }
`

/** A hot spot's top middle, in the picture's shares. */
const topOf = (poly) => {
  const xs = poly.map((p) => p[0])
  return [(Math.min(...xs) + Math.max(...xs)) / 2, Math.min(...poly.map((p) => p[1]))]
}

const ZoneScene = ({ zone, title, labels = {} }) => {
  const pic = zonePicture(zone)
  if (!pic) return null
  const places = new Map((pic.spots.items ?? []).map((it) => [it.kind, topOf(it.poly)]))
  return (
    <div className="ms-zone-scene">
      <style>{CSS}</style>
      <img src={pic.src} alt={tr(title)} />
      {Object.entries(labels).map(([kind, content]) => {
        const at = places.get(kind)
        if (!at || !content) return null
        return (
          <div
            key={kind}
            className="ms-tag"
            // a machine reaching the picture's top (the CNC towers) - its label kept inside the picture
            style={{ left: `${at[0] * 100}%`, top: `${Math.max(at[1], 0.1) * 100}%` }}
          >
            {content}
          </div>
        )
      })}
    </div>
  )
}

export default ZoneScene
