import React from 'react'

// The sky picture of the weather packages (moved from energy-field's icons,
// 2026-10-20 - heating-control shows it too). Colours are CSS variables a
// scene may set (--wx-sun, --wx-cloud, --wx-cloud-edge, --wx-moon), with
// light-theme defaults.

/** The sky by the light and the clouds: sun / partly (sun and cloud) / cloud / dusk / night. */
export const skyOf = ({ radiation = 0, cloudPct = 0, isDay = true }) =>
  !isDay
    ? 'night'
    : radiation < 40
      ? 'dusk'
      : cloudPct > 75
        ? 'cloud'
        : cloudPct > 30
          ? 'partly'
          : 'sun'

// each picture cropped to its own drawing (the user, 2026-10-24 - no margins, so it stretches
// evenly in a widget): x, y, width, height in the 96 x 80 drawing's units (measured - rendered
// and trimmed, the strokes included)
const SKY_BOXES = {
  sun: [8.5, 4.5, 59.1, 59.1],
  dusk: [8.5, 4.5, 59.1, 59.1],
  partly: [8.5, 4.5, 83, 62.6],
  cloud: [6.1, 23.9, 66.2, 41.2],
  night: [21.6, 14, 42.5, 43.8],
}

/** A sky picture's width / height. */
export const skyAspect = (props) => {
  const [, , w, h] = SKY_BOXES[skyOf(props)]
  return w / h
}

/**
 * The sky picture, cropped to its drawing: `height` - its height (the width by its own
 * proportions), or `size` - its width.
 */
export const SkyIcon = ({ radiation = 0, cloudPct = 0, isDay = true, size = 96, height }) => {
  const sky = skyOf({ radiation, cloudPct, isDay })
  const box = SKY_BOXES[sky]
  const h = height ?? (size * box[3]) / box[2]
  const sun = sky === 'sun' || sky === 'partly' || sky === 'dusk'
  return (
    <svg
      width={(h * box[2]) / box[3]}
      height={h}
      viewBox={box.join(' ')}
      role="img"
      aria-label={`Sky: ${sky}`}
    >
      {sky === 'night' && (
        <path d="M40 14 a22 22 0 1 0 24 30 a18 18 0 0 1 -24 -30 Z" fill="var(--wx-moon, #8fb4e0)" />
      )}
      {sun && (
        <g opacity={sky === 'dusk' ? 0.45 : 1}>
          <circle cx="38" cy="34" r="16" fill="var(--wx-sun, #f6b73c)" />
          <g stroke="var(--wx-sun, #f6b73c)" strokeWidth="3" strokeLinecap="round">
            <line x1="38" y1="6" x2="38" y2="12" />
            <line x1="38" y1="56" x2="38" y2="62" />
            <line x1="10" y1="34" x2="16" y2="34" />
            <line x1="60" y1="34" x2="66" y2="34" />
            <line x1="18" y1="14" x2="22" y2="18" />
            <line x1="54" y1="50" x2="58" y2="54" />
            <line x1="58" y1="14" x2="54" y2="18" />
            <line x1="22" y1="50" x2="18" y2="54" />
          </g>
        </g>
      )}
      {(sky === 'partly' || sky === 'cloud') && (
        <path
          d={
            sky === 'cloud'
              ? 'M16 64 a14 14 0 0 1 6 -27 a20 20 0 0 1 38 4 a12 12 0 0 1 4 23 Z'
              : 'M54 66 a10 10 0 0 1 4 -19 a14 14 0 0 1 26 4 a8 8 0 0 1 2 15 Z'
          }
          fill="var(--wx-cloud, #e9eef3)"
          stroke="var(--wx-cloud-edge, #9aa8b6)"
          strokeWidth="2"
        />
      )}
    </svg>
  )
}

export default SkyIcon
