/**
 * The energy-grid package's prices - pure functions shared by api.ts (the
 * routes, the AI tool) and process.ts (the accounting): what a kWh costs
 * bought from the grid and what it earns sold to it, slot by slot.
 *
 * Buying:
 *  - `tariff` - a supplier's time-of-use tariff: zones by the time of day
 *    (`from` - `to`, local "HH:MM", may wrap midnight), each with its price;
 *    the zone that covers a minute prices it;
 *  - `market` - a dynamic tariff (Germany: offered by every supplier since
 *    2025, EnWG section 41a): the day-ahead spot price plus a fixed
 *    surcharge (grid fees, levies, taxes - `surchargeCtKwh`).
 * Selling: `fixed` (a feed-in tariff, `fixedCtKwh`) or `market` (direct
 * marketing - the spot price minus the marketer's fee, `deductionCtKwh`;
 * a negative spot price earns nothing, the export is then a loss to avoid).
 * The tariff zone is reported in both modes (a planner may use it).
 */

export interface TariffZone {
  key: string;
  label?: string;
  from: string; // "HH:MM"
  to: string; // "HH:MM" (exclusive; "00:00" - the midnight)
  priceCtKwh: number;
}

export interface PurchaseConfig {
  mode?: "tariff" | "market";
  zones?: TariffZone[];
  surchargeCtKwh?: number;
}

export interface SaleConfig {
  mode?: "fixed" | "market";
  fixedCtKwh?: number;
  deductionCtKwh?: number;
}

export interface PriceSlot {
  t: number; // ms, the slot's start
  minutes: number;
  spotEurMwh: number | null;
  buyCtKwh: number | null;
  sellCtKwh: number | null;
  zone: string | null;
}

const minuteOf = (hhmm: string): number => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h % 24) * 60 + (m || 0);
};

/** The tariff zone covering a minute of the day (local), or null. */
export function zoneAt(zones: TariffZone[] | undefined, minuteOfDay: number): TariffZone | null {
  for (const z of zones ?? []) {
    const from = minuteOf(z.from);
    const to = minuteOf(z.to) || 24 * 60;
    const inside = from < to ? minuteOfDay >= from && minuteOfDay < to : minuteOfDay >= from || minuteOfDay < to;
    if (inside) return z;
  }
  return null;
}

const round2 = (x: number) => Math.round(x * 100) / 100;

/** The local minute of the day of a moment, in a time zone (Intl). */
export function localMinute(ms: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(ms));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return get("hour") * 60 + get("minute");
}

/**
 * The prices of the slots: `spot` - the market slots ({ t, minutes,
 * eurMwh }) covering the period; without them (no market data) the slots
 * are the tariff's, `stepMinutes` long, from `from` to `to`.
 */
export function priceSlots(
  spot: { t: number; minutes: number; eurMwh: number }[],
  purchase: PurchaseConfig,
  sale: SaleConfig,
  timeZone: string,
  from: number,
  to: number,
  stepMinutes = 60,
): PriceSlot[] {
  const base =
    spot.length > 0
      ? spot.filter((s) => s.t + s.minutes * 60_000 > from && s.t < to)
      : Array.from({ length: Math.max(0, Math.ceil((to - from) / (stepMinutes * 60_000))) }, (_, i) => ({
          t: from + i * stepMinutes * 60_000,
          minutes: stepMinutes,
          eurMwh: null as number | null,
        }));
  return base.map((s) => {
    const zone = zoneAt(purchase.zones, localMinute(s.t, timeZone));
    const spotCt = s.eurMwh === null ? null : s.eurMwh / 10; // EUR/MWh -> ct/kWh
    const buy =
      (purchase.mode ?? "tariff") === "market"
        ? spotCt === null
          ? (zone?.priceCtKwh ?? null) // no market price - the tariff as the fallback
          : spotCt + (purchase.surchargeCtKwh ?? 0)
        : (zone?.priceCtKwh ?? null);
    const sell =
      (sale.mode ?? "fixed") === "market"
        ? spotCt === null
          ? null
          : Math.max(0, spotCt - (sale.deductionCtKwh ?? 0))
        : (sale.fixedCtKwh ?? null);
    return {
      t: s.t,
      minutes: s.minutes,
      spotEurMwh: s.eurMwh,
      buyCtKwh: buy === null ? null : round2(buy),
      sellCtKwh: sell === null ? null : round2(sell),
      zone: zone?.key ?? null,
    };
  });
}
