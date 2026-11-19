/**
 * machining - the blanks and the CNC machining's models (pure; the metal shop, iot AGENTS_TO_DO.md
 * 2026-11-19, step 7):
 *  - the saw cuts the bar stock into blanks for the machine with the fewest in its buffer (its job's
 *    material, its blank's length plus the kerf), one blank per `cutS`;
 *  - each CNC machine runs its jobs in turn: a setup, then one part per cycle while it has blanks (idle
 *    without them), the tool's life counted - spent, an alarm for the tool's change; the job's quantity
 *    done - the next job;
 *  - the shift: off it the machines and the saw stop; the stock under its minimum - delivered at the next
 *    shift's start;
 *  - OEE: the availability (the cycles' time over the shift's time) x the performance x the quality.
 */

export interface Material {
  key: string;
  name: string;
  stockM: number;
  minM: number;
  lotM: number; // one delivery
}

export interface Job {
  program: string;
  part: string;
  material: string; // Material.key
  blankMm: number;
  qty: number;
  cycleS: number;
  setupMin: number;
}

export type MachineState = "setup" | "run" | "idle" | "alarm" | "off";

export interface Machine {
  name: string;
  state: MachineState;
  job: number; // index into the jobs
  done: number;
  blanks: number;
  cycleLeftS: number;
  setupLeftS: number;
  alarmLeftS: number;
  toolLeftMin: number;
  runS: number; // today, in cycle
  plannedS: number; // today, on the shift
  parts: number; // today
}

export interface Saw {
  cutting: string | null; // the machine the blank is for
  cutLeftS: number;
  cuts: number; // today
}

export interface ShopSpec {
  cutS: number;
  kerfMm: number;
  bufferMax: number;
  toolLifeMin: number;
  toolChangeMin: number;
  performance: number;
}

/** The blank's metres of stock (its length and the kerf). */
const blankM = (spec: ShopSpec, job: Job) => (job.blankMm + spec.kerfMm) / 1000;

/** The saw over `seconds`: a blank done goes to its machine; idle - the next one for the neediest machine. */
export function sawStep(spec: ShopSpec, saw: Saw, machines: Machine[], jobs: Job[], stock: Material[], seconds: number, onShift: boolean) {
  if (!onShift) {
    saw.cutting = null;
    return;
  }
  if (saw.cutting) {
    saw.cutLeftS -= seconds;
    if (saw.cutLeftS > 0) return;
    const m = machines.find((x) => x.name === saw.cutting);
    if (m) m.blanks += 1;
    saw.cuts += 1;
    saw.cutting = null;
  }
  const needy = machines
    .filter((m) => m.state !== "off" && m.blanks < spec.bufferMax)
    .filter((m) => {
      const job = jobs[m.job];
      const mat = stock.find((s) => s.key === job?.material);
      return job && mat && mat.stockM >= blankM(spec, job) && m.blanks < job.qty - m.done;
    })
    .sort((a, z) => a.blanks - z.blanks)[0];
  if (!needy) return;
  const job = jobs[needy.job];
  const mat = stock.find((s) => s.key === job.material)!;
  mat.stockM = Math.round((mat.stockM - blankM(spec, job)) * 1000) / 1000;
  saw.cutting = needy.name;
  saw.cutLeftS = spec.cutS;
}

/** One machine over `seconds`; returns the parts finished. */
export function machineStep(spec: ShopSpec, m: Machine, jobs: Job[], seconds: number, onShift: boolean): number {
  if (!onShift) {
    if (m.state !== "off") m.state = "off";
    return 0;
  }
  m.plannedS += seconds;
  if (m.state === "off") m.state = m.setupLeftS > 0 ? "setup" : "idle";
  const job = jobs[m.job];
  if (!job) return 0;
  if (m.state === "setup") {
    m.setupLeftS -= seconds;
    if (m.setupLeftS <= 0) m.state = "idle";
    return 0;
  }
  if (m.state === "alarm") {
    m.alarmLeftS -= seconds;
    if (m.alarmLeftS <= 0) {
      m.toolLeftMin = spec.toolLifeMin;
      m.state = "idle";
    }
    return 0;
  }
  if (m.state === "idle") {
    if (m.blanks <= 0) return 0;
    m.state = "run";
    m.cycleLeftS = job.cycleS;
  }
  // run
  m.runS += seconds;
  m.cycleLeftS -= seconds;
  if (m.cycleLeftS > 0) return 0;
  m.done += 1;
  m.parts += 1;
  m.blanks -= 1;
  m.toolLeftMin -= job.cycleS / 60;
  if (m.done >= job.qty) {
    m.job = (m.job + 1) % jobs.length;
    m.done = 0;
    m.blanks = 0;
    m.state = "setup";
    m.setupLeftS = (jobs[m.job]?.setupMin ?? 0) * 60;
  } else if (m.toolLeftMin <= 0) {
    m.state = "alarm";
    m.alarmLeftS = spec.toolChangeMin * 60;
  } else if (m.blanks > 0) m.cycleLeftS = job.cycleS;
  else m.state = "idle";
  return 1;
}

/** The deliveries at a shift's start: each material under its minimum gets its lot. */
export function deliver(stock: Material[]): string[] {
  const got: string[] = [];
  for (const s of stock)
    if (s.stockM < s.minM) {
      s.stockM = Math.round((s.stockM + s.lotM) * 1000) / 1000;
      got.push(s.key);
    }
  return got;
}

/** A machine's OEE today (0..1): availability x performance x quality. */
export const oee = (spec: ShopSpec, m: Machine, quality: number) =>
  m.plannedS > 0 ? Math.min(1, m.runS / m.plannedS) * spec.performance * quality : 0;
