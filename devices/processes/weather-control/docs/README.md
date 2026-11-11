# Weather Control (process kind)

CORE Library process kind, loaded automatically in every project
(orchestrator `devices/processes/*/process.ts`, api `.../api.ts`, UI
`.../ui/register.js` -
AGENTS.md section 82). The software side of the outdoor weather station
(`devices/nodes/weather-node/`). Public: the Aquarium, Energy Field and
Heating packages depend on it; a project owns only its instance - the node,
its devices and one process (e.g. the aquarium's
`migrations/002_seed_weather_node.sql`).

## What it does

Every tick:

1. reads the node's raw readings in one batch request;
2. classifies the raw `light` value against the process's zones into one of
   the six `light-level` values (dark, dusk, overcast, medium, sunny, very
   sunny) and writes it into the `light-level` Device - only when it
   changes;
3. touches the node's liveness when its Heartbeat counter actually changes.

4. a simulated node (Nodes -> Simulated) with a forecast location follows
   the forecast every `simulation.intervalSeconds` (default 300): the
   forecast interpolated to now -> temperature, humidity, pressure, wind
   speed, rain (wetness 40 % + 30 % per mm/h, up to 100 %) and the raw
   light (solar radiation, 1000 W/m2 = 4095) - classified then like a real
   reading.

No thresholds of its own - consumers of its Devices decide what a reading
means for them.

## The forecast (api.ts)

- Open-Meteo (free, no key; `.env` `OPEN_METEO_URL`) for
  `config.forecast` - `latitude`, `longitude`, `place`, `refreshMinutes`
  (default 60), `days` (default 3; plus the past day). Hourly: temperature,
  humidity, pressure (MSL), cloud cover, precipitation, weather code,
  shortwave radiation, wind speed / direction / gusts (m/s), day / night;
  daily: sunrise / sunset, min / max temperature, precipitation, radiation,
  max wind.
- Fetched by the API every `refreshMinutes` (a scan each minute); the last
  good forecast is stored (`weather_forecasts`, core migration 078) and
  kept when a later fetch fails - the error is stored next to it, the next
  try after 15 minutes. A changed location is fetched at once.
- `GET /weather-control/:processId/forecast` - the stored forecast
  (`hourly` / `daily` rows `{ t: ms, ... }`, `fetchedAt`, `error`,
  `attribution`); `POST .../forecast/refresh` - fetch now
  (`processes.control`). Scoped to the process like every
  `/<kind>/:processId/...` package route.
- `GET /weather-control/:processId/history?days=N` (1-31) - the past days
  plus the next two from Open-Meteo's `past_days` (the model's past, not
  measurements) for the widgets' popups; nothing stored, reused 30 min in
  memory (an older one served when a fetch fails, else 502).
- AI Assistant tool `weather.forecast` (the next hours and the days).
- Open-Meteo's data is CC BY 4.0 - the attribution is shown with it.

## Config (`processes.config`)

| Field | Required | Meaning |
|---|---|---|
| `nodeId` | yes | the weather-node instance |
| `heartbeatDeviceId` | yes | its Heartbeat Device |
| `lightDeviceId` | yes | raw light Device (0-4095) |
| `lightLevelDeviceId` | yes | the computed `light-level` Device |
| `zones` | yes | `[{ key, color, min? }]`, darkest first - edited in Settings -> Zones |
| `temperatureDeviceId`, `humidityDeviceId`, `pressureDeviceId` | no | shown by the panel; a non-numeric reading logs a warning |
| `windSpeedDeviceId`, `rainDeviceId` | no | wind speed (m/s), rain (wetness %) - shown, followed in simulation |
| `forecast` | no | `{ latitude, longitude, place?, refreshMinutes?, days? }` - no location, no forecast |
| `scene` | no | the Dashboard scene's thresholds - the warnings, the PV's sun day, the heating's base (UI) |
| `simulation` | no | `{ followForecast (default true), intervalSeconds (default 300) }` |

The config schema is registered (api.ts) - config edits are checked.

## UI

- Process panel: the readings, the current light level and - with a
  location - the forecast (the next 12 hours, the days, Refresh).
- Settings -> Configuration: the zone boundaries against the live raw
  value, the forecast's location and refresh, the simulation.
- Dashboard component `weatherControl.panel` ("Weather") - the user's scene
  (`ui/WeatherScene.jsx`, 2026-10-30; the process row keeps the engineer's
  panel), a page to scroll (its cards open on the visible width):
  - the next 24 hours' warnings, only when there are any - frost, a storm's
    gusts (the turbines may stop), heavy rain, heat;
  - now: the sky, the station's temperature big, the weather in words (the
    WMO code), as it feels (Steadman's apparent temperature), today's low /
    high; the sun's day - its arc from the rise to the set with the sun now,
    the daylight, the day's sun in kWh/m2;
  - the tiles: the wind (the anemometer, Beaufort, the gusts, the compass -
    where it blows from), the humidity and the dew point, the pressure and
    its 3 hours' tendency (rising / falling / steady at 1 hPa), the rain (the
    next 6 hours, when it starts, the station's wetness), the clouds, the
    light level;
  - the scenes' widgets (temperature, sun, wind - their curves and detailed
    charts);
  - the next 24 hours hour by hour (the sky or the rain, °C, the rain's bar,
    the wind's arrow and speed); the days - the low / high bar on the days'
    common range, the rain, the strongest wind, the sun for the PV (good /
    fair / poor) and the heating's degree-days.
  The station's readings first, the forecast's hour where there is none.
  The figures - `ui/weatherMath.js` (tested, `weatherMath.test.ts`); config
  `scene` - the thresholds (`frostC` 0, `stormGustMs` 17.2, `heavyRainMmH`
  4, `heatC` 30, `sunGoodKwhM2` 4, `sunFairKwhM2` 2, `heatingBaseC` 18) -
  Settings -> "The scene (Dashboard)".
  Its avatars: "summary" (the figures) and "picture" (sun, cloud, rain,
  temperature).
- The weather widgets for other packages' scenes (`ui/WeatherWidgets.jsx`):
  `SunWidget`, `WindWidget` (the Energy Field), `TemperatureWidget` (the
  Heating) - the picture (`SkyIcon`, `AnemometerIcon`), one line of the main
  figures, the last day and the next as a curve with "now" in the middle; a
  click opens the detailed charts (two days / a week / a month).

## The card picture (2026-10-25)

`ui/WeatherSummaryAvatar.jsx` (avatar "summary", the default): the sky and the
temperature (the one in 3 hours), the wind and its gusts, the sun's radiation
and the clouds, the humidity, the rain this hour, today's low / high - the
forecast's hour now; the static picture ("picture") stays to choose.
