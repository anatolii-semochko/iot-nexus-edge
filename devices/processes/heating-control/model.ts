/**
 * heating-control models - pure functions (no I/O; the process and the tests
 * call them directly): what a heat pump gives and takes at a given weather,
 * how a buffer tank's water temperature and stored heat move, how a room
 * warms or cools, what a fan coil gives. Simplified physics, close enough
 * for a demo and for the Energy Ledger's planning; every constant is a
 * parameter with a documented default.
 */

/** Water: 1.163 Wh per litre and kelvin; a flow of 1 l/min carries 0.0697 kW per kelvin. */
export const WATER_WH_PER_L_K = 1.163;
export const WATER_KW_PER_LPM_K = 0.0697;

export type Mode = "heating" | "cooling";

// --- heat pump ----------------------------------------------------------------

export interface HeatPumpSpec {
  ratedHeatKw: number; // heat output at A7/W35
  ratedCoolKw: number; // cooling output at A35/W18
  nominalFlowLpm: number; // the water flow at the rated output
  fanRatedRpm: number;
  carnotEfficiency?: number; // the share of the ideal (Carnot) COP a real machine reaches, default 0.45
  minModulation?: number; // the lowest share of the output it runs at, default 0.3
}

const K = 273.15;

/**
 * The COP (heating) or EER (cooling) at an outdoor and a flow temperature:
 * the Carnot COP of the refrigerant's temperatures (5 K beyond the water and
 * the air on each heat exchanger) times the machine's efficiency, within 1.2..7.
 */
export function performance(spec: HeatPumpSpec, mode: Mode, outdoorC: number, flowC: number): number {
  const eta = spec.carnotEfficiency ?? 0.45;
  const hot = (mode === "heating" ? flowC : outdoorC) + 5 + K;
  const cold = (mode === "heating" ? outdoorC : flowC) - 5 + K;
  const lift = Math.max(5, hot - cold);
  const ideal = mode === "heating" ? hot / lift : cold / lift;
  return Math.max(1.2, Math.min(7, ideal * eta));
}

/** The most the unit gives now: an air / water pump loses output as the air gets colder (heating) or hotter (cooling). */
export function maxOutputKw(spec: HeatPumpSpec, mode: Mode, outdoorC: number): number {
  if (mode === "heating") return spec.ratedHeatKw * Math.max(0.5, Math.min(1.2, 1 + 0.025 * (outdoorC - 7)));
  return spec.ratedCoolKw * Math.max(0.6, Math.min(1.15, 1 - 0.015 * (outdoorC - 35)));
}

export interface HeatPumpState {
  running: boolean;
  modulation: number; // 0..1
  heatKw: number; // + heat delivered (heating) / - heat taken (cooling)
  electricKw: number;
  cop: number | null; // COP / EER while running
  flowC: number;
  returnC: number;
  flowLpm: number;
  fanRpm: number;
}

/**
 * One unit's state: `demand` 0..1 - how much of its output the tanks need
 * now (0 - off); the water comes back from the tanks' bottom (heating) or
 * top (cooling) at `returnC`.
 */
export function heatPumpRun(spec: HeatPumpSpec, mode: Mode, demand: number, outdoorC: number, returnC: number): HeatPumpState {
  const idle: HeatPumpState = { running: false, modulation: 0, heatKw: 0, electricKw: 0, cop: null, flowC: returnC, returnC, flowLpm: 0, fanRpm: 0 };
  if (demand <= 0) return idle;
  const modulation = Math.max(spec.minModulation ?? 0.3, Math.min(1, demand));
  const output = maxOutputKw(spec, mode, outdoorC) * modulation;
  const flowLpm = spec.nominalFlowLpm * Math.max(0.5, modulation);
  const dT = output / (flowLpm * WATER_KW_PER_LPM_K);
  const flowC = mode === "heating" ? returnC + dT : returnC - dT;
  const cop = performance(spec, mode, outdoorC, flowC);
  return {
    running: true,
    modulation,
    heatKw: mode === "heating" ? output : -output,
    electricKw: output / cop,
    cop,
    flowC,
    returnC,
    flowLpm,
    fanRpm: spec.fanRatedRpm * (0.35 + 0.65 * modulation),
  };
}

// --- buffer tank ----------------------------------------------------------------

export interface TankSpec {
  volumeL: number;
  tMinC: number; // the lowest useful temperature (heating) - 0 % stored
  tMaxC: number; // the highest allowed - 100 %
  lossKwK?: number; // the heat loss per kelvin over the room it stands in, default 0.0035 kW/K (800 l, good insulation)
}

/** The heat stored above the lowest useful temperature, kWh, and its share of the full tank, %. */
export function tankStored(spec: TankSpec, avgC: number): { kwh: number; pct: number; fullKwh: number } {
  const perK = (spec.volumeL * WATER_WH_PER_L_K) / 1000;
  const fullKwh = perK * (spec.tMaxC - spec.tMinC);
  const kwh = Math.max(0, perK * (avgC - spec.tMinC));
  return { kwh, pct: Math.max(0, Math.min(100, (kwh / fullKwh) * 100)), fullKwh };
}

/**
 * The tank's average temperature after `hours` with `netKw` going in (+ the
 * heat pumps' heat less what the consumers draw) and its standing loss to
 * the room; the stratification - top / bottom around the average - grows
 * with the flows through it.
 */
