import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { config } from "../config.js";
import { logger } from "../logger.js";

// The documentation the assistant reads (its tools `docs.search` /
// `docs.read`; nexus-edge-aquarium AGENTS_TO_DO.md 2026-10-17): every
// Markdown file under the configured sources (`config.ai.docsSources` -
// the core's AGENTS.md and docs, the Library DNPs, the project's docs, the
// project's plugins with their node docs and prompts), split into sections
// by its headings. Search - plain term scoring (a heading's words weigh
// more; BM25 - rare words count more, a long section doesn't win by length),
// no embeddings: light enough for a Raspberry Pi. Built once, on
// first use (the files change only with a deployment). A section's id -
// "<source>:<file>#<n>" (its order in the file). The future website's
// documentation is one more source of the same shape.

export interface DocSection {
  id: string;
  source: string;
  file: string;
  title: string; // the heading path, e.g. "AGENTS.md > 82. AI layer"
  text: string;
}

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", "archive-development"]);
const MAX_FILES = 2000;

let index: Promise<DocSection[]> | null = null;

async function markdownFiles(dir: string, out: string[] = []): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out; // a source that isn't there (not mounted) - nothing from it
  }
  for (const e of entries) {
    if (out.length >= MAX_FILES) break;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) await markdownFiles(p, out);
    } else if (e.name.toLowerCase().endsWith(".md")) out.push(p);
  }
  return out;
}

// a file's sections: each heading (# to ####) starts one; the text before the first - the file's intro
function sectionsOf(source: string, file: string, content: string): DocSection[] {
  const out: DocSection[] = [];
  const trail: string[] = [];
  let title = path.basename(file);
  let lines: string[] = [];
  const flush = () => {
    const text = lines.join("\n").trim();
    if (text) out.push({ id: `${source}:${file}#${out.length}`, source, file, title, text });
    lines = [];
  };
  for (const line of content.split("\n")) {
    const m = /^(#{1,4})\s+(.*)$/.exec(line);
    if (m) {
      flush();
      trail.length = m[1].length - 1;
      trail[m[1].length - 1] = m[2].trim();
      // the file's name, then the heading path (an H1 repeating the file's name - once)
      const heads = trail.filter(Boolean).filter((h, i) => !(i === 0 && h.toLowerCase() === path.basename(file).toLowerCase()));
      title = [path.basename(file), ...heads].join(" > ");
      continue;
    }
    lines.push(line);
  }
  flush();
  return out;
}

function sections(): Promise<DocSection[]> {
  index ??= (async () => {
    const all: DocSection[] = [];
    for (const { label, dir } of config.ai.docsSources) {
      for (const file of await markdownFiles(dir)) {
        const content = await readFile(file, "utf8").catch(() => "");
        all.push(...sectionsOf(label, path.relative(dir, file), content));
      }
    }
    logger.info({ sections: all.length }, "AI docs index built");
    return all;
  })();
  return index;
}

const terms = (text: string): string[] => text.toLowerCase().match(/[\p{L}\p{N}_-]{3,}/gu) ?? [];

// BM25 constants - the usual ones
const K1 = 1.2;
const B = 0.75;

/** The sections best matching `query` (optionally one source), with a snippet each. */
export async function searchDocs(query: string, options: { source?: string; limit: number }): Promise<{ id: string; title: string; snippet: string; score: number }[]> {
  const words = [...new Set(terms(query))];
  if (words.length === 0) return [];
  const pool = (await sections()).filter((s) => !options.source || s.source === options.source);
  if (pool.length === 0) return [];
  const docs = pool.map((s) => ({ s, title: s.title.toLowerCase(), tokens: terms(s.text) }));
  const avgLen = docs.reduce((a, d) => a + d.tokens.length, 0) / docs.length || 1;
  // a word's document frequency - over the sections' text and title
  const df = new Map(words.map((w) => [w, docs.filter((d) => d.title.includes(w) || d.tokens.includes(w)).length]));
  const scored = docs
    .map((d) => {
      let score = 0;
      for (const w of words) {
        const n = df.get(w) ?? 0;
        if (n === 0) continue;
        const idf = Math.log(1 + (docs.length - n + 0.5) / (n + 0.5));
        const tf = d.tokens.filter((t) => t === w).length;
        score += idf * ((tf * (K1 + 1)) / (tf + K1 * (1 - B + (B * d.tokens.length) / avgLen)));
        if (d.title.includes(w)) score += idf; // a heading's word - as much again
      }
      return { s: d.s, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, options.limit);
  return scored.map(({ s, score }) => {
    const text = s.text.replace(/\s+/g, " ");
    const lower = text.toLowerCase();
    const at = Math.max(0, lower.indexOf(words.find((w) => lower.includes(w)) ?? "") - 60);
    return { id: s.id, title: s.title, snippet: text.slice(at, at + 240), score: Math.round(score * 100) / 100 };
  });
}

/** One section by its id (null - not there). */
export async function readDoc(id: string): Promise<DocSection | null> {
  return (await sections()).find((s) => s.id === id) ?? null;
}

/** The sources and their section counts. */
export async function docSources(): Promise<{ source: string; sections: number }[]> {
  const all = await sections();
  return config.ai.docsSources.map(({ label }) => ({ source: label, sections: all.filter((s) => s.source === label).length }));
}
