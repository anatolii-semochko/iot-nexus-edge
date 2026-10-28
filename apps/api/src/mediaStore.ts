// Media Store (AGENTS.md section 81) - device media (camera frames today)
// on the generic file store (fileStore.ts). Owned by the Devices API: the
// gateway uploads blobs here (routes/media.ts), processes and the UI read
// through the same routes - nobody touches the directory directly.
//
// One scope per Device: <MEDIA_DIR>/device-<id>/ - keyed by the registry
// id, not the device's name, so a rename never orphans its history. A
// Media Store id (the device's value) is the file store's entry id; the
// uploaded file is its `original.<ext>` part, and consumers add their own
// derived parts next to it (e.g. "preview.jpg", "result.json").

import { config } from "./config.js";
import { createFileStore, type FileEntry } from "./fileStore.js";

export const mediaStore = createFileStore({ rootDir: config.media.dir, maxPartBytes: config.media.maxFileBytes });

export const mediaScope = (deviceId: number) => [`device-${deviceId}`];

// A node's own files (its photo - AGENTS_TO_DO.md 2026-10-20, X1): <MEDIA_DIR>/node-<id>/.
export const nodeMediaScope = (nodeId: number) => [`node-${nodeId}`];

// A plugin's own files (not a device's), e.g. an aquarium's photo gallery:
// <MEDIA_DIR>/plugin-<plugin>/<key...>/ - its own top-level directory, so
// it never mixes with the device scopes. `key` segments are the plugin's
// choice (ids, never display names); the file store validates them.
export const pluginMediaScope = (plugin: string, ...key: string[]) => [`plugin-${plugin}`, ...key];

const ORIGINAL = "original";

// Media types this store accepts from devices and uploads, by extension.
export const MEDIA_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  json: "application/json",
};

export function extensionForMimeType(mimeType: string): string | undefined {
  return Object.entries(MEDIA_TYPES).find(([, type]) => type === mimeType)?.[0];
}

export function contentTypeForPart(part: string): string {
  return MEDIA_TYPES[part.slice(part.lastIndexOf(".") + 1)] ?? "application/octet-stream";
}

export function originalPartName(ext: string): string {
  return `${ORIGINAL}.${ext}`;
}

export function originalPartOf(entry: FileEntry): string | undefined {
  return entry.parts.find((p) => p.startsWith(`${ORIGINAL}.`));
}
