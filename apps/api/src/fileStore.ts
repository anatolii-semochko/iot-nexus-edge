// Generic file store (AGENTS.md section 81) - CRUD over a directory of
// small file "entries", no database table. The Media Store (mediaStore.ts)
// is its first consumer; any future feature that keeps a modest number of
// files (hundreds to low thousands per scope) reuses this instead of
// hand-rolling fs code.
//
// Layout: <root>/<scope...>/<entryId>.<part>
//   - entryId starts with its UTC creation time (20260926T071234Z_a1b2), so
//     name order = time order: listing newest-first is one readdir + sort
//     + slice, and an entry's creation time needs no metadata file.
//   - part names one file of the entry: the original ("jpg"), and any
//     derived files consumers add next to it ("preview.jpg", "result.json").
//     Deleting an entry removes every part.
//
// Every path segment is validated (no traversal, no hidden files). Writes
// are atomic (tmp file + rename), so a reader never sees half a file - a
// consumer can use "part X exists" as a state flag (e.g. result.json is
// written last).

import { randomBytes } from "node:crypto";
import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const PART = /^[A-Za-z0-9][A-Za-z0-9_-]{0,31}(\.[A-Za-z0-9_-]{1,16})?$/;
const ENTRY_ID = /^\d{8}T\d{6}Z_[0-9a-f]{4,16}$/;

export class FileStoreError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
  }
}

export interface FileEntry {
  id: string;
  createdAt: string;
  parts: string[];
}

export interface ListOptions<T> {
  offset: number;
  limit: number;
  // Newest first by default; true = oldest first.
  ascending?: boolean;
  // Entries created in [from, to] (ISO strings), compared on the id's own timestamp.
  from?: string;
  to?: string;
  // Sidecar JSON part to read for every candidate entry, handed to `filter`
  // and returned on each item (e.g. "result.json").
  jsonPart?: string;
  filter?: (entry: FileEntry, json: T | null) => boolean;
}

export interface FileStore {
  create(scope: string[], part: string, data: Buffer): Promise<FileEntry>;
  writePart(scope: string[], id: string, part: string, data: Buffer | string): Promise<void>;
  readPart(scope: string[], id: string, part: string): Promise<Buffer>;
  readJson<T>(scope: string[], id: string, part: string): Promise<T | null>;
  get(scope: string[], id: string): Promise<FileEntry | null>;
  list<T>(scope: string[], options: ListOptions<T>): Promise<{ items: Array<FileEntry & { json: T | null }>; total: number }>;
  count(scope: string[]): Promise<number>;
  remove(scope: string[], id: string): Promise<boolean>;
}

