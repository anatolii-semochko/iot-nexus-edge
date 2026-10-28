// The calendar's time rule (ai/calendar.ts; Nexus Edge AI Assistant, stage
// 7) - pure, in the host's local time (TZ - AGENTS.md section 84): an
// occurrence's moment is the local wall time on its date - a time the
// clock skipped (spring) resolves to the moment after the jump, a repeated
// one (autumn) to its first pass; the same rule as the processes' daily
// events (nexus-edge-aquarium plugins/aquarium/services.ts dueOccurrence,
// AGENTS_TO_DO 2026-10-16). Week - its weekday (0 - Sunday); month - its day
// (a shorter month's last day); year - its month and day; hours - from its time
// every `every_hours` hours to the day's end (an occurrence's key "YYYY-MM-DD HH:MM").

const MINUTE_MS = 60_000;
const localDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const daysInMonth = (year: number, month0: number) => new Date(year, month0 + 1, 0).getDate();

export type Repeat = "day" | "week" | "month" | "year" | "hours";

/** When a schedule runs (ai_schedules' columns). */
export interface When {
  repeat: Repeat;
  weekday: number | null;
  month_day: number | null;
  month: number | null;
  time: string;
  every_hours?: number | null;
}

// whether a schedule has an occurrence on this local day
function onDay(s: When, day: Date): boolean {
  const dayOfMonth = () => Math.min(s.month_day ?? 1, daysInMonth(day.getFullYear(), day.getMonth()));
  switch (s.repeat) {
    case "day":
    case "hours":
      return true;
    case "week":
      return day.getDay() === s.weekday;
    case "month":
      return day.getDate() === dayOfMonth();
    case "year":
      return day.getMonth() + 1 === s.month && day.getDate() === dayOfMonth();
  }
}

// the occurrences on a local day - the wall time (a skipped one resolves after the jump; a repeated one - its
// first pass); "hours" - every `every_hours` from it to the day's end
function momentsOn(s: When, day: Date): { at: number; key: string }[] {
  const [h, m] = s.time.split(":").map(Number);
  const date = localDate(day);
  const step = s.repeat === "hours" ? Math.max(1, s.every_hours ?? 1) : 24;
  const out: { at: number; key: string }[] = [];
  for (let hour = h; hour < 24 || (hour === 24 && m === 0 && out.length === 0); hour += step) {
    const at = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, m).getTime();
    out.push({ at, key: s.repeat === "hours" ? `${date} ${String(hour).padStart(2, "0")}:${String(m).padStart(2, "0")}` : date });
    if (s.repeat !== "hours") break;
  }
  return out;
}

/** The occurrence due now (its key - the local date, "hours" - with its time), or null - started within the catch-up span and not run yet. */
export function dueOccurrence(s: When & { last_run_date: string | null }, now: number, catchUpMin: number): string | null {
  let due: { at: number; key: string } | null = null;
  for (const daysBack of [1, 0]) {
    const day = new Date(now);
    day.setDate(day.getDate() - daysBack);
    if (!onDay(s, day)) continue;
    // the latest one started within the catch-up span
    for (const o of momentsOn(s, day)) if (now >= o.at && now < o.at + catchUpMin * MINUTE_MS && (!due || o.at > due.at)) due = o;
  }
  return due && s.last_run_date !== due.key ? due.key : null;
}

/** The next occurrence after `now` (a day past the month's end is clamped, so there always is one within a year). */
export function nextRun(s: When, now: number): Date | null {
  for (let daysAhead = 0; daysAhead <= 366; daysAhead++) {
    const day = new Date(now);
    day.setDate(day.getDate() + daysAhead);
    if (!onDay(s, day)) continue;
    const next = momentsOn(s, day).find((o) => o.at > now);
    if (next) return new Date(next.at);
  }
  return null;
}
