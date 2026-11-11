/**
 * A message in the interface's language (iot AGENTS_TO_DO.md, "WEM translation", 2026-11-07): a producer
 * gives the English template with its {{placeholders}} and their values - `text` is the English filled in
 * (the logs, the search, the AI, as before), `i18n` the template for the UI to translate in the package's
 * own words (its ui/locales - the i18next namespace is the package's folder name; "core" - the platform's).
 * Plugins get it as `ctx.wem(template, params)` - their package found from their file (processPlugins.ts).
 */
export type MessageParams = Record<string, string | number | null | undefined>;

export interface MessageI18n {
  ns?: string;
  template: string;
  params?: Record<string, string | number | null>;
}

export const fillTemplate = (template: string, params: MessageParams = {}): string =>
  template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => (params[k] === undefined || params[k] === null ? "" : String(params[k])));

/** `{ text, i18n }` - spread into a message entry: `{ code, level, ...wem("{{name}}: frost risk", { name }) }`;
 * the package (`ns`) - the process's own, added on the way out (apiClient withPackage); a built-in - "core". */
export const wem = (template: string, params: MessageParams = {}, ns?: string): { text: string; i18n: MessageI18n } => {
  const clean = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, v ?? null]));
  return { text: fillTemplate(template, params), i18n: { ...(ns ? { ns } : {}), template, params: clean } };
};
