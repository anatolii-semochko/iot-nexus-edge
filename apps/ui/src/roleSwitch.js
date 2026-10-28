// A role switch (the header's "Act as" - 2026-10-27): the page reloads in the new role; a page the new
// role doesn't open is left for its first page (useMenu - usually the Dashboard) instead of "no access";
// a Dashboard folder it doesn't see - for the Dashboard's top (2026-10-28).
// Only right after a switch: the mark is read once at the start and dropped - any other "no access"
// (a link, a bookmark) stays as it is.

const KEY = 'nexusedge.roleSwitched'

/** Marks the reload that follows a switch. */
export const markRoleSwitch = () => {
  try {
    sessionStorage.setItem(KEY, '1')
  } catch {
    // no storage - the switch just shows "no access" where the page is closed
  }
}

// the page open when the switch reloaded (the hash router's path), read once per load, the mark dropped
let switchedAt = null
try {
  if (sessionStorage.getItem(KEY) === '1')
    switchedAt = window.location.hash.replace(/^#/, '').split('?')[0] || '/'
  sessionStorage.removeItem(KEY)
} catch {
  switchedAt = null
}

/**
 * Whether `pathname` is the page the switch landed on (a page or a thing on it the new role doesn't see
 * leaves for a page it does - AppContent's closed section, the Dashboard's folder). Once the person is on
 * another page, never again.
 */
export const isSwitchLanding = (pathname) => {
  if (switchedAt !== null && pathname !== switchedAt) switchedAt = null
  return switchedAt !== null
}
