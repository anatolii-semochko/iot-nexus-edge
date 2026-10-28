/**
 * energy-ledger - the operational days' notes (iot AGENTS_TO_DO.md
 * 2026-10-25, stage B), pure: what is known about a day that the plan must
 * weigh, and how it does:
 * - `holiday`, `day-off` - not a working day: the consumption by the
 *   profile's day off (Sunday's);
 * - `workday` - a working day though a weekend: the consumption by a
 *   working day's profile (Wednesday's);
 * - `outage` - no grid in its window: the plan's slots island (no import, no
 *   export) - the batteries charged ahead to carry the site, the reserve
 *   theirs to use then;
 * - `maintenance` - its nodes out in its window: their PV / wind none, the
 *   batteries' power less by their share;
 * - `other` - for people and the AI only.
 * A note without a window covers its whole local day.
 */

// (a heating's room-closed - for its own logic later; the plan reads it as other)
export const NOTE_KINDS = ["outage", "holiday", "day-off", "workday", "maintenance", "room-closed", "other"] as const;
export type NoteKind = (typeof NOTE_KINDS)[number];

export interface DayNote {
  id?: number;
  day: string; // local YYYY-MM-DD
  kind: NoteKind;
  text: string;
  startsAt: number | null; // ms
  endsAt: number | null;
  nodeIds: number[];
  source: "auto" | "ai" | "user";
}

export interface DayType {
  weekday: number; // 0 Sunday .. 6
  working: boolean;
  reason: string | null; // the note that decided it, else null (the weekday)
}

const NOT_WORKING: NoteKind[] = ["holiday", "day-off"];
const WORKDAY_PROFILE = 3; // a working weekend uses Wednesday's profile
const DAY_OFF_PROFILE = 0; // a day off uses Sunday's

const weekdayOf = (day: string) => new Date(`${day}T12:00:00Z`).getUTCDay();

/** A day's type: its weekday, working or not - the notes first (a holiday, a working weekend). */
export function dayTypeOf(day: string, notes: DayNote[]): DayType {
  const weekday = weekdayOf(day);
  const own = notes.filter((n) => n.day === day);
  const off = own.find((n) => NOT_WORKING.includes(n.kind));
  if (off) return { weekday, working: false, reason: off.text || off.kind };
  const work = own.find((n) => n.kind === "workday");
  if (work) return { weekday, working: true, reason: work.text || work.kind };
  return { weekday, working: weekday >= 1 && weekday <= 5, reason: null };
}

const localDate = (ms: number, timeZone: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));

/** Whether a note covers a moment (its window, else its whole local day). */
export function covers(n: DayNote, ms: number, timeZone: string): boolean {
  if (n.startsAt !== null || n.endsAt !== null) return (n.startsAt ?? -Infinity) <= ms && ms < (n.endsAt ?? Infinity);
  return localDate(ms, timeZone) === n.day;
}

export interface NoteEffects {
  /** The weekday whose profile the consumption follows at a moment. */
  profileWeekday(ms: number, weekday: number): number;
  /** A unit (a PV block, a turbine) out at a moment - maintenance. */
  unitOff(nodeId: number, ms: number): boolean;
  /** No grid at a moment - an outage. */
  gridOff(ms: number): boolean;
  /** The batteries' power share left at a moment (1 - all; units in maintenance take theirs). */
  batteryFactor(ms: number): number;
  /** The heating's electricity share at a moment: heat pumps in maintenance, rooms closed (set back) less. */
  heatingFactor(ms: number): number;
}

export const NO_EFFECTS: NoteEffects = {
  profileWeekday: (_ms, weekday) => weekday,
  unitOff: () => false,
  gridOff: () => false,
  batteryFactor: () => 1,
  heatingFactor: () => 1,
};

// a closed room still loses heat, set back - its share of the heating counted at this much
const CLOSED_ROOM_SHARE = 0.6;

/** The heatings' units the notes may name - their rated powers (the heat pumps', the fan coils'). */
export interface HeatingUnits {
  pumps: { nodeId: number; ratedKw: number }[];
  coils: { nodeId: number; ratedKw: number }[];
}

