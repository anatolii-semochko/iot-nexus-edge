// The prices' levels (the user, 2026-10-30): a price now among the next 24 hours' - the cheapest quarter,
// the middle, the dearest quarter. One rule for the Ledger block's price bars, the grid's two gauges
// (buy, sell) and the colours of the prices' figures, so they always agree.

// the share of the hours counted cheap (the lowest) and dear (the highest)
export const PRICE_QUARTER = 0.25

/** The next 24 hours of prices, hour by hour (each hour the mean of its slots): { t, buy, sell, now }. */
export const priceHoursOf = (prices, now) => {
  const slots = (prices?.slots ?? []).filter(
    (s) => s.t + s.minutes * 60_000 > now - 3_600_000 && s.buyCtKwh !== null,
  )
  const byHour = new Map()
  for (const s of slots) {
    const h = Math.floor(s.t / 3_600_000) * 3_600_000
    if (!byHour.has(h)) byHour.set(h, [])
    byHour.get(h).push(s)
  }
  const mean = (list, k) => {
    const v = list.map((s) => s[k]).filter((x) => x != null)
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null
  }
  return [...byHour.entries()].slice(0, 24).map(([h, list]) => ({
    t: h,
    buy: mean(list, 'buyCtKwh'),
    sell: mean(list, 'sellCtKwh'),
    now: now >= h && now < h + 3_600_000,
  }))
}

/** The cheap and the dear limit of a list of prices (its quarters). */
export const quartersOf = (values) => {
  const sorted = values.filter((v) => v != null).sort((a, b) => a - b)
  if (!sorted.length) return null
  return {
    low: sorted[Math.floor(sorted.length * PRICE_QUARTER)],
    high: sorted[Math.floor(sorted.length * (1 - PRICE_QUARTER))],
    sorted,
  }
}

/**
 * A price's level among the next hours': `level` good | fair | bad - for a purchase the cheap is good,
 * for a sale (`higherIsBetter`) the dear; `share` - its place, 0 (the lowest) to 1 (the highest), kept
 * inside its level's part of the gauge. Null without a price or the hours.
 */
export const priceLevel = (value, values, higherIsBetter = false) => {
  const q = quartersOf(values)
  if (value == null || !q) return null
  const low = value <= q.low
  const high = value >= q.high
  const raw = q.sorted.filter((v) => v < value).length / q.sorted.length
  const part = low
    ? [0, PRICE_QUARTER]
    : high
      ? [1 - PRICE_QUARTER, 1]
      : [PRICE_QUARTER, 1 - PRICE_QUARTER]
  const share = Math.min(part[1], Math.max(part[0], raw))
  const level = low
    ? higherIsBetter
      ? 'bad'
      : 'good'
    : high
      ? higherIsBetter
        ? 'good'
        : 'bad'
      : 'fair'
  return { level, share }
}

/** A level's Bootstrap colour (text-success / -warning / -danger, the gauges' segments alike). */
export const LEVEL_COLOR = { good: 'success', fair: 'warning', bad: 'danger' }
