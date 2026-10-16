import React, { Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  CAlert,
  CBreadcrumb,
  CBreadcrumbItem,
  CCard,
  CCardBody,
  CCardHeader,
  CSpinner,
} from '@coreui/react'
import CIcon from '@coreui/icons-react'
import { cilChevronRight } from '@coreui/icons'
import { api } from '../../api/client'
import { dashboardComponents, dashboardContent } from '../../dashboardRegistry'
import { cardIcon } from '../../dashboardIcons'

/**
 * The Dashboard (Dashboard cards, 2026-10-16): the card tree built in
 * Service -> Config -> Dashboard (one for the whole system). A level -
 * the root or a folder - shows its cards as blocks or a list (the
 * folder's own `layout`); a folder opens its children, a component card
 * opens its component on the whole page by its `view`. Each card has its
 * address (`#/dashboard/<id>`) - Back and links work. A component card
 * shows the avatar its card chose (`preview` - the component's avatars,
 * dashboardRegistry.js; "auto" - its first), else a scaled copy of it.
 * While the tree is empty - the older single slot (a target project's
 * whole dashboard, dashboardRegistry.register) or a placeholder.
 */

// a scaled copy: the component drawn at this width, shrunk into the card
const PREVIEW_WIDTH = 1400
// the card's picture block (2026-10-16: 9 -> 10.8, the cards 20 % taller)
const PREVIEW_HEIGHT_REM = 10.8

const childrenOf = (cards, parentId) =>
  cards
    .filter((c) => (c.parentId ?? null) === parentId)
    .sort((a, b) => a.position - b.position || a.id - b.id)

const pathTo = (cards, card) => {
  const out = []
  for (let c = card; c; c = cards.find((x) => x.id === c.parentId)) out.unshift(c)
  return out
}

// The component a card shows, with its process (null - a system one).
const resolve = (card, processes) => {
  const def = dashboardComponents[card.componentKey]
  const process = def?.processKind ? (processes.find((p) => p.id === card.processId) ?? null) : null
  const problem = !def
    ? `The component "${card.componentKey}" is not available (its module is not installed)`
    : def.processKind && !process
      ? 'Its process has been removed'
      : null
  return { def, process, problem }
}

const ComponentView = ({ card, processes, scale }) => {
  const { def, process, problem } = resolve(card, processes)
  if (problem)
    return (
      <CAlert color="warning" className="mb-0">
        {problem}
      </CAlert>
    )
  const Component = def.Component
  return (
    <Suspense fallback={<CSpinner size="sm" />}>
      <Component process={process} {...(scale ? { preview: true } : {})} />
    </Suspense>
  )
}

