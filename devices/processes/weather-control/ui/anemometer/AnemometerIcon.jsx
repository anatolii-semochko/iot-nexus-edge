import React from 'react'
import sprite from './anemometer-sprite.webp'
import { packageT } from 'src/i18n'
// the package's words (its own locales/, then the core's)
const t = packageT('weather-control')

// A cup anemometer turning with the wind (the user's images/Anemometer_Animation_grey.gif -
// README.md here): 24 frames of one third of a turn side by side in one strip, shown in turn
// by a CSS animation (no timers) - the speed from the wind, still when calm. The picture is
// cropped to the cups' highest and lowest points over the turn, 20 % lower; drawn at twice the
// size it is usually shown (a frame 270 x 186) - sharp up to a widget's full height.

const FRAMES = 24
// a frame's proportions (the strip's own pixels)
const FRAME_W = 270
const FRAME_H = 186
// how fast it turns on the screen: degrees per second per m/s (a turn in 2 s at 3 m/s), and
// one third of a turn at the quickest in this many seconds
const DEG_PER_S_PER_MS = 60
const MIN_THIRD_S = 1 / 3
const MIN_WIND_MS = 0.3

// the strip moves by a transform inside a clipping frame - an animated background position repainted
// the whole page on every step (a trace, 2026-11-09: the dashboards blinked on a phone while scrolling);
// a transform stays on the compositor, the steps too
const KEYFRAMES = `@keyframes ne-anemometer-turn {
  from { transform: translateX(0) }
  to { transform: translateX(calc(var(--ne-anem-strip) * -1)) }
}`

const AnemometerIcon = ({ windMs = 0, size = FRAME_H / 2, title }) => {
  const w = (size * FRAME_W) / FRAME_H
  const third =
    windMs >= MIN_WIND_MS ? Math.max(MIN_THIRD_S, 120 / (DEG_PER_S_PER_MS * windMs)) : null
  return (
    <>
      <style>{KEYFRAMES}</style>
      <div
        role="img"
        aria-label={title ?? t('Anemometer - {{toFixed}} m/s', { toFixed: windMs.toFixed(1) })}
        style={{ width: w, height: size, flex: 'none', overflow: 'hidden', position: 'relative' }}
      >
        <div
          style={{
            '--ne-anem-strip': `${w * FRAMES}px`,
            width: w * FRAMES,
            height: size,
            backgroundImage: `url(${sprite})`,
            backgroundRepeat: 'no-repeat',
            backgroundSize: `${w * FRAMES}px ${size}px`,
            willChange: third ? 'transform' : undefined,
            animation: third
              ? `ne-anemometer-turn ${third.toFixed(3)}s steps(${FRAMES}) infinite`
              : 'none',
          }}
        />
      </div>
    </>
  )
}

export default AnemometerIcon
