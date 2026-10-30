// The weather scene's figures (2026-10-30) - pure, the meteorology's standard formulas and scales.

/** WMO weather interpretation codes (Open-Meteo's `weather_code`) -> words. */
const WMO = [
  [[0], 'Clear sky'],
  [[1], 'Mainly clear'],
  [[2], 'Partly cloudy'],
  [[3], 'Overcast'],
  [[45, 48], 'Fog'],
  [[51, 53, 55], 'Drizzle'],
  [[56, 57], 'Freezing drizzle'],
  [[61, 63, 65], 'Rain'],
  [[66, 67], 'Freezing rain'],
  [[71, 73, 75, 77], 'Snow'],
  [[80, 81, 82], 'Rain showers'],
  [[85, 86], 'Snow showers'],
  [[95], 'Thunderstorm'],
  [[96, 99], 'Thunderstorm with hail'],
]
export const weatherText = (code) =>
  code == null ? null : (WMO.find(([codes]) => codes.includes(code))?.[1] ?? null)
/** Rain, drizzle, showers, thunder - the codes with water falling (snow too). */
export const wetCode = (code) => code != null && code >= 51

/** The water vapour's pressure, hPa (Magnus over water). */
const vapourHpa = (tC, rhPct) => (rhPct / 100) * 6.105 * Math.exp((17.27 * tC) / (237.7 + tC))

/**
 * The apparent temperature, °C (Steadman 1994, the Australian Bureau of Meteorology's - shade, no
 * sun): the air's temperature with the humidity's and the wind's effect.
 */
export const apparentC = (tC, rhPct, windMs) =>
  tC == null || rhPct == null ? null : tC + 0.33 * vapourHpa(tC, rhPct) - 0.7 * (windMs ?? 0) - 4.0

/** The dew point, °C (Magnus, Sonntag's constants). */
export const dewPointC = (tC, rhPct) => {
  if (tC == null || !rhPct) return null
  const a = 17.62
  const b = 243.12
  const g = Math.log(rhPct / 100) + (a * tC) / (b + tC)
  return (b * g) / (a - g)
}

/** The Beaufort scale - the upper limit of each force, m/s (10 m above the ground). */
const BEAUFORT = [
  [0.5, 'Calm'],
  [1.6, 'Light air'],
  [3.4, 'Light breeze'],
  [5.5, 'Gentle breeze'],
  [8.0, 'Moderate breeze'],
  [10.8, 'Fresh breeze'],
  [13.9, 'Strong breeze'],
  [17.2, 'Near gale'],
  [20.8, 'Gale'],
  [24.5, 'Strong gale'],
  [28.5, 'Storm'],
  [32.7, 'Violent storm'],
  [Infinity, 'Hurricane force'],
]
export const beaufortOf = (ms) => {
  if (ms == null) return null
  const force = BEAUFORT.findIndex(([limit]) => ms < limit)
  return { force, name: BEAUFORT[force][1] }
}

const POINTS = [
  'N',
  'NNE',
  'NE',
  'ENE',
  'E',
  'ESE',
  'SE',
  'SSE',
  'S',
  'SSW',
  'SW',
  'WSW',
  'W',
  'WNW',
  'NW',
  'NNW',
]
/** The wind's direction (where it blows from) - one of the 16 compass points. */
export const compassOf = (deg) =>
  deg == null ? null : POINTS[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16]

// the barometric tendency: a change over 3 hours under this - steady
const STEADY_HPA_3H = 1
/** The pressure's change over the last 3 hours: { deltaHpa, word } - rising / falling / steady. */
export const pressureTrend = (hourly, now) => {
  const at = (t) => {
    const rows = hourly.filter((h) => h.pressureHpa != null && h.t <= t)
    return rows.length ? rows[rows.length - 1].pressureHpa : null
  }
  const p = at(now)
  const before = at(now - 3 * 3_600_000)
  if (p == null || before == null) return null
  const deltaHpa = p - before
  return {
    deltaHpa,
    word: Math.abs(deltaHpa) < STEADY_HPA_3H ? 'steady' : deltaHpa > 0 ? 'rising' : 'falling',
  }
}

/** A day's radiation, MJ/m2 -> kWh/m2 (the PV's yardstick). */
export const kwhM2 = (mj) => (mj == null ? null : mj / 3.6)

/** A day's heating degree-days over its forecast hours: the mean shortfall under `baseC`. */
export const degreeDays = (hours, baseC) => {
  const temps = hours.map((h) => h.temperatureC).filter((v) => v != null)
  return temps.length ? temps.reduce((a, t) => a + Math.max(0, baseC - t), 0) / temps.length : null
}

/** The local day (midnight, ms) a time falls in. */
export const dayOf = (t) => {
  const d = new Date(t)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}
