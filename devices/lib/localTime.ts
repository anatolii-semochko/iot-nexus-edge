// The local time of a moment in a time zone - shared by the core's packages
// (energy-field, heating-control, heating-planner, energy-ledger), one
// formatter per time zone, kept: creating an Intl.DateTimeFormat costs ~9x
// formatting with one, and the packages call this for every slot of a
// two-day plan (iot PERF_PROD_2026-11-05.md - it was a copy in each
// package, a new formatter every call).

const formatters = new Map<string, Intl.DateTimeFormat>();

/** An Intl.DateTimeFormat for these options, made once and kept - use it instead of `new Intl.DateTimeFormat`. */
export function dateFormat(locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale}|${JSON.stringify(options)}`;
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(locale, options);
    formatters.set(key, f);
  }
  return f;
}

const formatterOf = (timeZone: string) =>
  dateFormat("en-GB", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short", hourCycle: "h23" });

/** YYYY-MM-DD of a moment in a time zone. */
export const localDate = (ms: number, timeZone: string): string =>
  dateFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** `date` - YYYY-MM-DD, `hour` 0-23, `minute` - the minute of the day (0-1439), `weekday` 0 - Sunday. */
export function localParts(ms: number, timeZone: string): { date: string; hour: number; minute: number; weekday: number } {
  const parts = formatterOf(timeZone).formatToParts(new Date(ms));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const hour = Number(get("hour"));
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    hour,
    minute: hour * 60 + Number(get("minute")),
    weekday: WEEKDAYS.indexOf(get("weekday")),
  };
}
