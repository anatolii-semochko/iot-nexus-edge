import React, { useEffect, useRef, useState } from 'react'
import { CButton } from '@coreui/react'
import { api } from 'src/api/client'

// A small map around one point (a node's information popup, AGENTS_TO_DO.md
// 2026-10-20 X1): the slippy-map tiles (256 px, Web Mercator) laid out
// around the point, a pin at the centre, zoom in / out. The tiles come
// through the API's proxy (routes/map.ts - the browser never calls the tile
// server); the tile server's attribution is shown under the map. No map
// library - one point needs none.

const TILE = 256
const MIN_ZOOM = 3
const MAX_ZOOM = 18

/** The point's position in tile units at zoom `z`. */
const tileOf = (lat, lon, z) => {
  const n = 2 ** z
  const rad = (lat * Math.PI) / 180
  return {
    x: ((lon + 180) / 360) * n,
    y: ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n,
  }
}

const TileMap = ({ latitude, longitude, zoom: initialZoom = 15, height = 300, label }) => {
  const box = useRef(null)
  const [width, setWidth] = useState(480)
  const [zoom, setZoom] = useState(initialZoom)
  const [attribution, setAttribution] = useState(null)
  useEffect(() => {
    const el = box.current
    if (!el) return undefined
    const ro = new ResizeObserver(([entry]) =>
      setWidth(Math.max(120, Math.round(entry.contentRect.width))),
    )
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  useEffect(() => {
    api
      .getMapAttribution()
      .then((a) => setAttribution(a.attribution))
      .catch(() => {})
  }, [])

  const n = 2 ** zoom
  const p = tileOf(latitude, longitude, zoom)
  // the screen origin (top-left) in tile units
  const ox = p.x - width / 2 / TILE
  const oy = p.y - height / 2 / TILE
  const tiles = []
  for (let ty = Math.floor(oy); ty < oy + height / TILE; ty++) {
    if (ty < 0 || ty >= n) continue
    for (let tx = Math.floor(ox); tx < ox + width / TILE; tx++) {
      const wrapped = ((tx % n) + n) % n
      tiles.push(
        <img
          key={`${tx}/${ty}`}
          src={api.mapTileUrl(zoom, wrapped, ty)}
          alt=""
          width={TILE}
          height={TILE}
          draggable={false}
          style={{
            position: 'absolute',
            left: Math.round((tx - ox) * TILE),
            top: Math.round((ty - oy) * TILE),
          }}
        />,
      )
    }
  }
  const coords = `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`
  return (
    <div>
      <div
        ref={box}
        role="img"
        aria-label={`Map: ${label ?? 'the unit'} at ${coords}`}
        title={`${label ?? 'The unit'} at ${coords}`}
        style={{
          position: 'relative',
          height,
          overflow: 'hidden',
          borderRadius: 8,
          background: '#e5e3df',
        }}
      >
        {tiles}
        <svg
          width="28"
          height="40"
          viewBox="0 0 28 40"
          aria-hidden="true"
          style={{ position: 'absolute', left: width / 2 - 14, top: height / 2 - 38 }}
        >
          <path
            d="M14 39 C14 39 2 22 2 14 a12 12 0 0 1 24 0 C26 22 14 39 14 39 Z"
            fill="#d93b3b"
            stroke="#7a1414"
            strokeWidth="1.5"
          />
          <circle cx="14" cy="14" r="5" fill="#fff" />
        </svg>
        <div
          style={{
            position: 'absolute',
            right: 8,
            top: 8,
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          <CButton
            size="sm"
            color="light"
            disabled={zoom >= MAX_ZOOM}
            onClick={() => setZoom((z) => Math.min(MAX_ZOOM, z + 1))}
            aria-label="Zoom in"
            title="Zoom in"
          >
            +
          </CButton>
          <CButton
            size="sm"
            color="light"
            disabled={zoom <= MIN_ZOOM}
            onClick={() => setZoom((z) => Math.max(MIN_ZOOM, z - 1))}
            aria-label="Zoom out"
            title="Zoom out"
          >
            −
          </CButton>
        </div>
      </div>
      <div className="d-flex justify-content-between flex-wrap gap-2 small text-body-secondary mt-1">
        <span title="Latitude, longitude">{coords}</span>
        {attribution && <span>{attribution}</span>}
      </div>
    </div>
  )
}

export default TileMap
