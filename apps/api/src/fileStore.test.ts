import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createFileStore, FileStoreError, type FileStore } from "./fileStore.js";

let root: string;
let store: FileStore;
const scope = ["device-7"];

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "filestore-"));
  store = createFileStore({ rootDir: root, maxPartBytes: 1024 });
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("fileStore", () => {
  it("creates an entry, adds parts, reads them back", async () => {
    const entry = await store.create(scope, "jpg", Buffer.from("image"));
    expect(entry.id).toMatch(/^\d{8}T\d{6}Z_[0-9a-f]{6}$/);
    expect(entry.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);

    await store.writePart(scope, entry.id, "result.json", JSON.stringify({ text: "a cat" }));
    expect((await store.readPart(scope, entry.id, "jpg")).toString()).toBe("image");
    expect(await store.readJson(scope, entry.id, "result.json")).toEqual({ text: "a cat" });
    expect((await store.get(scope, entry.id))?.parts.sort()).toEqual(["jpg", "result.json"]);
    // No tmp files left behind by the atomic writes.
    expect((await readdir(path.join(root, ...scope))).every((n) => !n.startsWith("."))).toBe(true);
  });

  it("lists newest first with paging, date range and a JSON filter", async () => {
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const e = await store.create(scope, "jpg", Buffer.from(String(i)));
      await store.writePart(scope, e.id, "result.json", JSON.stringify({ found: i === 1 }));
      ids.push(e.id);
    }
    const page = await store.list(scope, { offset: 0, limit: 2 });
    expect(page.total).toBe(3);
    expect(page.items.map((i) => i.id)).toEqual([...ids].sort().reverse().slice(0, 2));

    const found = await store.list<{ found: boolean }>(scope, {
      offset: 0,
      limit: 10,
      jsonPart: "result.json",
      filter: (_e, json) => json?.found === true,
    });
    expect(found.total).toBe(1);
    expect(found.items[0].json).toEqual({ found: true });

    const none = await store.list(scope, { offset: 0, limit: 10, from: "2999-01-01T00:00:00Z" });
    expect(none.total).toBe(0);
    expect(await store.count(scope)).toBe(3);
    expect(await store.count(["device-empty"])).toBe(0);
  });

  it("removes every part of an entry", async () => {
    const e = await store.create(scope, "jpg", Buffer.from("x"));
    await store.writePart(scope, e.id, "preview.jpg", Buffer.from("p"));
    expect(await store.remove(scope, e.id)).toBe(true);
    expect(await store.get(scope, e.id)).toBeNull();
    expect(await store.remove(scope, e.id)).toBe(false);
  });

  it("rejects traversal, bad ids and oversize files", async () => {
    await expect(store.create(["..", "etc"], "jpg", Buffer.from("x"))).rejects.toBeInstanceOf(FileStoreError);
    await expect(store.readPart(scope, "../../etc/passwd", "jpg")).rejects.toMatchObject({ statusCode: 400 });
    await expect(store.create(scope, "../x", Buffer.from("x"))).rejects.toMatchObject({ statusCode: 400 });
    await expect(store.create(scope, "jpg", Buffer.alloc(2048))).rejects.toMatchObject({ statusCode: 413 });
    await expect(store.readPart(scope, "20260101T000000Z_abcd", "jpg")).rejects.toMatchObject({ statusCode: 404 });
    await expect(store.writePart(scope, "20260101T000000Z_abcd", "result.json", "{}")).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});
