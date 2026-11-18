/**
 * quality-control - QC and packing's models (pure; the metal shop, iot AGENTS_TO_DO.md 2026-11-18, step 5):
 *  - a batch's coating measured at `points` places: each point around the bar's coating (the parts' place on
 *    the bar, the probe) - the same batch always gives the same points (seeded by its id);
 *  - the verdict: passed if the thinnest point reaches the minimum, else "check"; the rejected parts - a few
 *    from the handling, more for a thin batch;
 *  - the packing: the passed parts onto pallets of `perPallet`.
 */

export interface QcSpec {
  minUm: number;
  targetUm: number;
  points: number;
  inspectMin: number;
  partsPerBar: number;
  perPallet: number;
}

export interface Result {
  id: string;
  meanUm: number;
  minUm: number;
  maxUm: number;
  points: number[];
  verdict: "passed" | "check";
  parts: number;
  rejected: number;
  at: number;
}

/** A small seeded generator (mulberry32) - the batch id's hash as its seed. */
export function seeded(id: string): () => number {
  let a = 0;
  for (let i = 0; i < id.length; i++) a = (Math.imul(a, 31) + id.charCodeAt(i)) | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The batch measured: its points, the verdict, the rejected parts. */
export function inspect(s: QcSpec, id: string, coatingUm: number, at: number): Result {
  const rnd = seeded(id);
  const points = Array.from({ length: s.points }, () => Math.round(coatingUm * (0.9 + 0.17 * rnd()) * 10) / 10);
  const minUm = Math.min(...points);
  const verdict = minUm >= s.minUm ? "passed" : "check";
  const rate = (verdict === "passed" ? 0.005 : 0.06) + 0.02 * rnd();
  const rejected = Math.round(s.partsPerBar * rate);
  return {
    id,
    meanUm: Math.round((points.reduce((a, b) => a + b, 0) / points.length) * 10) / 10,
    minUm,
    maxUm: Math.max(...points),
    points,
    verdict,
    parts: s.partsPerBar,
    rejected,
    at,
  };
}

/** The pallets: the packed parts' full pallets and the one being filled. */
export const pallets = (s: QcSpec, packedParts: number) => ({ full: Math.floor(packedParts / s.perPallet), filling: packedParts % s.perPallet });
