#!/usr/bin/env node
// The English texts left outside t(...) (iot AGENTS_TO_DO.md 2026-10-31) - the list to look at by hand
// after scripts/i18n-wrap.mjs: string literals that read like words (a space, or a capitalised word),
// not an import, a class, a key, an id, a URL, a comparison, a case or an argument of t / console / an
// Error. Some are data, not interface text - the list is for a person to judge.
// Usage: node scripts/i18n-leftovers.mjs [--count] <file or dir>...
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const pnpm = path.join(ROOT, "node_modules/.pnpm");
const pkgDir = (name) => path.join(pnpm, fs.readdirSync(pnpm).filter((d) => d.startsWith(name.replace("/", "+") + "@")).sort().pop(), "node_modules", name);
const require = createRequire(import.meta.url);
import { looksLikeText, textContext } from "./i18n-text.mjs";
const { parse } = require(pkgDir("@babel/parser"));
const traverse = require(pkgDir("@babel/traverse")).default;

const args = process.argv.slice(2);
const countOnly = args.includes("--count");
const targets = args.filter((a) => !a.startsWith("--"));

const walk = (p, out = []) => {
  const st = fs.statSync(p);
  if (st.isFile()) {
    if (/\.(jsx|js)$/.test(p) && !/\.test\./.test(p)) out.push(p);
    return out;
  }
  for (const e of fs.readdirSync(p)) {
    if (["node_modules", "dist", "locales", "i18n", "__tests__"].includes(e) || e.startsWith(".")) continue;
    walk(path.join(p, e), out);
  }
  return out;
};

let total = 0;
for (const file of targets.flatMap((tgt) => walk(path.resolve(tgt)))) {
  const src = fs.readFileSync(file, "utf8");
  let ast;
  try {
    ast = parse(src, { sourceType: "module", plugins: ["jsx"] });
  } catch {
    continue;
  }
  const found = [];
  const consider = (p, value) => {
    if (!looksLikeText(value) || !textContext(p)) return;
    found.push(`${p.node.loc.start.line}: ${JSON.stringify(value.length > 90 ? value.slice(0, 90) + "..." : value)}`);
  };
  traverse(ast, {
    StringLiteral(p) {
      consider(p, p.node.value);
    },
    TemplateLiteral(p) {
      if (p.parentPath.isTaggedTemplateExpression()) return;
      const text = p.node.quasis.map((q) => q.value.cooked).join("…");
      consider(p, text);
    },
  });
  if (!found.length) continue;
  total += found.length;
  console.log(`${path.relative(ROOT, file)}: ${found.length}`);
  if (!countOnly) for (const f of found) console.log(`  ${f}`);
}
console.log(`${total} left`);
