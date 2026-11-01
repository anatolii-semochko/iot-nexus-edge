#!/usr/bin/env node
// Wraps an interface's visible English texts in t(...) (iot AGENTS_TO_DO.md 2026-10-31, multilingual
// Nexus Edge) - a codemod run once per file and again on new code; the formatting kept (edits by
// position, prettier after). What it wraps:
//   - JSX text ("Save", "No data yet.") -> {t('Save')}
//   - the texts of the props people read (title, label, placeholder, aria-label, alt, hint, ...) -
//     a string, or a string branch of `a ? 'x' : 'y'` / `a && 'x'`
//   - a child expression's string branches ({busy ? 'Saving' : 'Save'})
//   - such props of an object literal, at module level too ({ title: 'Delete the card', ... }) - a language
//     change loads the page again (src/i18n setLanguage), so a module's texts are built in it
// Not wrapped: units and symbols (kW, %, ->), texts in <code> / <pre> / <style>, strings in other calls
// (scripts/i18n-leftovers.mjs lists what is left to look at). A file with a local `t` gets `tr` instead.
// A core file imports `t` from src/i18n; a package's (devices/<kind>/<pkg>/ui, plugins/<pkg>/ui) makes
// its own: `const t = packageT('<pkg>')`.
// Usage: node scripts/i18n-wrap.mjs [--dry] <file or dir>...
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const pnpm = path.join(ROOT, "node_modules/.pnpm");
const pkgDir = (name) => {
  const dir = fs.readdirSync(pnpm).filter((d) => d.startsWith(name.replace("/", "+") + "@")).sort().pop();
  return path.join(pnpm, dir, "node_modules", name);
};
const require = createRequire(import.meta.url);
const { parse } = require(pkgDir("@babel/parser"));
const traverse = require(pkgDir("@babel/traverse")).default;
import { looksLikeText, textContext } from "./i18n-text.mjs";

const args = process.argv.slice(2);
const dry = args.includes("--dry");
// --loose: also every other literal the leftovers' rules call a text (scripts/i18n-text.mjs)
const loose = args.includes("--loose");
const targets = args.filter((a) => !a.startsWith("--"));

