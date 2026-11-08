/**
 * A message in the interface's language (iot AGENTS_TO_DO.md, "WEM translation", 2026-11-07): the English
 * template with its {{placeholders}} and their values - `text` the English filled in (the logs, the search,
 * the AI), `i18n` the template the UI translates in this package's words (its ui/locales). The package itself
 * is added by the orchestrator from the process's kind (apps/orchestrator kindPackages.ts). The same as the
 * plugin context's `ctx.wem` - a plain function, for the modules that build messages outside a runner.
 *   warnings.push({ code: "tanks_low", level: 1, ...wem("The tanks are nearly empty") })
 */
export type MessageParams = Record<string, string | number | null | undefined>;

export const wem = (template: string, params: MessageParams = {}): { text: string; i18n: { template: string; params: Record<string, string | number | null> } } => ({
  text: template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => (params[k] === undefined || params[k] === null ? "" : String(params[k]))),
  i18n: { template, params: Object.fromEntries(Object.entries(params).map(([k, v]) => [k, v ?? null])) },
});
