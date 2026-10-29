import { useState } from 'react'
import { deleteCookie, readCookie } from '../utils/cookies'

// The page state lives in localStorage (2026-10-29 - one mechanism for every page and the Dashboard's
// fit, the one that lasts: no expiry, unlike a cookie's 400 days at most, and not sent with every
// request). Before that it was a cookie of the same name - moved over on its first read. Storage may be
// off (a private window, blocked site data) - then the state lasts while the page is open.
const readSaved = (key) => {
  try {
    const saved = window.localStorage.getItem(key)
    if (saved !== null) return saved
  } catch {
    return null
  }
  const old = readCookie(key)
  if (old !== null) {
    try {
      window.localStorage.setItem(key, old)
      deleteCookie(key)
    } catch {
      // kept in the cookie - read again next time
    }
  }
  return old
}

const writeSaved = (key, value) => {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // storage off - the state lasts while the page is open
  }
}

/**
 * Per-page UI state (filters, search text, page size, expanded rows, ...)
 * that survives a refresh - the handful of things someone sets up while
 * actually using a page, not durable data (that stays in Postgres, never
 * in the browser).
 *
 * `defaults` is the registration, not just a fallback: its keys are
 * exactly what this hook tracks and persists, and its values are what a
 * first-ever visit (or a saved state missing that key) starts from. A field
 * added to `defaults` later just starts defaulting until the user changes
 * it; a field removed from `defaults` stops being read even if an old
 * saved state still has it - the schema, not the saved state, decides what exists.
 *
 * @param {string} key - the storage key, unique per page (the name its cookie had), e.g. 'nexusedge.processes'
 * @param {Object} defaults - { fieldName: defaultValue, ... }
 * @returns {[Object, (partial: Object) => void]}
 */
export function usePersistedState(key, defaults) {
  const [state, setStateRaw] = useState(() => {
    const saved = readSaved(key)
    if (!saved) return defaults

    let parsed
    try {
      parsed = JSON.parse(saved)
    } catch {
      return defaults
    }

    const merged = { ...defaults }
    for (const key of Object.keys(defaults)) {
      if (key in parsed) merged[key] = parsed[key]
    }
    return merged
  })

  const setState = (partial) => {
    setStateRaw((prev) => {
      const next = { ...prev, ...partial }
      writeSaved(key, JSON.stringify(next))
      return next
    })
  }

  return [state, setState]
}
