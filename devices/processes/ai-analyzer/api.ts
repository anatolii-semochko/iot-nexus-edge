/**
 * "ai-analyzer" process kind - Devices API side (AGENTS.md section 82,
 * AI Analyzing Camera stage 4). Loaded from the CORE Library by apps/api's
 * apiPlugins.ts; everything it needs (pool, Media Store, AI layer, image
 * resizing) arrives in the plugin context - no imports from apps/api.
 *
 * Routes, all scoped to one ai-analyzer process (`:processId`):
 *   POST   /ai-analyzer/:processId/analyze            { mediaId } -> result (idempotent)
 *   GET    /ai-analyzer/:processId/images             history, paged + search/filters
 *   GET    /ai-analyzer/:processId/stats              { count }
 *   GET    /ai-analyzer/:processId/targets            Target objects
 *   POST   /ai-analyzer/:processId/targets            { text }
 *   PATCH  /ai-analyzer/:processId/targets/:targetId  { text?, active? }
 *   DELETE /ai-analyzer/:processId/targets/:targetId
 *
 * Images are the image device's own Media Store entries; this process adds
 * two parts to each: `preview.jpg` (thumbnail) and `result.json` (written
 * last - "has result.json" = analysed). Deleting an image uses the core
 * DELETE /devices/:id/media/:mediaId (removes the whole entry).
 *
 * Target objects live in the process's own config (no table): each change
 * is one atomic SQL statement on that config (not the generic config
 * PATCH, whose shallow merge would replace the whole array), ids come
 * from `nextTargetId` and are never reused - results store them.
 */

// Hard limits requested by the user (AGENTS_TO_DO.md 2026-09-24, Q15).
const TARGET_LIMIT = 100;
const TARGET_TEXT_MAX = 50;
// Default display budget for the AI's text (the camera's 128x32 OLED) -
// overridable per process via config.maxTextLength.
const DEFAULT_MAX_TEXT_LENGTH = 40;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

interface Target {
  id: number;
  text: string;
  active: boolean;
}

interface FoundObject {
  id: number;
  name: string;
  // Normalized 0..1 box (x, y = top-left) - drawn as an SVG overlay in the
  // UI, never burned into the stored image. One FoundObject per visible
  // instance: the same target id repeats for several instances.
  box: { x: number; y: number; w: number; h: number };
}

export interface AnalysisResult {
  status: "ok" | "error";
  text: string | null;
  found: FoundObject[];
  model: string | null;
  latencyMs: number | null;
  // Tokens consumed by this one request, as reported by the provider -
  // stored and shown only; nothing counts or limits it (user decision,
  // AGENTS_TO_DO.md 2026-09-26).
  usage: { inputTokens: number; outputTokens: number; totalTokens: number } | null;
  error: string | null;
  analyzedAt: string;
}

interface AiAnalyzerConfig {
  imageDeviceId?: number;
  resultDeviceId?: number;
  targets?: Target[];
  nextTargetId?: number;
  maxTextLength?: number;
}

// Shape the model must answer with (strict structured output).
const RESULT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["text", "found"],
  properties: {
    text: { type: "string" },
    found: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "x", "y", "w", "h"],
        properties: {
          id: { type: "integer" },
          x: { type: "number" },
          y: { type: "number" },
          w: { type: "number" },
          h: { type: "number" },
        },
      },
    },
  },
};

