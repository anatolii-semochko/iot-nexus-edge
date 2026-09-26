/**
 * "ai-analyzer" process kind - orchestrator side (AGENTS.md section 82,
 * AI Analyzing Camera stage 4). CORE Library kind, loaded by
 * processPlugins.ts from devices/processes/ in every project.
 *
 * Takes each new image from an image-caster Device, has it analysed
 * (api.ts, POST /ai-analyzer/:id/analyze - AI layer, active Target
 * objects) and writes the outcome to a result-receiver Device as one JSON
 * string: `{"imageId", "status": "ok"|"error", "text", "found": <count of
 * found instances>}`
 * - the camera shows `text`, blinks for `found > 0`, shows "Error" for
 * `status: "error"`, and ignores a result whose imageId isn't the frame
 * it's waiting for.
 *
 * Event-driven (onDeviceEvent, AGENTS.md section 80): reacts only to a
 * fresh capture - a device push, or a simulated upload (`source` "api") -
 * never to the re-published value of an ordinary read, so an old frame is
 * never re-analysed. The analysis itself runs detached from the hook (it
 * takes seconds, and a process's hook and tick share one lock), queued per
 * process so frames are analysed one at a time in arrival order.
 *
 * Config: `imageDeviceId`, `resultDeviceId` (required), `targets`/
 * `nextTargetId` (Target objects, managed through api.ts),
 * `maxTextLength` (optional, api.ts), `analyzeTimeoutSeconds` (optional).
 *
 * WEM: an AI/analysis failure is an Error, kept active until the next
 * successful analysis; found Target objects are a one-shot Message (reaches
 * Message Casting Groups the process belongs to); more stored images than
 * IMAGE_WARN_LIMIT is a persistent Warning until they are deleted.
 */