export function createFileStore(options: { rootDir: string; maxPartBytes: number }): FileStore {
  const { rootDir, maxPartBytes } = options;

  const scopeDir = (scope: string[]) => {
    for (const s of scope) {
      if (!SEGMENT.test(s)) throw new FileStoreError(`invalid scope segment "${s}"`, 400);
    }
    return path.join(rootDir, ...scope);
  };
  const checkId = (id: string) => {
    if (!ENTRY_ID.test(id)) throw new FileStoreError(`invalid entry id "${id}"`, 400);
  };
  const checkPart = (part: string) => {
    if (!PART.test(part)) throw new FileStoreError(`invalid part name "${part}"`, 400);
  };
  const createdAtOf = (id: string) =>
    `${id.slice(0, 4)}-${id.slice(4, 6)}-${id.slice(6, 8)}T${id.slice(9, 11)}:${id.slice(11, 13)}:${id.slice(13, 15)}Z`;

  async function atomicWrite(file: string, data: Buffer | string): Promise<void> {
    const size = typeof data === "string" ? Buffer.byteLength(data) : data.length;
    if (size > maxPartBytes) throw new FileStoreError(`file exceeds the ${maxPartBytes}-byte limit`, 413);
    const tmp = `${path.dirname(file)}/.tmp-${randomBytes(6).toString("hex")}`;
    await writeFile(tmp, data);
    await rename(tmp, file);
  }

  // entryId -> its parts, for every entry in a scope directory.
  async function scan(scope: string[]): Promise<Map<string, string[]>> {
    let names: string[];
    try {
      names = await readdir(scopeDir(scope));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return new Map();
      throw err;
    }
    const entries = new Map<string, string[]>();
    for (const name of names) {
      const dot = name.indexOf(".");
      if (dot <= 0) continue; // tmp files and anything unexpected start with "." or have no part
      const id = name.slice(0, dot);
      if (!ENTRY_ID.test(id)) continue;
      const parts = entries.get(id) ?? [];
      parts.push(name.slice(dot + 1));
      entries.set(id, parts);
    }
    return entries;
  }

  const store: FileStore = {
    async create(scope, part, data) {
      checkPart(part);
      const dir = scopeDir(scope);
      await mkdir(dir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
      const id = `${stamp}_${randomBytes(3).toString("hex")}`;
      await atomicWrite(path.join(dir, `${id}.${part}`), data);
      return { id, createdAt: createdAtOf(id), parts: [part] };
    },

    async writePart(scope, id, part, data) {
      checkId(id);
      checkPart(part);
      if (!(await store.get(scope, id))) throw new FileStoreError(`entry ${id} not found`, 404);
      await atomicWrite(path.join(scopeDir(scope), `${id}.${part}`), data);
    },

    async readPart(scope, id, part) {
      checkId(id);
      checkPart(part);
      try {
        return await readFile(path.join(scopeDir(scope), `${id}.${part}`));
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") throw new FileStoreError(`${id}.${part} not found`, 404);
        throw err;
      }
    },

    async readJson<T>(scope: string[], id: string, part: string): Promise<T | null> {
      try {
        return JSON.parse((await store.readPart(scope, id, part)).toString("utf8")) as T;
      } catch (err) {
        if (err instanceof FileStoreError && err.statusCode === 404) return null;
        if (err instanceof SyntaxError) return null;
        throw err;
      }
    },

    async get(scope, id) {
      checkId(id);
      const dir = scopeDir(scope);
      let names: string[];
      try {
        names = await readdir(dir);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw err;
      }
      const parts = names.filter((n) => n.startsWith(`${id}.`)).map((n) => n.slice(id.length + 1));
      return parts.length > 0 ? { id, createdAt: createdAtOf(id), parts } : null;
    },

    async list<T>(scope: string[], options: ListOptions<T>) {
      const entries = await scan(scope);
      let ids = [...entries.keys()].sort();
      if (!options.ascending) ids.reverse();
      if (options.from) ids = ids.filter((id) => createdAtOf(id) >= options.from!);
      if (options.to) ids = ids.filter((id) => createdAtOf(id) <= options.to!);

      const toItem = async (id: string) => {
        const entry: FileEntry = { id, createdAt: createdAtOf(id), parts: entries.get(id)! };
        const json = options.jsonPart ? await store.readJson<T>(scope, id, options.jsonPart) : null;
        return { ...entry, json };
      };

      if (!options.filter) {
        const page = await Promise.all(ids.slice(options.offset, options.offset + options.limit).map(toItem));
        return { items: page, total: ids.length };
      }
      // A filter needs every candidate's JSON - fine at this store's scale
      // (hundreds to low thousands of entries per scope).
      const all = await Promise.all(ids.map(toItem));
      const matched = all.filter((item) => options.filter!(item, item.json));
      return { items: matched.slice(options.offset, options.offset + options.limit), total: matched.length };
    },

    async count(scope) {
      return (await scan(scope)).size;
    },

    async remove(scope, id) {
      const entry = await store.get(scope, id);
      if (!entry) return false;
      const dir = scopeDir(scope);
      await Promise.all(entry.parts.map((part) => rm(path.join(dir, `${id}.${part}`), { force: true })));
      return true;
    },
  };
  return store;
}

