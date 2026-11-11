# Nexus Edge AI Assistant - prompt packs

Plain Markdown, English (the assistant answers in the user's language).
Loaded by `src/ai/prompts.ts`; keep them short - every token is paid on
every request.

- `system.md` - the base system prompt (always).
- `knowledge.md` - how to use the documentation and a DNP's own knowledge
  (always, after the base).
- `report.md` - the developer-report instruction (only when the instance's
  Report access is on; the agent stores each `<developer-report>` block).
- `scheduled.md` - the calendar's request of a scheduled run (the work
  type, the entity, the language - `AI_SCHEDULED_LANGUAGE`); its last line
  `Status: OK | PROBLEM - ...` is read back (src/ai/calendar.ts).
- `nexus-edge/<work-type>.md` - a work type of the whole system (entity
  "Nexus Edge").
- `dnp/<work-type>.md` - the standard work types of a DNP instance; a DNP
  overrides one or adds its own in `<plugin>/prompts/<work-type>.md`,
  declared in its `plugin.json` (`ai.workTypes`).
