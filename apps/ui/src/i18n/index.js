// The interface's languages (iot AGENTS_TO_DO.md 2026-10-31): i18next with English text as the key -
// `t(<the English text>)` - so the English is never a separate file and an untranslated text shows in English.
// Namespaces: `core` (apps/ui, src/i18n/locales/<lang>.json) and one per package - its folder name
// (devices/<kind>/<pkg>/ui/locales/<lang>.json, plugins/<pkg>/ui/locales/<lang>.json), found at build
// time like the packages' register.js; a package's component - `useTranslation('<pkg>')`, the core's
// words found too (fallbackNS). The numbers keep the point everywhere (the user's choice).
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { clearParamFromUrl, paramFromUrl } from '../accountLink'

// the interface's languages - the flags offered (the API's UI_LANGUAGES narrows them at sign-in)
export const LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'uk', name: 'Українська' },
  { code: 'de', name: 'Deutsch' },
  { code: 'es', name: 'Español' },
]
export const DEFAULT_LANGUAGE = 'en'
// the same key as the site's switcher (nexus-edge-tech) - one choice on one origin
const STORAGE_KEY = 'ne-lang'

const resources = {}
const add = (lang, ns, data) => {
  resources[lang] = resources[lang] ?? {}
  resources[lang][ns] = { ...(resources[lang][ns] ?? {}), ...data }
}
const langOf = (file) => file.match(/\/([a-z]{2})\.json$/)?.[1]
for (const [file, mod] of Object.entries(import.meta.glob('./locales/*.json', { eager: true })))
  add(langOf(file), 'core', mod.default)
const packages = import.meta.glob(
  ['devices/*/*/ui/locales/*.json', 'plugins/*/ui/locales/*.json'],
  { eager: true },
)
for (const [file, mod] of Object.entries(packages)) {
  const ns = file.match(/\/([^/]+)\/ui\/locales\//)?.[1]
  if (ns) add(langOf(file), ns, mod.default)
}

const known = (code) => LANGUAGES.some((l) => l.code === code)
const stored = () => {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}
/** The first visit's language - the browser's, if offered. */
const browserLanguage = () =>
  (navigator.languages ?? [navigator.language])
    .map((l) => String(l).slice(0, 2).toLowerCase())
    .find(known) ?? DEFAULT_LANGUAGE

// a link's language (`?lang=uk` - a site's link into the application, accountLink.js): this visit's,
// remembered as the browser's choice, taken off the address
const linked = paramFromUrl('lang')?.toLowerCase()
export const languageFromLink = known(linked) ? linked : null
if (linked) {
  clearParamFromUrl('lang')
  if (languageFromLink)
    try {
      localStorage.setItem(STORAGE_KEY, languageFromLink)
    } catch {
      // blocked storage - this page only
    }
}

const initial = languageFromLink ?? (known(stored()) ? stored() : browserLanguage())

i18n.use(initReactI18next).init({
  resources,
  lng: initial,
  fallbackLng: DEFAULT_LANGUAGE,
  ns: ['core'],
  defaultNS: 'core',
  fallbackNS: 'core',
  // the English text is the key: no separators inside it
  keySeparator: false,
  nsSeparator: false,
  returnEmptyString: false,
  interpolation: { escapeValue: false },
})
document.documentElement.lang = initial

// a reload for the same language within this long is not repeated (a loop guard)
const RELOAD_GUARD_MS = 10_000
const RELOAD_KEY = 'ne-lang-reload'

/**
 * Switches the interface's language and remembers it in this browser; the page is loaded again, so the
 * texts the modules build at their start (lists of labels, options) are in the new language too - a choice
 * made rarely. Never a reload loop: when the choice can't be stored (blocked site data) or the page was
 * just loaded again for the same language, the language changes in place instead.
 */
export const setLanguage = (code) => {
  if (!known(code) || code === i18n.resolvedLanguage) return
  let stored = false
  try {
    localStorage.setItem(STORAGE_KEY, code)
    stored = localStorage.getItem(STORAGE_KEY) === code
  } catch {
    // a private window or blocked storage - this page only
  }
  let recent = false
  try {
    const last = JSON.parse(sessionStorage.getItem(RELOAD_KEY) ?? 'null')
    recent = last?.code === code && Date.now() - last.at < RELOAD_GUARD_MS
    if (stored && !recent)
      sessionStorage.setItem(RELOAD_KEY, JSON.stringify({ code, at: Date.now() }))
  } catch {
    // no session storage - the stored choice alone decides
  }
  if (stored && !recent) {
    window.location.reload()
    return
  }
  i18n.changeLanguage(code)
  document.documentElement.lang = code
}

/**
 * The translation outside a hook - a language change loads the page again (setLanguage), so a module's
 * texts and every render read the current language. `t('Save')`, `t('{{n}} cards', { n })`.
 */
export const t = (key, options) => i18n.t(key, options)

/** A package's own `t` - its namespace first, then the core's (`const t = packageT('energy-field')`). */
export const packageT = (ns) => (key, options) => i18n.t(key, { ns: [ns, 'core'], ...options })

/**
 * Marks a text kept in data (a menu's name, a list of options) as a key - translated where it is shown
 * (`t(name)`); scripts/i18n-check.mjs finds it.
 */
export const tKey = (text) => text

export default i18n