// the props whose text people read
const PROPS = new Set([
  "title", "label", "placeholder", "aria-label", "alt", "hint", "confirmLabel", "cancelLabel", "emptyText",
  "helpText", "header", "subtitle", "caption", "description", "tooltip", "legend", "noun", "rootLabel",
  "emptyLabel", "unitLabel", "prefix", "suffix", "text", "body", "message", "note",
]);
// object literal keys inside a function whose string is a visible text
const OBJ_KEYS = new Set(["title", "body", "label", "confirmLabel", "placeholder", "hint", "header", "description", "tooltip", "text", "message", "caption"]);
const SKIP_PARENTS = new Set(["code", "pre", "kbd", "style", "script", "samp"]);
// units, symbols and the like - never keys
const UNITS = new Set(
  ("kW kWh W Wh MW MWh GW GWh V mV A mA Hz kHz °C °F ° % ‰ m/s km/h ct/kWh EUR € $ mm cm m km l L ml mL hPa Pa bar ppm pH " +
    "lx lux min s h d ms kg g mg mg/l mg/L ml/min l/min l/h m³ m³/h KB MB GB TB kWh/m² W/m² MJ/m² dB dBm RSSI SNR COP UTC " +
    "kWh/d Wh/d x × µS/cm µS mS/cm °dH dKH GH KH TDS ORP NO3 PO4 CO2 O2 Fe K Mg Ca rpm N/A ID IDs URL API MQTT CAN JSON " +
    "CSV YAML OK EdgeX WEM DNP PV AI UI Wi-Fi RGB RGBW UV IR LED LEDs PWM").split(/\s+/),
);
const hasLetters = (s) => /\p{L}/u.test(s);
const looksLikeCode = (s) => /^[a-z0-9_.:/-]+$/.test(s) && !/\s/.test(s) && s.length > 0;
const isText = (s, { strict = false } = {}) => {
  const v = s.replace(/\s+/g, " ").trim();
  if (!v || !hasLetters(v) || UNITS.has(v)) return false;
  if (/^[\p{L}°µ²³/%.-]{1,4}$/u.test(v) && !/^[A-Z][a-z]+$/.test(v) && !/^[a-z]{2,}$/.test(v)) return false;
  if (strict && looksLikeCode(v)) return false;
  if (/^(https?:|\/\S|#|\.\S|[a-z]+:\/\/)/.test(v) || /\.(png|svg|jpg|js|jsx|ts|json|md)$/.test(v)) return false;
  return true;
};
const q = (s) => `'${s.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, "\\n")}'`;

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

// a package's namespace - its folder, wherever the repo is (a target project's plugins too)
const nsOf = (file) => {
  const m = file.match(/[\\/]devices[\\/][^\\/]+[\\/]([^\\/]+)[\\/]ui[\\/]/) ?? file.match(/[\\/]plugins[\\/]([^\\/]+)[\\/]ui[\\/]/);
  return m ? m[1] : null;
};

let changedFiles = 0;
let wrapped = 0;
for (const file of targets.flatMap((tgt) => walk(path.resolve(tgt)))) {
  const src = fs.readFileSync(file, "utf8");
  if (/useTranslation\(/.test(src)) continue; // translated by hand already
  let ast;
  try {
    ast = parse(src, { sourceType: "module", plugins: ["jsx"] });
  } catch (err) {
    console.error(`skip (parse): ${path.relative(ROOT, file)}: ${err.message}`);
    continue;
  }
  // a translator already there (a run before): its name kept, no second import
  let existing = null;
  for (const n of ast.program.body) {
    if (n.type === "ImportDeclaration" && n.source.value === "src/i18n")
      for (const sp of n.specifiers) if (sp.imported?.name === "t") existing = sp.local.name;
    if (n.type === "VariableDeclaration")
      for (const d of n.declarations) if (d.init?.type === "CallExpression" && d.init.callee.name === "packageT") existing = d.id.name;
  }
  // a local `t` anywhere - the file uses `tr`
  let localT = false;
  traverse(ast, {
    Scope(p) {
      const b = p.scope.bindings.t;
      if (b && b.kind !== "module" && !(existing === "t" && b.scope.path.type === "Program")) localT = true;
    },
  });
  const fn = existing ?? (localT ? "tr" : "t");
  const edits = [];
  const wrapString = (node) => {
    if (node.type === "StringLiteral" && isText(node.value)) {
      edits.push([node.start, node.end, `${fn}(${q(node.value.replace(/\s+/g, " ").trim())})`]);
    } else if (node.type === "TemplateLiteral" && node.expressions.length === 0 && isText(node.quasis[0].value.cooked)) {
      edits.push([node.start, node.end, `${fn}(${q(node.quasis[0].value.cooked.replace(/\s+/g, " ").trim())})`]);
    } else if (node.type === "TemplateLiteral" && node.expressions.length > 0) {
      // `A folder in ${parent.title}` -> t('A folder in {{title}}', { title: parent.title })
      const statics = node.quasis.map((x) => x.value.cooked).join(" ");
      if (!looksLikeText(node.quasis.map((x) => x.value.cooked).join("…"))) return;
      const simple = ["Identifier", "MemberExpression", "CallExpression", "OptionalMemberExpression", "OptionalCallExpression"];
      if (!isText(statics) || (!loose && !node.expressions.every((e) => simple.includes(e.type)))) return;
      const used = new Set();
      const names = node.expressions.map((e, i) => {
        let n = e.type === "Identifier" ? e.name : (e.property?.name ?? e.callee?.name ?? e.callee?.property?.name ?? `v${i}`);
        n = String(n).replace(/[^A-Za-z0-9_]/g, "") || `v${i}`;
        while (used.has(n)) n += "2";
        used.add(n);
        return n;
      });
      let key = "";
      node.quasis.forEach((x, i) => {
        key += x.value.cooked;
        if (i < names.length) key += `{{${names[i]}}}`;
      });
      key = key.replace(/\s+/g, " ");
      const opts = names.map((n, i) => (n === src.slice(node.expressions[i].start, node.expressions[i].end) ? n : `${n}: ${src.slice(node.expressions[i].start, node.expressions[i].end)}`));
      edits.push([node.start, node.end, `${fn}(${q(key)}, { ${opts.join(", ")} })`]);
    } else if (node.type === "ConditionalExpression") {
      wrapString(node.consequent);
      wrapString(node.alternate);
    } else if (node.type === "LogicalExpression") {
      wrapString(node.right);
    }
  };
  const elementName = (p) => {
    const el = p.findParent((x) => x.isJSXElement());
    return el?.node.openingElement.name.name;
  };
  traverse(ast, {
    JSXText(p) {
      const raw = p.node.value;
      if (!isText(raw) || SKIP_PARENTS.has(elementName(p))) return;
      const text = raw.replace(/\s+/g, " ").trim();
      const lead = raw.match(/^\s*/)[0];
      const trail = raw.match(/\s*$/)[0];
      const srcRaw = src.slice(p.node.start, p.node.end);
      // entities in the source (&nbsp;, &rarr;) - kept as they are
      if (/&[a-z#0-9]+;/i.test(srcRaw)) return;
      edits.push([p.node.start, p.node.end, `${lead}{${fn}(${q(text)})}${trail}`]);
    },
    JSXAttribute(p) {
      const name = p.node.name.name;
      if (!PROPS.has(name) || !p.node.value) return;
      const v = p.node.value;
      if (v.type === "StringLiteral") {
        if (isText(v.value)) edits.push([v.start, v.end, `{${fn}(${q(v.value.replace(/\s+/g, " ").trim())})}`]);
      } else if (v.type === "JSXExpressionContainer") wrapString(v.expression);
    },
    JSXExpressionContainer(p) {
      if (p.parent.type !== "JSXElement" && p.parent.type !== "JSXFragment") return;
      if (SKIP_PARENTS.has(elementName(p))) return;
      const e = p.node.expression;
      if (e.type === "StringLiteral" || e.type === "ConditionalExpression" || e.type === "LogicalExpression" || e.type === "TemplateLiteral") wrapString(e);
    },
    ObjectProperty(p) {
      const key = p.node.key.name ?? p.node.key.value;
      if (!OBJ_KEYS.has(key)) return;
      const v = p.node.value;
      if (v.type === "StringLiteral" && !isText(v.value, { strict: true })) return;
      wrapString(v);
    },
  });
  if (loose) {
    const inside = (n) => edits.some(([a, b]) => n.start >= a && n.end <= b);
    traverse(ast, {
      StringLiteral(p) {
        if (inside(p.node) || !looksLikeText(p.node.value) || !textContext(p)) return;
        if (p.parentPath.isJSXAttribute()) edits.push([p.node.start, p.node.end, `{${fn}(${q(p.node.value.replace(/\s+/g, " ").trim())})}`]);
        else wrapString(p.node);
      },
      TemplateLiteral(p) {
        if (inside(p.node) || p.parentPath.isTaggedTemplateExpression()) return;
        if (!looksLikeText(p.node.quasis.map((x) => x.value.cooked).join(" ")) || !textContext(p)) return;
        wrapString(p.node);
      },
    });
  }
  if (!edits.length) continue;
  // the innermost edits win (a string inside an already wrapped range is skipped)
  edits.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  const kept = [];
  for (const e of edits) if (!kept.some((k) => e[0] >= k[0] && e[1] <= k[1])) kept.push(e);
  let out = src;
  for (const [s, e, r] of [...kept].sort((a, b) => b[0] - a[0])) out = out.slice(0, s) + r + out.slice(e);
  wrapped += kept.length;
  changedFiles++;
  if (existing) {
    if (dry) console.log(`${path.relative(ROOT, file)}: ${kept.length}`);
    else fs.writeFileSync(file, out);
    continue;
  }
  // the import (and a package's own t)
  const ns = nsOf(file);
  const importLine = ns
    ? `import { packageT } from 'src/i18n'\n`
    : localT
      ? `import { t as tr } from 'src/i18n'\n`
      : `import { t } from 'src/i18n'\n`;
  const lines = out.split("\n");
  let last = -1;
  const astOut = parse(out, { sourceType: "module", plugins: ["jsx"] });
  for (const n of astOut.program.body) if (n.type === "ImportDeclaration") last = n.loc.end.line - 1;
  const extra = ns ? `\n// the package's words (its own locales/, then the core's)\nconst ${fn} = packageT('${ns}')\n` : "";
  lines.splice(last + 1, 0, importLine.trimEnd() + (extra ? extra.trimEnd() : ""));
  out = lines.join("\n");
  if (dry) console.log(`${path.relative(ROOT, file)}: ${kept.length}`);
  else fs.writeFileSync(file, out);
}
console.log(`${changedFiles} files, ${wrapped} texts wrapped${dry ? " (dry run)" : ""}`);
