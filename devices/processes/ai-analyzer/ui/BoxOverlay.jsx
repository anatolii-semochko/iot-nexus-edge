import React from 'react'

// Red boxes around found Target objects (AGENTS.md section 82), drawn over
// the image in its own normalized 0..1 space - the stored image is never
// modified. Meant for FilePreviewModal's `overlay` slot or any absolutely
// positioned box over an <img>.
const BoxOverlay = ({ found }) => (
  <svg
    viewBox="0 0 1 1"
    preserveAspectRatio="none"
    width="100%"
    height="100%"
    style={{ display: 'block' }}
  >
    {(found ?? []).map((f, index) => (
      <rect
        key={index}
        x={f.box.x}
        y={f.box.y}
        width={f.box.w}
        height={f.box.h}
        fill="none"
        stroke="#e55353"
        strokeWidth="3"
        vectorEffect="non-scaling-stroke"
      >
        <title>{f.name}</title>
      </rect>
    ))}
  </svg>
)

export default BoxOverlay
