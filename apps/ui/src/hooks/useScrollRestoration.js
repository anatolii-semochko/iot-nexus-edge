import { useEffect, useLayoutEffect, useRef } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'

/**
 * Scroll restoration for the application shell's scrolling element (layout/DefaultLayout.jsx). The
 * browser restores only the window's scroll, so the shell does what a browser does for pages: a new page
 * (PUSH) starts at its top, Back / Forward (POP) returns to where that page was left, a replaced address
 * (REPLACE - the same page's state in the URL) stays where it is.
 *
 * - A place belongs to a history entry and its address: the entry's key (kept in history.state - so the
 *   places survive a reload) and the path, since an entry the router didn't make has the shared key
 *   "default". Kept in sessionStorage, the last KEEP.
 * - A scroll is written to the entry current when the browser fires it: the entry switches in a layout
 *   effect, before the browser dispatches the scroll its own clamping causes when the old page goes.
 * - On Back the place is re-applied as the content grows (a ResizeObserver), so a page still loading its
 *   data and pictures gets there; it stops when reached, after MAX_MS, or at a person's own scroll
 *   (wheel, a moving touch, keys).
 *
 * Packages navigate through src/navigation.js, so every page has an entry of its own.
 */
const STORE = 'nexusedge.scroll'
const KEEP = 60
const MAX_MS = 10000
const INTENTS = ['wheel', 'touchmove', 'keydown']

const readPlaces = () => {
  try {
    return JSON.parse(sessionStorage.getItem(STORE) ?? '{}')
  } catch {
    return {}
  }
}

const writePlaces = (places) => {
  const keys = Object.keys(places)
  for (const k of keys.slice(0, Math.max(0, keys.length - KEEP))) delete places[k]
  try {
    sessionStorage.setItem(STORE, JSON.stringify(places))
  } catch {
    // no storage (a private window) - Back still works, at the page's top
  }
}

export const useScrollRestoration = (scroller) => {
  const { key, pathname, search } = useLocation()
  const navType = useNavigationType()
  const entry = `${key} ${pathname}${search}`
  const places = useRef(null)
  if (places.current === null) places.current = readPlaces()
  const current = useRef(entry)

  // the place of the entry current at each scroll, written once a frame (the newest last - kept longest)
  useEffect(() => {
    if (!scroller) return undefined
    let frame = 0
    let last = null
    const onScroll = () => {
      last = [current.current, Math.round(scroller.scrollTop)]
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        const [at, top] = last
        delete places.current[at]
        places.current[at] = top
        writePlaces(places.current)
      })
    }
    scroller.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      cancelAnimationFrame(frame)
      scroller.removeEventListener('scroll', onScroll)
    }
  }, [scroller])

  // arriving at an entry
  useLayoutEffect(() => {
    current.current = entry
    if (!scroller || navType === 'REPLACE') return undefined
    const target = navType === 'POP' ? places.current[entry] : undefined
    if (!target) {
      scroller.scrollTo({ top: 0, behavior: 'instant' })
      return undefined
    }
    const stop = new AbortController()
    const until = Date.now() + MAX_MS
    const observer = new ResizeObserver(() => apply())
    stop.signal.addEventListener('abort', () => observer.disconnect())
    function apply() {
      if (stop.signal.aborted) return
      scroller.scrollTo({ top: target, behavior: 'instant' })
      if (Math.abs(scroller.scrollTop - target) < 2 || Date.now() > until) stop.abort()
    }
    for (const e of INTENTS)
      scroller.addEventListener(e, () => stop.abort(), { passive: true, signal: stop.signal })
    if (scroller.firstElementChild) observer.observe(scroller.firstElementChild)
    apply()
    return () => stop.abort()
  }, [scroller, entry, navType])
}