// Draws `children` at PREVIEW_WIDTH and scales it to fit the box whole -
// its width and height, nothing cut - centered both ways; measured live.
const FitBox = ({ children }) => {
  const box = useRef(null)
  const inner = useRef(null)
  const [size, setSize] = useState(null)
  useLayoutEffect(() => {
    const measure = () => {
      if (!box.current || !inner.current) return
      setSize({
        width: box.current.clientWidth,
        height: box.current.clientHeight,
        natural: inner.current.offsetHeight,
      })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(box.current)
    observer.observe(inner.current)
    return () => observer.disconnect()
  }, [])
  const scale = size?.natural ? Math.min(size.width / PREVIEW_WIDTH, size.height / size.natural) : 0
  return (
    <div
      ref={box}
      style={{
        position: 'relative',
        height: `${PREVIEW_HEIGHT_REM}rem`,
        overflow: 'hidden',
        pointerEvents: 'none',
      }}
      aria-hidden="true"
    >
      <div
        ref={inner}
        style={{
          position: 'absolute',
          left: size ? (size.width - PREVIEW_WIDTH * scale) / 2 : 0,
          top: size ? (size.height - size.natural * scale) / 2 : 0,
          width: PREVIEW_WIDTH,
          transform: `scale(${scale})`,
          transformOrigin: '0 0',
          visibility: scale ? 'visible' : 'hidden',
        }}
      >
        {children}
      </div>
    </div>
  )
}

// The avatar a card shows: the one its `preview` names, "auto" - the
// component's first; null - a scaled copy of the component.
const avatarOf = (def, preview) =>
  preview === 'scaled'
    ? null
    : ((def.avatars ?? []).find((a) => preview === 'auto' || a.key === preview) ?? null)

// The card's picture: a folder's icon; a component's avatar - one made for
// the block (it fills it), or a `fit` one / a copy of the component scaled
// into the block (FitBox).
const CardPreview = ({ card, processes }) => {
  if (card.type === 'folder') {
    return (
      <div
        className="d-flex align-items-center justify-content-center text-body-secondary"
        style={{ height: `${PREVIEW_HEIGHT_REM}rem` }}
      >
        {/* about 60 % of the block's height */}
        <CIcon icon={cardIcon(card)} style={{ width: '6.6rem', height: '6.6rem' }} />
      </div>
    )
  }
  const { def, process, problem } = resolve(card, processes)
  if (problem) return <div className="small text-warning p-2">{problem}</div>
  const avatar = avatarOf(def, card.preview)
  if (avatar && !avatar.fit) {
    const Avatar = avatar.Component
    return (
      <div
        style={{ height: `${PREVIEW_HEIGHT_REM}rem`, position: 'relative', overflow: 'hidden' }}
        aria-hidden="true"
      >
        <Suspense fallback={<CSpinner size="sm" />}>
          <Avatar process={process} />
        </Suspense>
      </div>
    )
  }
  return (
    <FitBox>
      <Suspense fallback={<CSpinner size="sm" />}>
        {avatar ? (
          <avatar.Component process={process} />
        ) : (
          <ComponentView card={card} processes={processes} scale />
        )}
      </Suspense>
    </FitBox>
  )
}

// A folder - a card with its border, background and divider; a component -
// no border, background or divider: its picture and its name (2026-10-16).
const BlockCard = ({ card, processes }) => {
  const folder = card.type === 'folder'
  return (
    <Link to={`/dashboard/${card.id}`} className="text-decoration-none text-reset">
      <CCard className={folder ? 'h-100 shadow-sm' : 'h-100 border-0 bg-transparent shadow-none'}>
        <div className={folder ? 'border-bottom overflow-hidden' : 'overflow-hidden'}>
          <CardPreview card={card} processes={processes} />
        </div>
        <CCardBody className={`py-2 d-flex align-items-center gap-2 ${folder ? 'px-3' : 'px-1'}`}>
          <CIcon icon={cardIcon(card)} className="text-body-secondary flex-shrink-0" />
          <span className="fw-semibold text-truncate">{card.title}</span>
        </CCardBody>
      </CCard>
    </Link>
  )
}

const Level = ({ cards, items, layout, processes }) => {
  if (items.length === 0)
    return (
      <CAlert color="info">
        Nothing here yet - add cards in Service {'->'} Config {'->'} Dashboard.
      </CAlert>
    )
  if (layout === 'list') {
    return (
      <div className="list-group">
        {items.map((c) => (
          <Link
            key={c.id}
            to={`/dashboard/${c.id}`}
            className="list-group-item list-group-item-action d-flex align-items-center gap-2"
          >
            <CIcon icon={cardIcon(c)} className="text-body-secondary" />
            <span className="fw-semibold me-auto">{c.title}</span>
            {c.type === 'folder' && (
              <span className="small text-body-secondary">{childrenOf(cards, c.id).length}</span>
            )}
            <CIcon icon={cilChevronRight} className="text-body-secondary" />
          </Link>
        ))}
      </div>
    )
  }
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(16rem, 1fr))',
        gap: '1rem',
      }}
    >
      {items.map((c) => (
        <BlockCard key={c.id} card={c} processes={processes} />
      ))}
    </div>
  )
}

