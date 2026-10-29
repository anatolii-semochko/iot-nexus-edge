/**
 * Minimal document.cookie read / delete - no external dependency for what's
 * two small string operations. Only hooks/usePersistedState.js uses it: the
 * page state was kept in cookies before 2026-10-29 (now localStorage) - an
 * old cookie is read once, moved over and deleted. Never for anything that
 * belongs in Postgres or the session cookie apps/api sets.
 */

export function readCookie(name) {
  const escaped = name.replace(/([.$?*|{}()[\]\\/+^])/g, '\\$1')
  const match = document.cookie.match(new RegExp(`(?:^|; )${escaped}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : null
}

export function deleteCookie(name) {
  document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax`
}
