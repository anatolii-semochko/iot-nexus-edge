import React from 'react'
import AiButton from '../../components/ai/AiButton'
import i18n, { t } from 'src/i18n'

// A Dashboard page's title (iot AGENTS_TO_DO.md 2026-11-17, "гібрид"): every page - the top, a folder, an
// opened card - shows its title with the AI's mark, unless its "Show title" is off (Service -> Config ->
// Dashboard). The text: the card's title in the viewer's language (`titles`), else its own `title`; the
// top's - the settings' `titles`, else "Dashboard". A component that draws its own title with its data
// beside it (`ownTitle` in its registration - the energy, heating, weather scenes) gets it as its
// `pageTitle` prop ({ text } - shown, null - hidden) and keeps its data; any other gets this one over it.

const localized = (titles, fallback) => titles?.[i18n.resolvedLanguage] || fallback

/** A card's title in the viewer's language. */
export const cardTitle = (card) => localized(card.titles, card.title)

/** The top level's title and whether it is shown (the Dashboard's settings). */
export const rootTitle = (settings) => ({
  show: settings?.showTitle !== false,
  text: localized(settings?.titles, t('Dashboard')),
})

/** The title over a page: the AI's mark (on the process, else on the page) and the text. */
export const DashboardPageTitle = ({ text, process }) => (
  <strong className="d-block mb-3" style={{ fontSize: '1.4rem' }}>
    <AiButton
      subject={process ? { type: 'process', id: process.id } : { type: 'page', page: text }}
      label={process ? process.name : t('the {{title}} page', { title: text })}
      size={30}
      className="me-2"
    />
    {text}
  </strong>
)
