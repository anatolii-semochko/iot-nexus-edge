// The rules telling an interface's text from data in the UI code (iot AGENTS_TO_DO.md 2026-10-31) - shared
// by scripts/i18n-wrap.mjs --loose and scripts/i18n-leftovers.mjs.
export const NOT_TEXT_ATTRS = new Set(["className", "style", "key", "to", "href", "src", "type", "id", "name", "variant", "color", "size", "role", "placement", "as", "value", "htmlFor", "target", "rel", "fill", "stroke", "d", "viewBox", "transform", "textAnchor", "dominantBaseline", "fontFamily", "strokeLinecap", "strokeLinejoin", "method", "autoComplete", "inputMode", "pattern", "lang", "dir", "accept", "shape", "layout", "direction", "align", "justify", "position", "theme", "icon", "mode", "preserveAspectRatio", "gridTemplateColumns", "gridTemplateRows", "gridArea", "in", "in2", "result", "operator", "filter", "mask", "clipPath", "xlinkHref", "gradientUnits", "patternUnits", "filterUnits", "values", "points", "mode", "edgeMode", "colorInterpolationFilters", "markerEnd", "markerStart", "vectorEffect", "pointerEvents", "cursor"]);
export const NOT_TEXT_KEYS = new Set(["key", "id", "type", "kind", "color", "icon", "className", "variant", "path", "to", "href", "url", "unit", "slot", "source", "mode", "status", "level", "field", "column", "sort", "role", "permission", "page", "ns", "component", "componentKey", "preview", "view", "layout", "stroke", "fill", "dash", "domain", "channel", "metric", "format", "align", "placement", "size", "position", "background", "border", "font", "fontFamily", "method", "event", "action", "gridTemplateColumns", "gridTemplateRows", "gridArea", "preserveAspectRatio", "transform", "transition", "animation"]);
export const SKIP_CALLS = /^(t|tr|tKey|packageT|require|request|fetch|console\.\w+|Error|TypeError|RangeError|new Error|setItem|getItem|removeItem|addEventListener|removeEventListener|querySelector|querySelectorAll|getElementById|matchMedia|dispatch|useSelector|navigate|import|includes|startsWith|endsWith|split|join|replace|match|test|padStart|toFixed|toLocaleString|toLocaleTimeString|toLocaleDateString|Intl\.\w+|new Intl\.\w+|api\.\w+|can|pageShown|createElement|setAttribute|getAttribute|setProperty|getPropertyValue|classList\.\w+)$/;
export const looksLikeText = (s) => {
  // css lengths and numbers out first ("-5.5px 0 -1.5px")
  const v = s.replace(/-?\d*\.?\d+(px|em|rem|vh|vw|deg|ms|s|%)\b/g, " ").trim();
  if (!/\p{L}{2,}/u.test(v)) return false;
  if (/^[a-z0-9_.:/#?=&-]+$/.test(v.replace(/…/g, ""))) return false; // identifiers, paths, keys ("pump-${n}-current")
  if (/^(https?:|\/\S|\.\S|#|data:|var\(|calc\(|rgba?\(|hsl)/.test(v)) return false;
  if (/[{};]/.test(v) && /:/.test(v)) return false; // css
  if (/^(process|device|node|series):|translate\(|scale\(|rotate\(|url\(#/.test(s)) return false; // keys, svg transforms
  if (/^\s*(px\s*)+$/.test(s.replace(/…/g, ""))) return false; // "${x}px ${y}px"
  if (/\b(serif|sans-serif|monospace)\s*$/.test(v)) return false; // a font stack
  if (/<\/?[a-z][\w:-]*[\s>/]/i.test(s)) return false; // markup (an svg built as a string)
  if (/\b(minmax|repeat|fit-content|clamp|min|max|cubic-bezier|linear-gradient|radial-gradient|conic-gradient|drop-shadow|blur|matrix|translate[XYZ]?|scale[XYZ]?|rotate[XYZ]?|skew[XY]?)\(/.test(s)) return false; // css functions
  if (/^(xMid|xMin|xMax)\w+ (meet|slice)$|^(auto|none|inherit)( (auto|none|inherit))+$/.test(v)) return false; // svg / css values
  if (/\bvar\(--|\b(solid|dashed|dotted)\b.*\b\d/.test(s)) return false; // a css value
  if (/^[MmLlHhVvCcSsQqTtAaZz][\d\s.,-]/.test(v) && /\d/.test(v) && !/\s[a-z]{3,}/.test(v)) return false; // an svg path
  if (/^[A-Z0-9_]+$/.test(v)) return false; // CONSTANTS
  if (/^[a-z]+[A-Z]\w*$/.test(v)) return false; // camelCase
  if (/^[\w-]+(\s[\w-]+)*$/.test(v) && /\b(btn|text|bg|d|flex|align|justify|mb|mt|me|ms|p|px|py|m|g|col|row|border|rounded|fw|fs|small|w|h|position|top|bottom|start|end|shadow)-/.test(v)) return false; // utility classes
  return /\s/.test(v) || /^[A-Z][a-z]/.test(v);
};
export const calleeName = (c) => {
  if (!c) return "";
  if (c.type === "Identifier") return c.name;
  if (c.type === "MemberExpression") return `${calleeName(c.object)}.${c.property.name ?? ""}`;
  return "";
};


/** Whether a string literal (or a template) at this path is a text a person reads - its context allows it. */
export const textContext = (p) => {
  const parent = p.parentPath;
  if (parent.isImportDeclaration() || parent.isExportNamedDeclaration() || parent.isExportAllDeclaration()) return false;
  if (parent.isJSXAttribute() && NOT_TEXT_ATTRS.has(parent.node.name.name)) return false;
  const attr = p.findParent((x) => x.isJSXAttribute());
  if (attr && NOT_TEXT_ATTRS.has(attr.node.name.name)) return false;
  if (parent.isObjectProperty() && parent.node.key === p.node) return false;
  if (parent.isObjectProperty() && NOT_TEXT_KEYS.has(parent.node.key.name ?? parent.node.key.value)) return false;
  if (parent.isBinaryExpression() && ["===", "!==", "==", "!=", "in", "instanceof"].includes(parent.node.operator)) return false;
  if (parent.isSwitchCase()) return false;
  if (parent.isMemberExpression() && parent.node.property === p.node) return false;
  if (parent.isTSLiteralType?.()) return false;
  const call = p.findParent((x) => x.isCallExpression() || x.isNewExpression());
  if (call && SKIP_CALLS.test(calleeName(call.node.callee))) return false;
  if (p.findParent((x) => x.isTaggedTemplateExpression())) return false;
  // a text already inside t(...) / tr(...)
  if (p.findParent((x) => x.isCallExpression() && ["t", "tr", "tKey"].includes(x.node.callee.name))) return false;
  return true;
};