// "On the visible height": the component drawn at the page's width and
// scaled down (never up) until it fits the height left under it - no
// vertical scrolling; narrower then, centered. Measured live (the window,
// the component's own height as it loads and changes).
const FitHeight = ({ children }) => {
  const outer = useRef(null)
  const inner = useRef(null)
  const [box, setBox] = useState({ available: null, height: null, width: null })
  useLayoutEffect(() => {
    const measure = () => {
      if (!outer.current || !inner.current) return
      // the page footer stays visible under the component
      const footer = document.querySelector('.footer')?.offsetHeight ?? 0
      const available = window.innerHeight - outer.current.getBoundingClientRect().top - footer - 16
      setBox({ available, height: inner.current.offsetHeight, width: outer.current.clientWidth })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(inner.current)
    observer.observe(outer.current)
    window.addEventListener('resize', measure)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [])
  const scale = box.height && box.available > 0 ? Math.min(1, box.available / box.height) : 1
  return (
    <div
      ref={outer}
      style={{ height: box.height ? box.height * scale : undefined, overflow: 'hidden' }}
    >
      <div
        ref={inner}
        style={{
          width: box.width ?? '100%',
          transform: `scale(${scale})`,
          transformOrigin: 'top center',
        }}
      >
        {children}
      </div>
    </div>
  )
}

const Dashboard = () => {
  const { cardId } = useParams()
  const navigate = useNavigate()
  const [cards, setCards] = useState(null)
  const [processes, setProcesses] = useState([])
  const [error, setError] = useState(null)
  useEffect(() => {
    Promise.all([api.listDashboardCards(), api.listProcesses()])
      .then(([c, p]) => {
        setCards(c)
        setProcesses(p)
      })
      .catch((err) => setError(err.message))
  }, [])

  if (error) return <CAlert color="danger">{error}</CAlert>
  if (!cards) return <CSpinner size="sm" />

  // no tree yet - the older single slot, or the placeholder
  if (cards.length === 0) {
    if (dashboardContent.main) return <dashboardContent.main />
    return (
      <CCard className="mb-4">
        <CCardHeader>
          <strong>Dashboard</strong>
        </CCardHeader>
        <CCardBody>
          Nothing here yet - add cards in Service {'->'} Config {'->'} Dashboard.
        </CCardBody>
      </CCard>
    )
  }

  const card = cardId ? cards.find((c) => c.id === Number(cardId)) : null
  if (cardId && !card)
    return <CAlert color="warning">This card is not there (removed, or not visible to you).</CAlert>
  const path = card ? pathTo(cards, card) : []

  // the open level / card - plain text; the ones above it - links
  const crumb = (key, to, title, active) =>
    active ? (
      <CBreadcrumbItem key={key} active>
        {title}
      </CBreadcrumbItem>
    ) : (
      <CBreadcrumbItem
        key={key}
        href={`#${to}`}
        onClick={(e) => (e.preventDefault(), navigate(to))}
      >
        {title}
      </CBreadcrumbItem>
    )
  const breadcrumb = (
    <CBreadcrumb className="mb-3">
      {crumb('root', '/dashboard', 'Dashboard', !card)}
      {path.map((c, i) => crumb(c.id, `/dashboard/${c.id}`, c.title, i === path.length - 1))}
    </CBreadcrumb>
  )

  if (card?.type === 'component') {
    // fit-height - scaled to the visible height (FitHeight); fit-width -
    // the visible width: the component lays itself out in it (2026-10-16:
    // was its natural width - a wide part, e.g. a table, pushed the rest
    // out of view); what still can't shrink scrolls sideways
    return (
      <div>
        {breadcrumb}
        {card.view === 'fit-width' ? (
          <div style={{ width: '100%', overflowX: 'auto', overflowY: 'hidden' }}>
            <ComponentView card={card} processes={processes} />
          </div>
        ) : (
          <FitHeight key={card.id}>
            <ComponentView card={card} processes={processes} />
          </FitHeight>
        )}
      </div>
    )
  }

  return (
    <div>
      {breadcrumb}
      <Level
        cards={cards}
        items={childrenOf(cards, card ? card.id : null)}
        layout={card ? card.layout : 'blocks'}
        processes={processes}
      />
    </div>
  )
}

export default Dashboard
