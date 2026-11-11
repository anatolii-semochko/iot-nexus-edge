/**
 * The cost accounts (iot AGENTS_TO_DO.md 2026-10-23, pure): who the site's
 * energy is for - the owner's private costs (a house), the business's (its
 * offices, workshops, halls), the tenants' (each let unit - what to re-bill;
 * no invoices made). An account's day:
 *  - electricity - its meters' (the energy field's sub-meters) kWh today and
 *    their money at the slots' purchase prices (the meter's `todayEur`);
 *  - heat - its heat meters' (a heating system's fan coils, or the whole
 *    system's delivered heat) kWh today at the system's cost of heat today
 *    (its electricity at the slots' prices / the heat it delivered).
 * A meter that already includes a heating plant's electricity (`withLoads`)
 * carries that heat's cost - such an account lists no heat of that system.
 * "Other" - the consumption no account has (the site's all-bought money less
 * the accounts' sum).
 */

export type AccountKind = "private" | "business" | "tenant";
export const ACCOUNT_KINDS: AccountKind[] = ["private", "business", "tenant"];

export interface AccountConfig {
  key: string;
  name: string;
  kind: AccountKind;
  meters?: number[]; // power-meter node ids (the energy field's sub-meters)
  heat?: { processId: number; nodeIds?: number[] }[]; // a heating's fan coils (none - its whole delivered heat)
}

export interface AccountDay {
  key: string;
  name: string;
  kind: AccountKind;
  elecKwh: number;
  elecEur: number;
  heatKwh: number;
  heatEur: number;
  totalEur: number;
}

export interface AccountsDay {
  items: AccountDay[];
  byKind: Record<AccountKind, number>; // EUR
  otherEur: number;
}

interface MeterToday {
  nodeId: number;
  todayKwh?: number;
  todayEur?: number;
}
interface HeatingToday {
  today?: { deliveredKwh?: number; costEur?: number | null };
  consumers?: { nodeId: number; todayKwh?: number }[];
}

const num = (x: unknown) => (Number.isFinite(Number(x)) ? Number(x) : 0);

/** A heating's cost of a kWh of heat today, EUR (null - no heat delivered yet). */
export const heatPriceOf = (h: HeatingToday | undefined): number | null => {
  const kwh = num(h?.today?.deliveredKwh);
  return kwh > 0.01 && h?.today?.costEur != null ? num(h.today.costEur) / kwh : null;
};

/** The accounts' day from the sources' "today" figures; `allBoughtEur` - the site's whole consumption's money. */
export function accountsDay(accounts: AccountConfig[], meters: MeterToday[], heatings: Map<number, HeatingToday>, allBoughtEur: number): AccountsDay {
  const meterOf = new Map(meters.map((m) => [m.nodeId, m]));
  const items = accounts.map((a): AccountDay => {
    let elecKwh = 0;
    let elecEur = 0;
    for (const id of a.meters ?? []) {
      elecKwh += num(meterOf.get(id)?.todayKwh);
      elecEur += num(meterOf.get(id)?.todayEur);
    }
    let heatKwh = 0;
    let heatEur = 0;
    for (const src of a.heat ?? []) {
      const h = heatings.get(src.processId);
      const kwh = src.nodeIds?.length
        ? (h?.consumers ?? []).filter((c) => src.nodeIds!.includes(c.nodeId)).reduce((s, c) => s + num(c.todayKwh), 0)
        : num(h?.today?.deliveredKwh);
      heatKwh += kwh;
      heatEur += kwh * (heatPriceOf(h) ?? 0);
    }
    return { key: a.key, name: a.name, kind: a.kind, elecKwh, elecEur, heatKwh, heatEur, totalEur: elecEur + heatEur };
  });
  const byKind = Object.fromEntries(ACCOUNT_KINDS.map((k) => [k, items.filter((x) => x.kind === k).reduce((s, x) => s + x.totalEur, 0)])) as Record<AccountKind, number>;
  const allocated = items.reduce((s, x) => s + x.totalEur, 0);
  return { items, byKind, otherEur: Math.max(0, allBoughtEur - allocated) };
}

/** A period's accounts - the days' sums by account key (a day without accounts adds nothing). */
export function addAccounts(days: (AccountsDay | undefined | null)[]): AccountsDay | null {
  const present = days.filter((d): d is AccountsDay => !!d?.items);
  if (!present.length) return null;
  const byKey = new Map<string, AccountDay>();
  for (const d of present)
    for (const x of d.items) {
      const s = byKey.get(x.key) ?? { ...x, elecKwh: 0, elecEur: 0, heatKwh: 0, heatEur: 0, totalEur: 0 };
      // the latest day's name and kind
      Object.assign(s, { name: x.name, kind: x.kind });
      s.elecKwh += x.elecKwh;
      s.elecEur += x.elecEur;
      s.heatKwh += x.heatKwh;
      s.heatEur += x.heatEur;
      s.totalEur += x.totalEur;
      byKey.set(x.key, s);
    }
  const items = [...byKey.values()];
  const byKind = Object.fromEntries(ACCOUNT_KINDS.map((k) => [k, items.filter((x) => x.kind === k).reduce((s, x) => s + x.totalEur, 0)])) as Record<AccountKind, number>;
  return { items, byKind, otherEur: present.reduce((s, d) => s + d.otherEur, 0) };
}

const r = (x: number, d: number) => Math.round(x * 10 ** d) / 10 ** d;
/** Rounded for the journal / the wire: kWh to 0.01, EUR to 0.01. */
export const roundAccounts = (a: AccountsDay): AccountsDay => ({
  items: a.items.map((x) => ({ ...x, elecKwh: r(x.elecKwh, 2), elecEur: r(x.elecEur, 2), heatKwh: r(x.heatKwh, 2), heatEur: r(x.heatEur, 2), totalEur: r(x.totalEur, 2) })),
  byKind: Object.fromEntries(Object.entries(a.byKind).map(([k, v]) => [k, r(v, 2)])) as Record<AccountKind, number>,
  otherEur: r(a.otherEur, 2),
});
