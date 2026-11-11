/**
 * "weather-control" process kind - the software side of the outdoor
 * weather station (`weather-node`). A public CORE Library package
 * (devices/processes/weather-control/, AGENTS.md section 82; moved from
 * the aquarium project 2026-10-19 - the Aquarium, Energy Field and
 * Heating packages depend on it); a project owns only its instance (the
 * node, its devices and one process - e.g. the aquarium's
 * migrations/002_seed_weather_node.sql).
 *
 * The node's firmware never receives anything from NexusEdge (weather-node
 * docs/wiring.md). Each tick this process:
 *  - reads the raw light Device and classifies it against its own
 *    `config.zones` (the Zones settings section, ui/WeatherZonesSection.jsx)
 *    into one of the `light-level` enum values, written into the
 *    `light-level` Device (PUT /devices/:id/reading) only when the
 *    classification changes;
 *  - touches the node's liveness on an actual Heartbeat Device change (a
 *    same-value read is not "fresh": EdgeX's CAN transport caches the
 *    latest frame with no expiry);
 *  - a simulated node with a forecast location (`config.forecast`, api.ts
 *    fetches it) follows the forecast: every `simulation.intervalSeconds`
 *    its readings are set to the forecast interpolated to now -
 *    temperature, humidity, pressure, wind speed, rain (wetness from the
 *    precipitation) and the raw light (from the solar radiation, full scale
 *    LIGHT_FULL_SCALE_WM2) - which the light-level classification then
 *    reads like a real one. `simulation.followForecast: false` - off.
 *
 * No warning / error thresholds of its own - it measures and classifies;
 * policies belong to the consumers of its devices.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- a Library package is loaded at run time by the orchestrator and imports nothing from it
// A simulated node follows the forecast this often by default (a demo -
// rarely: the forecast itself is hourly).
const DEFAULT_FOLLOW_SECONDS = 300;
// The raw light Device's range (the node's 12-bit ADC) and the solar
// radiation that reads as its full scale - a clear midday sun.
const LIGHT_RAW_MAX = 4095;
const LIGHT_FULL_SCALE_WM2 = 1000;

export default function registerWeatherControl(register: any, { apiClient, logger }: any): void {
  // Last-seen Heartbeat counter value and last-published light-level per
  // process id - in-memory only, reset cleanly on restart.
  const lastHeartbeat = new Map<number, number>();
  const lastLightLevel = new Map<number, string>();

  // Which zone a raw value currently falls into - mirrors ui/lightLevels.js
  // classifyRawLight(), kept in sync by hand (the UI bundle and the
  // orchestrator share no module).
  const classify = (zones: { key: string; min?: number }[], value: number): string | undefined => {
    let current: string | undefined = zones[0]?.key;
    for (const zone of zones) {
      if (zone.min === undefined || value >= zone.min) current = zone.key;
    }
    return current;
  };

  // When a simulated node last followed the forecast, per process id.
  const lastFollowed = new Map<number, number>();

  // A forecast hour's values interpolated to `now` (rows: [{ t: ms, ...}]).
  const interpolate = (rows: Record<string, number | null>[], now: number): Record<string, number | null> | null => {
    const after = rows.findIndex((r) => (r.t as number) > now);
    if (after <= 0) return null; // the forecast doesn't cover now
    const a = rows[after - 1];
    const b = rows[after];
    const k = (now - (a.t as number)) / ((b.t as number) - (a.t as number));
    const out: Record<string, number | null> = {};
    for (const key of Object.keys(a)) {
      const x = a[key];
      const y = b[key];
      out[key] = x === null || y === null ? (x ?? y) : x + (y - x) * k;
    }
    return out;
  };

  async function followForecast(process: any, config: any): Promise<void> {
    const now = Date.now();
    const every = (config.simulation?.intervalSeconds ?? DEFAULT_FOLLOW_SECONDS) * 1000;
    if (now - (lastFollowed.get(process.id) ?? 0) < every) return;
    lastFollowed.set(process.id, now);
    const node = (await apiClient.listNodes()).find((n: { id: number }) => n.id === config.nodeId);
    if (!node?.simulated) return;
    let forecast: { hourly?: Record<string, number | null>[] };
    try {
      forecast = await apiClient.request(`/weather-control/${process.id}/forecast`);
    } catch (err) {
      logger.warn({ processId: process.id, err }, "weather-control: no forecast to follow");
      return;
    }
    const v = interpolate(forecast.hourly ?? [], now);
    if (!v) return;
    const round = (x: number | null, step: number) => (x === null ? null : Math.round(x / step) * step);
    const light = v.radiationWm2 === null ? null : Math.min(LIGHT_RAW_MAX, Math.round((Math.max(0, v.radiationWm2) / LIGHT_FULL_SCALE_WM2) * LIGHT_RAW_MAX));
    // a resistive plate: wet while it rains - the more rain, the wetter
    const rain = v.precipitationMm === null ? null : v.precipitationMm <= 0 ? 0 : Math.min(100, Math.round(40 + v.precipitationMm * 30));
    const values = [
      [config.temperatureDeviceId, round(v.temperatureC, 0.1)],
      [config.humidityDeviceId, round(v.humidityPct, 1)],
      [config.pressureDeviceId, round(v.pressureHpa, 0.1)],
      [config.lightDeviceId, light],
      [config.windSpeedDeviceId, round(v.windSpeedMs, 0.1)],
      [config.rainDeviceId, rain],
    ]
      .filter(([id, value]) => typeof id === "number" && value !== null)
      .map(([id, value]) => ({ id: id as number, value }));
    if (values.length) await apiClient.simulateDevices(values);
  }

  register("weather-control", async (process: any) => {
    const {
      nodeId,
      heartbeatDeviceId,
      temperatureDeviceId,
      humidityDeviceId,
      pressureDeviceId,
      lightDeviceId,
      lightLevelDeviceId,
      zones,
    } = process.config;

    if (
      nodeId === undefined ||
      heartbeatDeviceId === undefined ||
      lightDeviceId === undefined ||
      lightLevelDeviceId === undefined ||
      !Array.isArray(zones)
    ) {
      logger.warn(
        { processId: process.id },
        "weather-control process is missing nodeId/heartbeatDeviceId/lightDeviceId/lightLevelDeviceId/zones",
      );
      return;
    }

    if (process.config.forecast && process.config.simulation?.followForecast !== false) {
      await followForecast(process, process.config).catch((err) => logger.warn({ processId: process.id, err }, "weather-control: following the forecast failed"));
    }

    // The tick's readings in ONE batch request (were five GET
    // /devices/:id; AGENTS_TO_DO.md 2026-10-16, the Raspberry budget); an
    // older core without the batch route - one request each.
    const ids = [heartbeatDeviceId, temperatureDeviceId, humidityDeviceId, pressureDeviceId, lightDeviceId].filter((id): id is number => typeof id === "number");
    const read = new Map<number, unknown>();
    if (typeof apiClient.getDeviceValues === "function") {
      const { values } = await apiClient.getDeviceValues([...new Set(ids)]);
      for (const id of ids) if (values?.[id] && values[id].source !== "error") read.set(id, values[id].value);
    } else {
      await Promise.all(ids.map(async (id) => read.set(id, (await apiClient.getDevice(id)).value)));
    }

    // Heartbeat: touch the node's own liveness only on an actual change -
    // see file header for why a same-value read must not count as
    // "fresh" (EdgeX's CAN transport caches "latest frame" with no
    // expiry).
    const heartbeat = Number(read.get(heartbeatDeviceId));
    if (Number.isFinite(heartbeat)) {
      const previous = lastHeartbeat.get(process.id);
      lastHeartbeat.set(process.id, heartbeat);
      if (previous !== undefined && previous !== heartbeat) {
        await apiClient.touchNodeHeartbeats([nodeId]);
      }
    }

    // Fan out the remaining raw readings just to surface a warning if
    // one comes back non-numeric - nothing here computes anything from
    // temperature/humidity/pressure, ui/WeatherControlPanel.jsx reads those
    // Devices directly.
    if (temperatureDeviceId !== undefined && !Number.isFinite(Number(read.get(temperatureDeviceId)))) {
      logger.warn({ processId: process.id }, "weather-control: no valid Temperature reading");
    }
    if (humidityDeviceId !== undefined && !Number.isFinite(Number(read.get(humidityDeviceId)))) {
      logger.warn({ processId: process.id }, "weather-control: no valid Humidity reading");
    }
    if (pressureDeviceId !== undefined && !Number.isFinite(Number(read.get(pressureDeviceId)))) {
      logger.warn({ processId: process.id }, "weather-control: no valid Pressure reading");
    }

    const light = Number(read.get(lightDeviceId));
    if (!Number.isFinite(light)) {
      logger.warn({ processId: process.id }, "weather-control: no valid Light reading");
      return;
    }

    const level = classify(zones, light);
    if (level === undefined) return;

    if (lastLightLevel.get(process.id) !== level) {
      lastLightLevel.set(process.id, level);
      await apiClient.setDeviceReading(lightLevelDeviceId, level);
    }
  });
}
