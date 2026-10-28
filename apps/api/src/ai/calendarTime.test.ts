import { describe, expect, it } from "vitest";

import { dueOccurrence, nextRun, type When } from "./calendarTime.js";

// The rule in the host's local time - pinned to a zone with daylight saving
// (vitest.config `env.TZ`; checked here so a wrong zone fails loudly).
const at = (y: number, mo: number, d: number, h: number, mi: number) => new Date(y, mo - 1, d, h, mi).getTime();
const daily = (time: string): When => ({ repeat: "day", weekday: null, month_day: null, month: null, time });

describe("calendarTime", () => {
  it("runs in the zone the tests pin", () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe("Europe/Berlin");
  });

  it("is due from its moment for the catch-up span, once per date", () => {
    const s = { ...daily("08:00"), last_run_date: null };
    expect(dueOccurrence(s, at(2026, 10, 17, 7, 59), 30)).toBeNull();
    expect(dueOccurrence(s, at(2026, 10, 17, 8, 0), 30)).toBe("2026-10-17");
    expect(dueOccurrence(s, at(2026, 10, 17, 8, 29), 30)).toBe("2026-10-17");
    expect(dueOccurrence(s, at(2026, 10, 17, 8, 30), 30)).toBeNull();
    expect(dueOccurrence({ ...s, last_run_date: "2026-10-17" }, at(2026, 10, 17, 8, 10), 30)).toBeNull();
  });

  it("catches up past midnight on yesterday's date", () => {
    expect(dueOccurrence({ ...daily("23:50"), last_run_date: null }, at(2026, 10, 18, 0, 5), 30)).toBe("2026-10-17");
  });

  it("runs a time the spring switch skips right after the jump", () => {
    // Berlin, 2026-03-29: 02:00 -> 03:00
    const s = { ...daily("02:15"), last_run_date: null };
    expect(dueOccurrence(s, at(2026, 3, 29, 3, 15), 30)).toBe("2026-03-29");
    expect(nextRun(daily("02:15"), at(2026, 3, 29, 0, 0))?.getTime()).toBe(at(2026, 3, 29, 3, 15));
  });

  it("runs a time the autumn switch repeats once", () => {
    // Berlin, 2026-10-25: 03:00 -> 02:00 - 02:30 happens twice
    const s = daily("02:30");
    const first = nextRun(s, at(2026, 10, 25, 0, 0))!.getTime();
    expect(dueOccurrence({ ...s, last_run_date: null }, first, 30)).toBe("2026-10-25");
    // the second pass: an hour later on the same date - already run
    expect(dueOccurrence({ ...s, last_run_date: "2026-10-25" }, first + 3_600_000, 30)).toBeNull();
  });

  it("weekly - its weekday; monthly - the month's last day when shorter; yearly - month and day", () => {
    const week: When = { repeat: "week", weekday: 1, month_day: null, month: null, time: "09:00" };
    expect(new Date(nextRun(week, at(2026, 10, 17, 12, 0))!).getDay()).toBe(1);
    const month: When = { repeat: "month", weekday: null, month_day: 31, month: null, time: "09:00" };
    expect(nextRun(month, at(2027, 2, 1, 0, 0))?.getTime()).toBe(at(2027, 2, 28, 9, 0));
    const year: When = { repeat: "year", weekday: null, month_day: 29, month: 2, time: "09:00" };
    expect(nextRun(year, at(2027, 1, 1, 0, 0))?.getTime()).toBe(at(2027, 2, 28, 9, 0));
    expect(dueOccurrence({ ...year, last_run_date: null }, at(2027, 2, 28, 9, 5), 30)).toBe("2027-02-28");
  });

  it("runs every N hours from its time to the day's end, once per occurrence", () => {
    const s = { repeat: "hours" as const, weekday: null, month_day: null, month: null, time: "06:00", every_hours: 2, last_run_date: null };
    expect(dueOccurrence(s, at(2026, 10, 17, 5, 59), 30)).toBeNull();
    expect(dueOccurrence(s, at(2026, 10, 17, 6, 10), 30)).toBe("2026-10-17 06:00");
    expect(dueOccurrence({ ...s, last_run_date: "2026-10-17 06:00" }, at(2026, 10, 17, 6, 20), 30)).toBeNull();
    expect(dueOccurrence({ ...s, last_run_date: "2026-10-17 06:00" }, at(2026, 10, 17, 8, 5), 30)).toBe("2026-10-17 08:00");
    expect(dueOccurrence(s, at(2026, 10, 17, 7, 0), 30)).toBeNull();
    expect(nextRun(s, at(2026, 10, 17, 22, 30))!.getTime()).toBe(at(2026, 10, 18, 6, 0));
    expect(nextRun(s, at(2026, 10, 17, 9, 0))!.getTime()).toBe(at(2026, 10, 17, 10, 0));
  });
});