/** What the notes do to the plan; `batteries` - the enabled units (their power shares). */
export function noteEffects(
  notes: DayNote[],
  timeZone: string,
  batteries: { nodeId: number; maxDischargeKw: number }[] = [],
  heating: HeatingUnits = { pumps: [], coils: [] },
): NoteEffects {
  if (!notes.length) return NO_EFFECTS;
  const types = new Map<string, DayType>();
  const typeOf = (day: string) => {
    if (!types.has(day)) types.set(day, dayTypeOf(day, notes));
    return types.get(day)!;
  };
  const totalKw = batteries.reduce((a, b) => a + b.maxDischargeKw, 0);
  const maintenance = notes.filter((n) => n.kind === "maintenance" && n.nodeIds.length);
  const closedNotes = notes.filter((n) => n.kind === "room-closed");
  const pumpsKw = heating.pumps.reduce((a, p) => a + p.ratedKw, 0);
  const coilsKw = heating.coils.reduce((a, c) => a + c.ratedKw, 0);
  return {
    profileWeekday(ms, weekday) {
      const t = typeOf(localDate(ms, timeZone));
      if (t.reason === null) return weekday;
      return t.working ? (weekday >= 1 && weekday <= 5 ? weekday : WORKDAY_PROFILE) : weekday === 0 || weekday === 6 ? weekday : DAY_OFF_PROFILE;
    },
    unitOff: (nodeId, ms) => maintenance.some((n) => n.nodeIds.includes(nodeId) && covers(n, ms, timeZone)),
    gridOff: (ms) => notes.some((n) => n.kind === "outage" && covers(n, ms, timeZone)),
    batteryFactor(ms) {
      if (!totalKw) return 1;
      const out = batteries.filter((b) => maintenance.some((n) => n.nodeIds.includes(b.nodeId) && covers(n, ms, timeZone)));
      return Math.max(0, 1 - out.reduce((a, b) => a + b.maxDischargeKw, 0) / totalKw);
    },
    heatingFactor(ms) {
      // the heat pumps out make less heat (the rest can't cover it all), the closed rooms need less
      const pumpsOut = pumpsKw ? heating.pumps.filter((p) => maintenance.some((n) => n.nodeIds.includes(p.nodeId) && covers(n, ms, timeZone))) : [];
      const pumpShare = pumpsKw ? 1 - pumpsOut.reduce((a, p) => a + p.ratedKw, 0) / pumpsKw : 1;
      const closedNow = closedNotes.filter((n) => covers(n, ms, timeZone));
      const closedKw = closedNow.some((n) => !n.nodeIds.length)
        ? coilsKw
        : heating.coils.filter((c) => closedNow.some((n) => n.nodeIds.includes(c.nodeId))).reduce((a, c) => a + c.ratedKw, 0);
      const roomShare = coilsKw ? 1 - (closedKw / coilsKw) * (1 - CLOSED_ROOM_SHARE) : 1;
      return Math.max(0, pumpShare * roomShare);
    },
  };
}

/** A note from its stored row (the API's wire shape). */
export function noteOf(row: Record<string, any>): DayNote {
  return {
    id: row.id,
    day: String(row.day).slice(0, 10),
    kind: row.kind,
    text: row.text ?? "",
    startsAt: row.startsAt === null || row.startsAt === undefined ? null : Number(row.startsAt),
    endsAt: row.endsAt === null || row.endsAt === undefined ? null : Number(row.endsAt),
    nodeIds: row.nodeIds ?? [],
    source: row.source,
  };
}

const KIND_WORDS: Record<NoteKind, string> = {
  outage: "Grid outage",
  holiday: "Holiday",
  "day-off": "Day off",
  workday: "Working day",
  maintenance: "Maintenance",
  "room-closed": "Room closed",
  other: "Note",
};

/**
 * The day's description in words without the AI (autonomy): the strategy and why, what the day's notes
 * change, the plan's next steps (local times), what it expects to save. The AI's own (the work type
 * day-plan) is shown over it when there is one.
 */
export function autoSummary(input: {
  strategyName: string;
  why: string | null; // the similar days' reason, else null (a fixed / proposed strategy)
  notes: DayNote[];
  steps: { from: number; to: number; action: string; avgKw: number }[];
  savingEur: number | null;
  timeZone: string;
}): string {
  const time = (ms: number) => new Intl.DateTimeFormat("en-GB", { timeZone: input.timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(ms));
  const parts = [`${input.strategyName}${input.why ? ` - ${input.why}` : ""}.`];
  for (const n of input.notes)
    parts.push(`${KIND_WORDS[n.kind]}${n.startsAt || n.endsAt ? ` ${n.startsAt ? time(n.startsAt) : ""}-${n.endsAt ? time(n.endsAt) : ""}` : ""}${n.text ? `: ${n.text}` : ""}.`);
  const moves = input.steps.filter((s) => s.action !== "hold").slice(0, 3);
  if (moves.length)
    parts.push(`The batteries ${moves.map((s) => `${s.action} ${time(s.from)}-${time(s.to)} (~${Math.round(Math.abs(s.avgKw))} kW)`).join(", ")}.`);
  if (input.savingEur !== null) parts.push(`The plan expects to save ${input.savingEur.toFixed(2)} EUR to its end.`);
  return parts.join(" ");
}
