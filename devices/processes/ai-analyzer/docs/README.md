# AI Analyzer (process kind)

CORE Library process kind, loaded automatically in every project
(orchestrator `devices/processes/*/process.ts`, api `.../api.ts`, UI
`.../ui/register.js` - AGENTS.md section 82). Built for the AI Analyzing
Camera (AGENTS_TO_DO.md 2026-09-24/26); works with any image-caster.

## What it does

For every **new** image an image-caster device sends (a device push or a
simulated upload - never a re-read of an old value):

1. thumbnail `preview.jpg` next to the image in the Media Store;
2. a smaller copy (`AI_IMAGE_MAX_SIDE`) sent to the AI layer with the
   active Target objects: a short English description (at most
   `maxTextLength` chars) plus which targets are visible and where
   (normalized boxes);
3. `result.json` stored next to the image - text, found objects (names
   snapshotted, so renames/deletes don't rewrite history), model, latency
   and **tokens used** (shown only, never counted or limited);
4. `{"imageId", "status", "text", "found": <count>}` written to the
   result-receiver device (the camera's display);
5. WEM: failure -> Error (until the next success); targets found ->
   Message (Message Casting Groups); more than 200 stored images ->
   Warning until older ones are deleted (nothing is deleted
   automatically).

Each image is analysed once (`result.json` makes the analyze call
idempotent); images are analysed one at a time per process.

## Config (`processes.config`)

| Field | Required | Meaning |
|---|---|---|
| `imageDeviceId` | yes | image-caster Device to analyse |
| `resultDeviceId` | no | result-receiver Device to write results to |
| `targets`, `nextTargetId` | - | Target objects - managed from the panel (max 100, text <= 50 chars) |
| `maxTextLength` | no | AI text length budget, default 40 |
| `analyzeTimeoutSeconds` | no | how long the process waits for one analysis, default 40 |

AI settings are global, in `.env`: `OPENAI_API_KEY`, `OPENAI_MODEL`
(default `gpt-4.1-mini`), `AI_REQUEST_TIMEOUT_MS`, `AI_IMAGE_MAX_SIDE`.

## Panel

- **Last image** - newest image with red boxes and its result; follows
  new analyses live.
- **Images** - history: search (result text, object names), date range,
  targets found / none, analysed / failed, a specific object; preview with
  boxes, text, objects, tokens; delete.
- **Target objects** - add, rename (click the text), activate/deactivate,
  delete; search and paging.
