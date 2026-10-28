// A link into a group (2026-10-27 - api routes/auth.ts): `?account=<a group's link name>` - before
// the hash (https://host/?account=admin) or in it (#/dashboard?account=admin) - opens the application in
// that group (the guest's too). Read once, then taken off the address.

const fromSearch = (search) => new URLSearchParams(search).get('account')

/** The link's group name, if the address carries one. */
export const accountFromUrl = () => {
  const hashQuery = window.location.hash.split('?')[1] ?? ''
  return fromSearch(window.location.search) ?? fromSearch(hashQuery) ?? null
}

/** The address without `account` (the page not reloaded). */
export const clearAccountFromUrl = () => {
  const url = new URL(window.location.href)
  url.searchParams.delete('account')
  const [path, query = ''] = url.hash.split('?')
  const params = new URLSearchParams(query)
  params.delete('account')
  url.hash = params.toString() ? `${path}?${params}` : path
  window.history.replaceState(null, '', url.toString())
}
