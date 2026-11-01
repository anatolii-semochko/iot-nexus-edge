#!/usr/bin/env node
// Fills translations into a namespace's language files from a JSON of {lang: {key: text}} (iot
// AGENTS_TO_DO.md 2026-10-31) - the translation pass writes them; existing non-empty values are kept
// unless --force. Usage: node scripts/i18n-fill.mjs <locales dir> <translations.json> [--force]
import fs from "node:fs";
import path from "node:path";

const [dir, src, flag] = process.argv.slice(2);
const force = flag === "--force";
const all = JSON.parse(fs.readFileSync(src, "utf8"));
for (const [lang, texts] of Object.entries(all)) {
  const file = path.join(dir, `${lang}.json`);
  const data = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
  let n = 0;
  for (const [k, v] of Object.entries(texts)) if (v && (force || !data[k])) ((data[k] = v), n++);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(Object.fromEntries(Object.entries(data).sort(([a], [b]) => a.localeCompare(b))), null, 2) + "\n");
  console.log(`${file}: ${n} filled`);
}