export function tankStep(spec: TankSpec, avgC: number, netKw: number, throughKw: number, roomC: number, hours: number) {
  const perK = (spec.volumeL * WATER_WH_PER_L_K) / 1000;
  const lossKw = (spec.lossKwK ?? 0.0035) * (avgC - roomC);
  const next = avgC + ((netKw - lossKw) * hours) / perK;
  const spread = 1.5 + 4 * Math.min(1, throughKw / Math.max(1, spec.volumeL / 50));
  return { avgC: next, topC: next + spread, bottomC: next - spread, lossKw };
}

// --- room and fan coil ----------------------------------------------------------

export interface RoomSpec {
  uaKwK: number; // the heat loss to the outside per kelvin (walls, windows, air)
  capacityKwhK: number; // the heat it holds per kelvin (air, furniture, the inner walls)
  gainsKw: number; // people, computers, light in the working hours
}

export interface FanCoilSpec {
  ratedKw: number; // the output at 50 K between the water and the room, full fan
  fanRatedW: number;
  fanRatedRpm: number;
}

/**
 * The thermostat: the fan's share 0..1 - proportional over `bandK` below the
 * setpoint (heating) or above it (cooling).
 */
export function fanDemand(mode: Mode, roomC: number, setpointC: number, bandK = 1.5): number {
  const err = mode === "heating" ? setpointC - roomC : roomC - setpointC;
  return Math.max(0, Math.min(1, err / bandK + 0.15));
}

/**
 * A fan coil's thermostat with a hysteresis (2026-10-22 - the fan turns only while the unit
 * heats / cools): it starts when the room is `startK` short of the setpoint, stops once the
 * room reached it; while working - its fan proportional over `bandK`, at least `minFan`.
 */
export function fanControl(mode: Mode, roomC: number, setpointC: number, wasWorking: boolean, startK = 0.3, bandK = 1.5, minFan = 0.25) {
  const err = mode === "heating" ? setpointC - roomC : roomC - setpointC; // > 0 - the room is short of its setpoint
  const working = wasWorking ? err > 0 : err >= startK;
  return { working, fan: working ? Math.max(minFan, Math.min(1, err / bandK + minFan)) : 0 };
}

/**
 * The heat pumps staged (2026-10-22): as few as the need takes - one runs longer rather than all
 * of them briefly; more join when more heat is needed (a large demand, the cheap tariff's charge).
 * `need` - the share of all the units' output wanted now (0..1); `order` - the units' indices,
 * the first leads (the least run hours - the wear spread over time). Each unit's demand: the
 * running ones share the need equally (at least `minModulation`), the rest stand.
 */
export function stagePumps(need: number, outputs: number[], order: number[], minModulation = 0.3): number[] {
  const demand = outputs.map(() => 0);
  const total = outputs.reduce((a, b) => a + b, 0);
  if (need <= 0 || total <= 0) return demand;
  const neededKw = need * total;
  let running: number[] = [];
  let capacity = 0;
  for (const i of order) {
    if (capacity >= neededKw - 1e-9) break;
    running.push(i);
    capacity += outputs[i];
  }
  if (!running.length) running = [order[0]];
  const share = Math.max(minModulation, Math.min(1, neededKw / capacity));
  for (const i of running) demand[i] = share;
  return demand;
}

/** What a fan coil gives now (+ heat / - cold), its fan power and speed. */
export function fanCoilRun(spec: FanCoilSpec, fan: number, waterC: number, roomC: number) {
  if (fan <= 0) return { heatKw: 0, fanW: 0, fanRpm: 0 };
  // the output follows the temperature difference and, less than linearly, the air flow
  const heatKw = spec.ratedKw * ((waterC - roomC) / 50) * Math.pow(fan, 0.6);
  return { heatKw, fanW: spec.fanRatedW * (0.2 + 0.8 * fan ** 2), fanRpm: spec.fanRatedRpm * (0.3 + 0.7 * fan) };
}

/** The room's temperature after `hours`: the fan coil's heat, the gains, the loss to the outside. */
export function roomStep(spec: RoomSpec, roomC: number, coilKw: number, outdoorC: number, gainsKw: number, hours: number): number {
  const lossKw = spec.uaKwK * (roomC - outdoorC);
  return roomC + ((coilKw + gainsKw - lossKw) * hours) / spec.capacityKwhK;
}

/** The working-hours gains: weekdays `from`..`to` (minutes of the day). */
export function gainsAt(spec: RoomSpec, minute: number, weekday: number, from = 7 * 60, to = 19 * 60): number {
  const working = weekday >= 1 && weekday <= 5 && minute >= from && minute < to;
  return working ? spec.gainsKw : spec.gainsKw * 0.15;
}

// --- the mode ---------------------------------------------------------------------

/** Auto mode by the outdoor temperature with a hysteresis band: below `heatBelowC` - heating, above `coolAboveC` - cooling, between - as it was. */
export function autoMode(previous: Mode | null, outdoorC: number, heatBelowC: number, coolAboveC: number): Mode {
  if (outdoorC < heatBelowC) return "heating";
  if (outdoorC > coolAboveC) return "cooling";
  return previous ?? (outdoorC < (heatBelowC + coolAboveC) / 2 ? "heating" : "cooling");
}