// User decision (AGENTS_TO_DO.md 2026-09-24, Q17): warn above this many
// stored images; nothing is deleted automatically.
const IMAGE_WARN_LIMIT = 200;
// How often the tick re-counts stored images (a directory scan).
const COUNT_INTERVAL_MS = 10_000;
// Default for config.analyzeTimeoutSeconds - above the API's own AI request
// timeout (AI_REQUEST_TIMEOUT_MS), so the API answers (with an error
// result) before this request is abandoned.
const DEFAULT_ANALYZE_TIMEOUT_SECONDS = 40;
// "Bottle x3, Cat" - found instances grouped by target (one entry per instance).
const foundSummary = (found: Array<{ name: string }>) => {
  const counts = new Map<string, number>();
  for (const f of found) counts.set(f.name, (counts.get(f.name) ?? 0) + 1);
  return [...counts].map(([name, n]) => (n > 1 ? `${name} x${n}` : name)).join(", ");
};
// Readings worth analysing: a device's own push, or a simulated upload.
const CAPTURE_SOURCES = new Set(["device-push", "api"]);

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- registry/apiClient/logger types live in nexus-edge's own orchestrator package, not importable from the Library (see processPlugins.ts).
export default function registerAiAnalyzer(register: any, { apiClient, logger }: any): void {
  interface State {
    queue: Promise<void>;
    lastQueued: string | null;
    analyzing: boolean;
    lastError: string | null;
    lastMediaId: string | null;
    lastAnalyzedAt: string | null;
    imageCount: number | null;
    countedAt: number;
  }
  const states = new Map<number, State>();
  const stateOf = (processId: number): State => {
    let s = states.get(processId);
    if (!s) {
      s = {
        queue: Promise.resolve(),
        lastQueued: null,
        analyzing: false,
        lastError: null,
        lastMediaId: null,
        lastAnalyzedAt: null,
        imageCount: null,
        countedAt: 0,
      };
      states.set(processId, s);
    }
    return s;
  };

  // Everything the panel's Last image tab needs to know when to refresh.
  const publishMetrics = (processId: number, s: State) =>
    apiClient
      .setMetrics(processId, {
        analyzing: s.analyzing,
        lastMediaId: s.lastMediaId,
        lastAnalyzedAt: s.lastAnalyzedAt,
        lastError: s.lastError,
        imageCount: s.imageCount,
        imageWarnLimit: IMAGE_WARN_LIMIT,
      })
      .catch((err: unknown) => logger.warn({ err, processId }, "ai-analyzer: setMetrics failed"));

  // WEM state that must persist between events - re-asserted every tick
  // (syncMessages takes the complete active set).
  const syncState = async (process: any, s: State) => {
    const errors = s.lastError ? [{ code: "ai_analysis_failed", level: 1, text: `AI analysis failed: ${s.lastError}` }] : [];
    const warnings =
      s.imageCount !== null && s.imageCount > IMAGE_WARN_LIMIT
        ? [
            {
              code: "image_limit",
              level: 1,
              text: `${s.imageCount} images stored (limit ${IMAGE_WARN_LIMIT}) - delete older ones`,
            },
          ]
        : [];
    await apiClient.syncMessages(process.id, "error", errors);
    await apiClient.syncMessages(process.id, "warning", warnings);
    await apiClient.setCritical(process.id, errors.length > 0);
    await apiClient.setWarning(process.id, warnings.length > 0);
  };

  const analyze = async (process: any, mediaId: string) => {
    const s = stateOf(process.id);
    const { resultDeviceId, analyzeTimeoutSeconds } = process.config;
    s.analyzing = true;
    await publishMetrics(process.id, s);
    try {
      const { result } = await apiClient.request(`/ai-analyzer/${process.id}/analyze`, {
        method: "POST",
        body: JSON.stringify({ mediaId }),
        signal: AbortSignal.timeout((analyzeTimeoutSeconds ?? DEFAULT_ANALYZE_TIMEOUT_SECONDS) * 1000),
      });
      s.lastError = result.status === "error" ? (result.error ?? "unknown error") : null;
      await writeResult(resultDeviceId, { imageId: mediaId, status: result.status, text: result.text, found: result.found.length });
      if (result.status === "ok" && result.found.length > 0) {
        const names = foundSummary(result.found);
        // One-shot notification: a unique code per image, never auto-resolved.
        await apiClient.syncMessages(process.id, "message", [{ code: `found_${mediaId}`, level: 1, text: `Found: ${names}` }], "never");
      }
    } catch (err: any) {
      // The API couldn't even produce an error result (down, timed out) -
      // still tell the camera, so it doesn't wait for its own timeout.
      s.lastError = err?.message ?? String(err);
      logger.warn({ err, processId: process.id, mediaId }, "ai-analyzer: analysis request failed");
      await writeResult(resultDeviceId, { imageId: mediaId, status: "error", text: null, found: 0 });
    } finally {
      s.analyzing = false;
      s.lastMediaId = mediaId;
      s.lastAnalyzedAt = new Date().toISOString();
      s.countedAt = 0; // a new image - recount on the next tick
      await syncState(process, s).catch((err: unknown) => logger.warn({ err }, "ai-analyzer: WEM sync failed"));
      await publishMetrics(process.id, s);
    }
  };

  const writeResult = async (resultDeviceId: number | undefined, value: unknown) => {
    if (resultDeviceId === undefined) return;
    await apiClient
      .setDeviceAuto(resultDeviceId, JSON.stringify(value))
      .catch((err: unknown) => logger.warn({ err, resultDeviceId }, "ai-analyzer: writing the result device failed"));
  };

  register(
    "ai-analyzer",
    async (process: any) => {
      if (process.config.imageDeviceId === undefined) {
        logger.warn({ processId: process.id }, "ai-analyzer process is missing config.imageDeviceId");
        return;
      }
      const s = stateOf(process.id);
      if (Date.now() - s.countedAt >= COUNT_INTERVAL_MS) {
        s.countedAt = Date.now();
        try {
          s.imageCount = (await apiClient.request(`/ai-analyzer/${process.id}/stats`)).count;
        } catch (err) {
          logger.warn({ err, processId: process.id }, "ai-analyzer: counting images failed");
        }
        await publishMetrics(process.id, s);
      }
      await syncState(process, s);
    },
    {
      onDeviceEvent: async (process: any, event: any) => {
        if (event.deviceId !== process.config.imageDeviceId || !CAPTURE_SOURCES.has(event.source)) return;
        const mediaId = event.value;
        if (typeof mediaId !== "string" || mediaId === "") return;
        const s = stateOf(process.id);
        if (s.lastQueued === mediaId) return; // the same capture delivered twice
        s.lastQueued = mediaId;
        // Detached on purpose - see the header comment. The per-process
        // queue keeps analyses sequential.
        s.queue = s.queue
          .then(() => analyze(process, mediaId))
          .catch((err: unknown) => logger.warn({ err, processId: process.id }, "ai-analyzer: analysis crashed"));
      },
    },
  );
}
