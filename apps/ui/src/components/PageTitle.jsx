import React from 'react'
import AiButton from './ai/AiButton'

/**
 * A page's title with the AI's mark before it (the user, 2026-10-25: one markup on every page - the mark
 * centred on the title's line, the title at the start): Nodes, Devices, Simulator, Processes, Live Events,
 * Logs, Service, Users, Library, Docs. The AI opens on the page, the tab / sub-tab the person is on goes
 * with it (AiPanel's view). `children` - anything right after the title (a live badge, a note).
 */
const PageTitle = ({ title, children }) => (
  <div className="d-inline-flex align-items-center gap-2">
    <AiButton subject={{ type: 'page', page: title }} label={`the ${title} page`} size={22} />
    <strong>{title}</strong>
    {children}
  </div>
)

export default PageTitle
