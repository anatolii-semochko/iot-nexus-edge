// The calendar's time rule (ai/calendar.ts; Nexus Edge AI Assistant, stage
// 7) - pure, in the host's local time (TZ - AGENTS.md section 84): an
// occurrence's moment is the local wall time on its date - a time the
// clock skipped (spring) resolves to the moment after the jump, a repeated
// one (autumn) to its first pass; the same rule as the processes' daily
// events (nexus-edge-aquarium plugins/aquarium/services.ts dueOccurrence,
// AGENTS_TO_DO 2026-10-16). Week - its weekday (0 - Sunday); month - its day
// (a shorter month's last day); year - its month and day.

const MINUTE_MS = 60_000;
const localDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const daysInMonth = (year: number, month0: number) => new Date(year, month0 + 1, 0).getDate();

export type Repeat = "day" | "week" | "month" | "year";

/** When a schedule runs (ai_schedules' columns). */
export interface When {
  repeat: Repeat;
  weekday: number | null;
  month_day: number | null;
  month: number | null;
  time: string;
}

// whether a schedule has an occurrence on this local day
function onDay(s: When, day: Date): boolean {
  const dayOfMonth = () => Math.min(s.month_day ?? 1, daysInMonth(day.getFullYear(), day.getMonth()));
  switch (s.repeat) {
    case "day":
      return true;
    case "week":
      return day.getDay() === s.weekday;
    case "month":
      return day.getDate() === dayOfMonth();
    case "year":
      return day.getMonth() + 1 === s.month && day.getDate() === dayOfMonth();
  }
}

// the occurrence's moment on a local day - the wall time (a skipped one resolves after the jump; a repeated one - its first pass)
function momentOn(s: When, day: Date): number {
  const [h, m] = s.time.split(":").map(Number);
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m).getTime();
}

/** The occurrence due now (its local date), or null - started within the catch-up span and not run for its date yet. */
export function dueOccurrence(s: When & { last_run_date: string | null }, now: number, catchUpMin: number): string | null {
  for (const daysBack of [0, 1]) {
    const day = new Date(now);
    day.setDate(day.getDate() - daysBack);
    if (!onDay(s, day)) continue;
    const at = momentOn(s, day);
    const date = localDate(day);
    if (now >= at && now < at + catchUpMin * MINUTE_MS && s.last_run_date !== date) return date;
  }
  return null;
}

/** The next occurrence after `now` (a day past the month's end is clamped, so there always is one within a year). */
export function nextRun(s: When, now: number): Date | null {
  for (let daysAhead = 0; daysAhead <= 366; daysAhead++) {
    const day = new Date(now);
    day.setDate(day.getDate() + daysAhead);
    if (!onDay(s, day)) continue;
    const at = momentOn(s, day);
    if (at > now) return new Date(at);
  }
  return null;
}
