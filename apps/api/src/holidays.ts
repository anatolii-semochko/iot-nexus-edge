import Holidays from "date-holidays";

/**
 * A country's public holidays (the offline library date-holidays - ~200
 * countries with their regions, iot AGENTS_TO_DO.md 2026-10-25): the days
 * off by law (type "public"; "bank" - e.g. Germany's Christmas Eve, offices closing
 * early - not a day off) between two local dates, YYYY-MM-DD. For the
 * packages through the plugin context (`holidaysOf`) - e.g. the Energy
 * Ledger's operational days. Unknown country - none.
 */
export function holidaysOf(country: string, region: string | null | undefined, from: string, to: string, lang = "en"): { date: string; name: string }[] {
  const hd = region ? new Holidays(country, region) : new Holidays(country);
  if (!hd.getCountries()[country.toUpperCase()]) return [];
  const years = new Set<number>();
  for (let y = Number(from.slice(0, 4)); y <= Number(to.slice(0, 4)); y++) years.add(y);
  const out: { date: string; name: string }[] = [];
  for (const y of years)
    for (const h of hd.getHolidays(y, lang) || []) {
      const date = h.date.slice(0, 10);
      if (h.type === "public" && date >= from && date <= to && !out.some((x) => x.date === date)) out.push({ date, name: h.name });
    }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}
