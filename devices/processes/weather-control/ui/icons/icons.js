// The weather's 3D icons (iot images/weather-icons: make_weather_icons.py, build_icons.sh - generated).
// Each: its file and its proportions (width / height).
import sun from './sun.webp'
import dusk from './dusk.webp'
import partly from './partly.webp'
import cloud from './cloud.webp'
import night from './night.webp'
import drop from './drop.webp'
import rain from './rain.webp'
import rainDry from './rain-dry.webp'
import thermometer from './thermometer.webp'

export const WX_ICONS = {
  'sun': { src: sun, aspect: 1.0083 },
  'dusk': { src: dusk, aspect: 1.0083 },
  'partly': { src: partly, aspect: 1.125 },
  'cloud': { src: cloud, aspect: 2.2515 },
  'night': { src: night, aspect: 1.2125 },
  'drop': { src: drop, aspect: 0.5958 },
  'rain': { src: rain, aspect: 1.25 },
  'rain-dry': { src: rainDry, aspect: 1.25 },
  'thermometer': { src: thermometer, aspect: 0.3542 },
}
