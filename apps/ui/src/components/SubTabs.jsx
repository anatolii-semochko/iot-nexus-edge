import React, { createContext, useContext } from 'react'
import { createPortal } from 'react-dom'
import { CButton } from '@coreui/react'

// A tab's own sub-tabs - one look for every plugin (nexus-edge-aquarium
// AGENTS_TO_DO.md 2026-10-15): the standard button group (as the logs'
// type filter) of icon + label buttons, the open one filled.
//
// Where it is drawn: a host with a fixed tab strip and a scrolling content
// (a popup's tabs) puts an empty element right under its strip and wraps
// the content in <SubTabsHost target> - the sub-tabs of the open tab are then
// drawn there (a portal) and stay put while only the content scrolls.
// Without a slot (a page) the strip is drawn in place, on top of the
// content.

const SlotContext = createContext(null)

// Line icons for the items: a 24 x 24 box, one stroke in `currentColor`
// - the items' own icons share it, so they all look alike.
export const SubTabIcon = ({ children }) => (
  <svg
    viewBox="0 0 24 24"
    width="1.15em"
    height="1.15em"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.7}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    style={{ flex: 'none' }}
  >
    {children}
  </svg>
)

/**
 * The sub-tab strip. `tabs` - [{key, label, icon?, badge?}] (`icon` - a
 * SubTabIcon drawing, `badge` - a node after the label); `tab` - the open
 * one's key (the first when unknown); `onChange(key)`; `size` - the
 * buttons' size: "sm" (the default for now) or "md" (the regular `btn` -
 * nexus-edge-aquarium uses it; the whole app is to follow).
 */
const SubTabs = ({ tabs, tab, onChange, size = 'sm' }) => {
  const slot = useContext(SlotContext)
  const active = activeSubTab(tabs, tab)
  const strip = (
    <div className="btn-group mb-3 align-self-start" role="tablist">
      {tabs.map((t) => (
        <CButton
          key={t.key}
          size={size === 'md' ? undefined : size}
          color="secondary"
          variant={t.key === active ? undefined : 'outline'}
          role="tab"
          aria-selected={t.key === active}
          className="d-inline-flex align-items-center gap-1 text-nowrap"
          onClick={() => onChange(t.key)}
        >
          {t.icon}
          {t.label}
          {t.badge}
        </CButton>
      ))}
    </div>
  )
  return slot ? createPortal(strip, slot) : strip
}

/** The open sub-tab's key: `tab` when the list has it, else the first. */
export const activeSubTab = (tabs, tab) => (tabs.some((t) => t.key === tab) ? tab : tabs[0]?.key)

/**
 * A host's place for the sub-tabs: `target` - an (empty) element the host
 * renders under its own strip (a state-held ref - null until mounted, the
 * strips are drawn in place meanwhile); `children` - the content.
 */
export const SubTabsHost = ({ target, children }) => (
  <SlotContext.Provider value={target}>{children}</SlotContext.Provider>
)

export default SubTabs
