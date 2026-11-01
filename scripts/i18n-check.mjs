#!/usr/bin/env node
// The interface's translations (iot AGENTS_TO_DO.md 2026-10-31): every literal t('...') / t("...") /
// t(`...`) key in apps/ui/src (namespace `core`), devices/*/*/ui and plugins/*/ui (the package's
// namespace - its folder; its keys may also be in `core`), checked against each language's file.
// Usage: node scripts/i18n-check.mjs [--write] [--lang uk,de,es] [--plugins <a target project's plugins dir>]
//   --write  adds the missing keys to each file with an empty value ("" = shown in English) - the list
//            to translate; the keys no longer in the code are reported (not removed).
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const args = process.argv.slice(2);
const write = args.includes("--write");
const langArg = args[args.indexOf("--lang") + 1];
const LANGS = args.includes("--lang") ? langArg.split(",") : ["uk", "de", "es"];

const walk = (dir, out = []) => {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === "dist" || e.name.startsWith(".")) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(jsx?|tsx?)$/.test(e.name) && !/\.test\./.test(e.name)) out.push(p);
  }
  return out;
};
// t('a'), t("a"), t(`a`) (no ${} inside), i18n.t(...), {t('...', {...})}; tKey('a') - a text kept in
// data and translated where shown (src/i18n tKey)
const KEY_RE = /\b(?:t|tr|tKey)\(\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|`((?:[^`\\$]|\\.)*)`)/g;
const unescape = (s) => s.replace(/\\(.)/g, "$1");
const keysIn = (files) => {
  const keys = new Set();
  for (const f of files) for (const m of fs.readFileSync(f, "utf8").matchAll(KEY_RE)) keys.add(unescape(m[1] ?? m[2] ?? m[3]));
  return keys;
};

// the namespaces: core and each package with a ui/ folder
const dirsIn = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name) : []);
const spaces = [{ ns: "core", files: walk(path.join(ROOT, "apps/ui/src")), dir: path.join(ROOT, "apps/ui/src/i18n/locales") }];
for (const kind of dirsIn(path.join(ROOT, "devices")))
  for (const pkg of dirsIn(path.join(ROOT, "devices", kind))) {
    const ui = path.join(ROOT, "devices", kind, pkg, "ui");
    if (fs.existsSync(ui)) spaces.push({ ns: pkg, files: walk(ui), dir: path.join(ui, "locales") });
  }
// the core's plugins/ and a target project's (--plugins <dir>, e.g. ../nexus-edge-aquarium/plugins)
const pluginRoots = [path.join(ROOT, "plugins")];
for (let i = 0; i < args.length; i++) if (args[i] === "--plugins") pluginRoots.push(path.resolve(args[i + 1]));
for (const plugins of pluginRoots)
  for (const pkg of dirsIn(plugins)) {
    const ui = path.join(plugins, pkg, "ui");
    if (fs.existsSync(ui)) spaces.push({ ns: pkg, files: walk(ui), dir: path.join(ui, "locales") });
  }

const read = (f) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : {});
const allKeys = new Set(spaces.flatMap(({ files }) => [...keysIn(files)]));
const coreOf = Object.fromEntries(LANGS.map((l) => [l, read(path.join(spaces[0].dir, `${l}.json`))]));
let missingTotal = 0;
for (const { ns, files, dir } of spaces) {
  const keys = keysIn(files);
  if (!keys.size) continue;
  for (const lang of LANGS) {
    const file = path.join(dir, `${lang}.json`);
    const data = read(file);
    // a package's key translated in the core counts
    const missing = [...keys].filter((k) => !data[k] && !(ns !== "core" && coreOf[lang][k]));
    // a core key is stale only when no namespace uses it (the packages' shared words live in the core)
    const stale = Object.keys(data).filter((k) => !keys.has(k) && !(ns === "core" && allKeys.has(k)));
    missingTotal += missing.length;
    if (missing.length || stale.length) console.log(`${ns} ${lang}: ${keys.size} keys, ${missing.length} untranslated${stale.length ? `, ${stale.length} not in the code` : ""}`);
    if (write && missing.some((k) => !(k in data))) {
      for (const k of missing) if (!(k in data)) data[k] = "";
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(file, JSON.stringify(Object.fromEntries(Object.entries(data).sort(([a], [b]) => a.localeCompare(b))), null, 2) + "\n");
    }
  }
}
console.log(missingTotal ? `${missingTotal} untranslated in all` : "all translated");
process.exitCode = 0;