function buildPrompt(targets: Target[], maxTextLength: number): { instructions: string; prompt: string } {
  const instructions = [
    "You analyse a single photo taken by a small camera.",
    `Answer in English only. "text" is a very short description of what is in the photo, at most ${maxTextLength} characters, no trailing period.`,
    'In "found", list only objects from the provided target list that are clearly visible in the photo, each by its target id,',
    "with a bounding box in normalized image coordinates (0..1): x, y = top-left corner, w, h = width and height.",
    "Add a separate entry for every visible instance - three bottles are three entries with the same target id.",
    "Each box must tightly enclose the whole object and nothing else.",
    'If no target is visible, or the target list is empty, return "found": [].',
  ].join(" ");
  const list = targets.length > 0 ? targets.map((t) => `${t.id}: ${t.text}`).join("\n") : "(empty)";
  return { instructions, prompt: `Target list (id: description):\n${list}` };
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, Number.isFinite(n) ? n : 0));

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the api.ts plugin contract types live in apps/api, not importable from the Library (see apiPlugins.ts).
export default async function aiAnalyzerApi(app: any, ctx: any): Promise<void> {
  const { pool, media, ai, resizeJpeg, previewMaxSide } = ctx;

  async function loadConfig(processId: string): Promise<{ id: number; config: AiAnalyzerConfig } | null> {
    const { rows } = await pool.query("SELECT id, config FROM processes WHERE id = $1 AND kind = 'ai-analyzer'", [processId]);
    return rows[0] ?? null;
  }

  async function requireProcess(request: any, reply: any) {
    const proc = await loadConfig(request.params.processId);
    if (!proc) {
      reply.code(404).send({ error: "ai-analyzer process not found" });
      return null;
    }
    if (proc.config.imageDeviceId === undefined) {
      reply.code(409).send({ error: "process config has no imageDeviceId" });
      return null;
    }
    return proc;
  }

  const storeError = (reply: any, err: any) => {
    if (typeof err?.statusCode === "number") return reply.code(err.statusCode).send({ error: err.message });
    throw err;
  };

  app.post("/ai-analyzer/:processId/analyze", async (request: any, reply: any) => {
    const proc = await requireProcess(request, reply);
    if (!proc) return;
    const mediaId = request.body?.mediaId;
    if (typeof mediaId !== "string" || mediaId === "") return reply.code(400).send({ error: "mediaId is required" });

    const scope = media.scope(proc.config.imageDeviceId);
    let entry;
    try {
      entry = await media.store.get(scope, mediaId);
    } catch (err) {
      return storeError(reply, err);
    }
    if (!entry) return reply.code(404).send({ error: "image not found" });

    // Idempotent: a frame is analysed (and billed) once, whatever retries.
    const existing = await media.store.readJson(scope, mediaId, "result.json");
    if (existing) return { mediaId, result: existing };

    const originalPart = media.originalPartOf(entry);
    const original: Buffer = await media.store.readPart(scope, mediaId, originalPart);
    try {
      await media.store.writePart(scope, mediaId, "preview.jpg", await resizeJpeg(original, previewMaxSide));
    } catch (err) {
      request.log.warn({ err, mediaId }, "ai-analyzer: preview generation failed");
    }

    const targets = (proc.config.targets ?? []).filter((t) => t.active);
    const maxTextLength = proc.config.maxTextLength ?? DEFAULT_MAX_TEXT_LENGTH;
    const started = Date.now();
    let result: AnalysisResult;
    const provider = ai.getVisionProvider();
    if (!provider) {
      result = {
        status: "error",
        text: null,
        found: [],
        model: null,
        latencyMs: null,
        usage: null,
        error: "AI is not configured (OPENAI_API_KEY)",
        analyzedAt: new Date().toISOString(),
      };
    } else {
      try {
        const { instructions, prompt } = buildPrompt(targets, maxTextLength);
        const answer = await provider.analyzeImage({
          image: await resizeJpeg(original, ai.imageMaxSide),
          mimeType: "image/jpeg",
          instructions,
          prompt,
          schemaName: "photo_analysis",
          schema: RESULT_SCHEMA,
        });
        const byId = new Map(targets.map((t) => [t.id, t]));
        // One entry per visible instance - the same target id may repeat
        // (several bottles); only ids the model invented are dropped.
        const found: FoundObject[] = [];
        for (const f of answer.output.found as Array<{ id: number; x: number; y: number; w: number; h: number }>) {
          const target = byId.get(f.id);
          if (!target) continue;
          found.push({ id: f.id, name: target.text, box: { x: clamp01(f.x), y: clamp01(f.y), w: clamp01(f.w), h: clamp01(f.h) } });
        }
        result = {
          status: "ok",
          text: String(answer.output.text ?? "").slice(0, maxTextLength),
          found,
          model: answer.model,
          latencyMs: answer.latencyMs,
          usage: answer.usage,
          error: null,
          analyzedAt: new Date().toISOString(),
        };
      } catch (err: any) {
        request.log.warn({ err, mediaId }, "ai-analyzer: analysis failed");
        result = {
          status: "error",
          text: null,
          found: [],
          model: null,
          latencyMs: Date.now() - started,
          usage: null,
          error: err?.message ?? String(err),
          analyzedAt: new Date().toISOString(),
        };
      }
    }
    await media.store.writePart(scope, mediaId, "result.json", JSON.stringify(result));
    return { mediaId, result };
  });

  app.get("/ai-analyzer/:processId/images", async (request: any, reply: any) => {
    const proc = await requireProcess(request, reply);
    if (!proc) return;
    const q = request.query;
    const offset = Math.max(0, Number(q.offset ?? 0) || 0);
    const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(q.limit ?? DEFAULT_PAGE_SIZE) || DEFAULT_PAGE_SIZE));
    const search = typeof q.search === "string" ? q.search.trim().toLowerCase() : "";
    const targetId = q.targetId !== undefined && q.targetId !== "" ? Number(q.targetId) : null;
    const filtering = search !== "" || q.found || q.status || targetId !== null;
    try {
      return await media.store.list(media.scope(proc.config.imageDeviceId), {
        offset,
        limit,
        from: q.from || undefined,
        to: q.to || undefined,
        jsonPart: "result.json",
        filter: filtering
          ? (_entry: unknown, r: AnalysisResult | null) => {
              if (q.status === "error" && r?.status !== "error") return false;
              if (q.status === "ok" && r?.status !== "ok") return false;
              if (q.found === "yes" && !(r?.found?.length > 0)) return false;
              if (q.found === "no" && r?.found?.length > 0) return false;
              if (targetId !== null && !r?.found?.some((f) => f.id === targetId)) return false;
              if (search !== "") {
                const haystack = [r?.text ?? "", ...(r?.found ?? []).map((f) => f.name)].join(" ").toLowerCase();
                if (!haystack.includes(search)) return false;
              }
              return true;
            }
          : undefined,
      });
    } catch (err) {
      return storeError(reply, err);
    }
  });

  app.get("/ai-analyzer/:processId/stats", async (request: any, reply: any) => {
    const proc = await requireProcess(request, reply);
    if (!proc) return;
    return { count: await media.store.count(media.scope(proc.config.imageDeviceId)) };
  });

  // --- Target objects -------------------------------------------------

  app.get("/ai-analyzer/:processId/targets", async (request: any, reply: any) => {
    const proc = await loadConfig(request.params.processId);
    if (!proc) return reply.code(404).send({ error: "ai-analyzer process not found" });
    return { items: proc.config.targets ?? [], limit: TARGET_LIMIT };
  });

  const validText = (text: unknown) => typeof text === "string" && text.trim() !== "" && text.trim().length <= TARGET_TEXT_MAX;

  app.post("/ai-analyzer/:processId/targets", async (request: any, reply: any) => {
    const text = request.body?.text;
    if (!validText(text)) return reply.code(400).send({ error: `text is required, 1-${TARGET_TEXT_MAX} characters` });
    // One statement: take nextTargetId, append, bump it - never two
    // concurrent adds with the same id, never over the limit.
    const { rows } = await pool.query(
      `UPDATE processes
          SET config = jsonb_set(
                jsonb_set(config, '{targets}',
                  COALESCE(config->'targets', '[]'::jsonb)
                  || jsonb_build_array(jsonb_build_object(
                       'id', COALESCE((config->>'nextTargetId')::int, 1), 'text', $2::text, 'active', true))),
                '{nextTargetId}', to_jsonb(COALESCE((config->>'nextTargetId')::int, 1) + 1)),
              updated_at = now()
        WHERE id = $1 AND kind = 'ai-analyzer'
          AND jsonb_array_length(COALESCE(config->'targets', '[]'::jsonb)) < $3
        RETURNING config->'targets' AS targets`,
      [request.params.processId, text.trim(), TARGET_LIMIT],
    );
    if (!rows[0]) {
      const proc = await loadConfig(request.params.processId);
      if (!proc) return reply.code(404).send({ error: "ai-analyzer process not found" });
      return reply.code(409).send({ error: `target limit reached (${TARGET_LIMIT})` });
    }
    return reply.code(201).send({ item: rows[0].targets[rows[0].targets.length - 1] });
  });

  app.patch("/ai-analyzer/:processId/targets/:targetId", async (request: any, reply: any) => {
    const patch: Partial<Target> = {};
    if (request.body?.text !== undefined) {
      if (!validText(request.body.text)) return reply.code(400).send({ error: `text must be 1-${TARGET_TEXT_MAX} characters` });
      patch.text = request.body.text.trim();
    }
    if (request.body?.active !== undefined) {
      if (typeof request.body.active !== "boolean") return reply.code(400).send({ error: "active must be a boolean" });
      patch.active = request.body.active;
    }
    if (Object.keys(patch).length === 0) return reply.code(400).send({ error: "nothing to update" });
    const { rows } = await pool.query(
      `UPDATE processes
          SET config = jsonb_set(config, '{targets}', (
                SELECT COALESCE(jsonb_agg(CASE WHEN (t->>'id')::int = $2 THEN t || $3::jsonb ELSE t END ORDER BY ord), '[]'::jsonb)
                  FROM jsonb_array_elements(COALESCE(config->'targets', '[]'::jsonb)) WITH ORDINALITY AS e(t, ord))),
              updated_at = now()
        WHERE id = $1 AND kind = 'ai-analyzer'
          AND EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(config->'targets', '[]'::jsonb)) t WHERE (t->>'id')::int = $2)
        RETURNING config->'targets' AS targets`,
      [request.params.processId, Number(request.params.targetId), JSON.stringify(patch)],
    );
    if (!rows[0]) return reply.code(404).send({ error: "target not found" });
    return { item: rows[0].targets.find((t: Target) => t.id === Number(request.params.targetId)) };
  });

  app.delete("/ai-analyzer/:processId/targets/:targetId", async (request: any, reply: any) => {
    const { rowCount } = await pool.query(
      `UPDATE processes
          SET config = jsonb_set(config, '{targets}', (
                SELECT COALESCE(jsonb_agg(t ORDER BY ord), '[]'::jsonb)
                  FROM jsonb_array_elements(COALESCE(config->'targets', '[]'::jsonb)) WITH ORDINALITY AS e(t, ord)
                 WHERE (t->>'id')::int <> $2)),
              updated_at = now()
        WHERE id = $1 AND kind = 'ai-analyzer'
          AND EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(config->'targets', '[]'::jsonb)) t WHERE (t->>'id')::int = $2)`,
      [request.params.processId, Number(request.params.targetId)],
    );
    return rowCount ? reply.code(204).send() : reply.code(404).send({ error: "target not found" });
  });
}
