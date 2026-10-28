import { useCallback } from 'react'
import { useSelector } from 'react-redux'

/**
 * What the signed-in person may do (B1.2 - api access/: /auth/me `access`):
 * the permission keys held everywhere (`global`), and those held only on
 * some DNP instances (`scoped` - with those instances' process / node /
 * device ids). The same keys the API's guard checks (api
 * access/catalog.ts) - the UI only hides and disables by them; the server
 * decides.
 */

/** Whether `access` holds `permission` - anywhere, or on `entity` ({process | node | device: id}). */
export function canWith(access, permission, entity) {
  if (!access) return false
  if (access.global.includes('*') || access.global.includes(permission)) return true
  const scoped = access.scoped?.[permission]
  if (!scoped) return false
  if (!entity) return true
  if (entity.process != null) return scoped.processes.includes(Number(entity.process))
  if (entity.node != null) return scoped.nodes.includes(Number(entity.node))
  if (entity.device != null) return scoped.devices.includes(Number(entity.device))
  return false
}

/** `can(permission, entity?)` for the signed-in person. */
export function useCan() {
  const access = useSelector((state) => state.access)
  return useCallback((permission, entity) => canWith(access, permission, entity), [access])
}

/** Whether any of `permissions` is held (a menu entry several permissions open). */
export const canAny = (access, permissions) =>
  !permissions || permissions.length === 0 || permissions.some((p) => canWith(access, p))

// what opens a section of the app - its menu entry and its page
export const SECTION_PERMISSIONS = {
  '/dashboard': ['dashboard.view'],
  '/ai-assistant': ['ai.use'],
  '/nodes': ['nodes.view'],
  '/devices': ['devices.view'],
  '/simulator': ['devices.simulate'],
  '/processes': ['processes.view'],
  '/live-events': ['devices.view'],
  '/logs': ['logs.view'],
  '/library': ['library.view'],
  '/users': ['users.view', 'users.manage'],
  '/service': [
    'dashboard.manage',
    'ai.configure',
    'service.database.backup',
    'service.database.restore',
    'service.database.clear-logs',
    'service.system',
    'service.dnp',
  ],
}

/** The permissions a path needs (its section - the first segment). */
export const permissionsForPath = (path) =>
  SECTION_PERMISSIONS[`/${String(path).split('/')[1] ?? ''}`]

/** A page's key - its path's first part ("dashboard", "ai-assistant"); "messages" - the header's. */
export const pageKey = (path) => String(path).split('/')[1] ?? ''

/**
 * Whether the role shows a page (2026-10-27 - the role's own list of pages, `access.pages`; null - every
 * page its rights open). Shown only - the rights decide what may be read or done.
 */
export const pageShown = (access, path) => !access?.pages || access.pages.includes(pageKey(path))

/** Whether a page opens: the role shows it and the rights let it. */
export const canOpen = (access, path) =>
  pageShown(access, path) && canAny(access, permissionsForPath(path))

/** The header's messages (the notification centre) - a page key of their own. */
export const MESSAGES_PAGE = '/messages'
