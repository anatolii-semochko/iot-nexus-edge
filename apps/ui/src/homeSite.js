// The project's own website (2026-11-01) - optional, baked in at build time like VITE_PROJECT_NAME
// (projectName.js): a target project's apps/ui/Dockerfile passes VITE_HOME_URL (the site's root) and
// VITE_HOME_LANGS (the languages the site has under /<lang>/; any other - the site's root). Unset - no
// link anywhere. Used by the brand (the logo goes to the site) and the user menu.
const base = (import.meta.env.VITE_HOME_URL || '').trim()
const langs = (import.meta.env.VITE_HOME_LANGS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

export const HOME_URL = base ? base.replace(/\/*$/, '/') : ''

/** The site's page for the interface's language - its root when the site has no such language. */
export const homeUrl = (lang) =>
  HOME_URL && langs.includes(lang) ? `${HOME_URL}${lang}/` : HOME_URL

/** The site's host for a label - "nexus-edge.tech". */
export const HOME_HOST = HOME_URL ? new URL(HOME_URL).host : ''
