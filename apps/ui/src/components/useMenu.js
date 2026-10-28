import { useSelector } from 'react-redux'
import navigation from '../_nav'
import { canOpen } from '../access'

/**
 * The menu the person gets (2026-10-27): the entries whose page the role shows and its rights open
 * (access.js canOpen); a group title only with a visible entry under it. `hidden` - one page at most (only
 * the Dashboard) - no sidebar and no menu button.
 */
export function useMenu() {
  const access = useSelector((state) => state.access)
  const allowed = navigation.filter((item) => !item.to || canOpen(access, item.to))
  const items = allowed.filter((item, i) => item.to || allowed[i + 1]?.to !== undefined)
  return { items, hidden: items.filter((item) => item.to).length <= 1 }
}
