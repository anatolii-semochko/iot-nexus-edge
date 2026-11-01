// A page's code that can't be loaded (iot AGENTS_TO_DO.md 2026-10-31): after an update the build's chunk
// names change - a tab opened before it asks for the old ones (a 404), or the server is restarting (a
// 502). Vite reports it as `vite:preloadError`; the page is loaded again once, so it gets the new build.
// Never a loop: not again within RELOAD_GUARD_MS.
const RELOAD_GUARD_MS = 10_000
const KEY = 'ne-chunk-reload'

window.addEventListener('vite:preloadError', (event) => {
  let last = 0
  try {
    last = Number(sessionStorage.getItem(KEY) ?? 0)
  } catch {
    // no session storage - reload once anyway
  }
  if (Date.now() - last < RELOAD_GUARD_MS) return // let the error show - something else is wrong
  event.preventDefault()
  try {
    sessionStorage.setItem(KEY, String(Date.now()))
  } catch {
    // ignored
  }
  window.location.reload()
})
