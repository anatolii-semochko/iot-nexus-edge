// "ai-assistant" process kind (Nexus Edge AI Assistant, stage 7 - the
// calendar; apps/api ai/calendar.ts, migration 072). The orchestrator is
// the system's clock: this process's tick asks the API to start the
// scheduled AI runs that are due (POST /ai/calendar/tick) - the API runs
// them (a model call is slow - the tick never waits for one) and reports
// their problems as this process's own WEM warnings. Runs every
// AI_CALENDAR_INTERVAL_MS (a minute is the calendar's resolution).

import { apiClient } from "../apiClient.js";
import { logger } from "../logger.js";

export async function runAiAssistant(): Promise<void> {
  try {
    const { started } = await apiClient.aiCalendarTick();
    if (started.length) logger.info({ schedules: started }, "scheduled AI runs started");
  } catch (err) {
    logger.warn({ err }, "AI calendar tick failed");
  }
}
