// The links' parameters (2026-10-27, 2026-11-03): before the hash (https://host/?account=admin) or in it
// (#/dashboard?account=admin), read once at the start, then taken off the address.
// - `account=<a group's link name>` - opens the application in that group (the guest's too; api
//   routes/auth.ts);
// - `lang=<en|uk|de|es>` - the interface's language for this visit (a site's link carries its own -
//   i18n/index.js; it wins over the profile's for this visit).

const fromSearch = (search, name) => new URLSearchParams(search).get(name)

/** A link parameter's value, if the address carries it. */
export const paramFromUrl = (name) => {
  const hashQuery = window.location.hash.split('?')[1] ?? ''
  return fromSearch(window.location.search, name) ?? fromSearch(hashQuery, name) ?? null
}

/** The address without that parameter (the page not reloaded). */
export const clearParamFromUrl = (name) => {
  const url = new URL(window.location.href)
  url.searchParams.delete(name)
  const [path, query = ''] = url.hash.split('?')
  const params = new URLSearchParams(query)
  params.delete(name)
  url.hash = params.toString() ? `${path}?${params}` : path
  window.history.replaceState(null, '', url.toString())
}

/** The link's group name, if the address carries one. */
export const accountFromUrl = () => paramFromUrl('account')

/** The address without `account`. */
export const clearAccountFromUrl = () => clearParamFromUrl('account')
