import type { MessageInput, MessageType } from "./apiClient.js";
import { tickProcesses } from "./tickProcesses.js";

// The settling of warnings and errors (iot AGENTS_TO_DO.md 2026-11-07, the messages audit): an entry gone
// from a process's report stays active `clearAfterMs` (`config.messageClearAfterMs` by default) more - back within it, it is the same
// message, not a new one. A condition at its edge (a reading around a threshold, a write failing every
// other tick while EdgeX restarts) logged a new message each time it came back - thousands a week in the
// header's counters. The process's critical / warning flag holds with it. `clearAfterMs` per call - 0 for
// a producer with its own hold (resource-monitor's hysteresis).
const held = new Map<string, Map<string, { entry: MessageInput; seenAt: number; clearAfterMs: number }>>();

function heldEntries(processId: number, type: MessageType, now: number, seedClearAfterMs = 0): Map<string, { entry: MessageInput; seenAt: number; clearAfterMs: number }> {
  const key = `${processId}:${type}`;
  let entries = held.get(key);
  if (!entries) {
    // the first report since the orchestrator's start: what the API has active is held as if just reported -
    // a process's first tick, before its state is loaded, reported nothing, and every warning it had was
    // resolved and raised again seconds later as a new row (each deploy - 2026-11-07)
    const active = tickProcesses().find((p) => p.id === processId)?.messages ?? [];
    entries = new Map(
      active
        .filter((m) => m.type === type)
        .map((m) => [m.code, { entry: { code: m.code, level: m.level, text: m.text }, seenAt: now, clearAfterMs: seedClearAfterMs }]),
    );
    held.set(key, entries);
  }
  for (const [code, h] of entries) if (now - h.seenAt >= h.clearAfterMs) entries.delete(code);
  return entries;
}

export function settle(processId: number, type: MessageType, entries: MessageInput[], clearAfterMs: number): MessageInput[] {
  if (type === "message") return entries;
  const now = Date.now();
  const kept = heldEntries(processId, type, now, clearAfterMs);
  for (const entry of entries) kept.set(entry.code, { entry, seenAt: now, clearAfterMs });
  const reported = new Set(entries.map((e) => e.code));
  return [...entries, ...[...kept.values()].filter((h) => !reported.has(h.entry.code)).map((h) => h.entry)];
}

export const holds = (processId: number, type: MessageType, clearAfterMs: number) => heldEntries(processId, type, Date.now(), clearAfterMs).size > 0;

