import React, { Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import { isSwitchLanding } from '../../roleSwitch'
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
// the picture block's height - a framed card's padding (p-2) and divider taken by an unframed one's picture,
// so every card's title sits at one height (the user, 2026-10-25)
const PREVIEW_H = `var(--dc-preview-h, ${PREVIEW_HEIGHT_REM}rem)`

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
      <Component
        process={process}
        params={card.params ?? {}}
        {...(scale ? { preview: true } : {})}
      />
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
        height: PREVIEW_H,
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

// Draws `children` at their natural size and scales them to fill the box -
// as large as fits both ways, centered (an unframed card's avatar - to the
// block's edges, AGENTS_TO_DO.md 2026-10-23 heating 9); `grow` false - only
// shrunk when larger than the box, never enlarged (a framed card's avatar -
// as it is, but whole); measured live.
const StretchBox = ({ grow = true, children }) => {
  const box = useRef(null)
  const inner = useRef(null)
  const [size, setSize] = useState(null)
  useLayoutEffect(() => {
    const measure = () => {
      if (!box.current || !inner.current) return
      setSize({
        width: box.current.clientWidth,
        height: box.current.clientHeight,
        naturalWidth: inner.current.offsetWidth,
        naturalHeight: inner.current.offsetHeight,
      })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(box.current)
    observer.observe(inner.current)
    return () => observer.disconnect()
  }, [])
  const scale =
    size?.naturalWidth && size?.naturalHeight
      ? Math.min(
          size.width / size.naturalWidth,
          size.height / size.naturalHeight,
          grow ? Infinity : 1,
        )
      : 0
  return (
    <div
      ref={box}
      style={{ position: 'relative', height: PREVIEW_H, overflow: 'hidden' }}
      aria-hidden="true"
    >
      <div
        ref={inner}
        style={{
          position: 'absolute',
          left: size ? (size.width - size.naturalWidth * scale) / 2 : 0,
          top: size ? (size.height - size.naturalHeight * scale) / 2 : 0,
          // its own size, not squeezed to the card's width
          width: 'max-content',
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
// the block (StretchBox: unframed - scaled to the block's edges; framed -
// as it is, shrunk only when larger than the block), or a `fit` one / a
// copy of the component scaled into the block (FitBox).
// a card's own uploaded picture (migration 091) - the URL carries its upload time (the cache)
export const cardImageUrl = (card, slot) =>
  card.id && card.picture?.[slot]
    ? `/api/dashboard-cards/${card.id}/images/${slot}?v=${card.picture[slot].at}`
    : null

const CardPreview = ({ card, processes, frame }) => {
  // no picture at all (the user, 2026-10-25) - the block empty (its background, if any, shows)
  if (card.picture?.hidden) return <div style={{ height: PREVIEW_H }} />
  // its own picture instead of the icon / the avatar, at its size (a share of the block's height; over
  // 100 % - larger than the block, only its middle seen)
  const own = card.picture?.useImage ? cardImageUrl(card, 'icon') : null
  if (own)
    return (
      <div
        className="d-flex align-items-center justify-content-center position-relative"
        style={{ height: PREVIEW_H }}
      >
        <img
          src={own}
          alt=""
          style={{
            height: `${card.picture.imageScalePct ?? 80}%`,
            maxWidth: (card.picture.imageScalePct ?? 80) > 100 ? 'none' : '100%',
            objectFit: 'contain',
            flexShrink: 0,
          }}
        />
      </div>
    )
  if (card.type === 'folder') {
    // framed - about 60 % of the block's height; unframed - the whole block
    const size = frame === 'none' ? PREVIEW_H : '6.6rem'
    return (
      <div
        className="d-flex align-items-center justify-content-center text-body-secondary"
        style={{ height: PREVIEW_H }}
      >
        <CIcon icon={cardIcon(card)} style={{ width: size, height: size }} />
      </div>
    )
  }
  const { def, process, problem } = resolve(card, processes)
  if (problem) return <div className="small text-warning p-2">{problem}</div>
  const avatar = avatarOf(def, card.preview)
  if (avatar && !avatar.fit) {
    const Avatar = avatar.Component
    return (
      <StretchBox grow={frame === 'none'}>
        <Suspense fallback={<CSpinner size="sm" />}>
          <Avatar process={process} params={card.params ?? {}} />
        </Suspense>
      </StretchBox>
    )
  }
  return (
    <FitBox>
      <Suspense fallback={<CSpinner size="sm" />}>
        {avatar ? (
          <avatar.Component process={process} params={card.params ?? {}} />
        ) : (
          <ComponentView card={card} processes={processes} scale />
        )}
      </Suspense>
    </FitBox>
  )
}

// A card's frame (`card.frame`, 2026-10-22): "none" - no border, background
// or divider, its picture to the block's edges; "border" - a border and the
// divider, no background, the picture padded; "filled" - a border, the
// divider and the card's background. Unset - a folder filled, a component
// none (the rule of 2026-10-16).
export const cardFrame = (card) => card.frame ?? (card.type === 'folder' ? 'filled' : 'none')

const FRAME_CLASSES = {
  none: 'h-100 border-0 bg-transparent shadow-none',
  // the border round the title's block only - the picture above to the card's edges (the user, 2026-10-25:
  // a light border round a dark image showed a pixel's gap)
  caption: 'h-100 border-0 bg-transparent shadow-none',
  border: 'h-100 bg-transparent shadow-none',
  filled: 'h-100 shadow-sm',
}

export const BlockCard = ({ card, processes, linked = true }) => {
  const frame = cardFrame(card)
  const caption = frame === 'caption'
  const framed = frame !== 'none' && !caption
  const body = (
    <CCard className={FRAME_CLASSES[frame]}>
      <div
        className={`position-relative ${framed ? 'border-bottom overflow-hidden p-2' : 'overflow-hidden'}`}
        // the pictures (an own image, a background) inside the card's rounded corners (the user,
        // 2026-10-25): framed - the top corners, the block's bottom meets the divider; unframed - all four
        style={
          framed
            ? {
                borderTopLeftRadius: 'var(--cui-card-inner-border-radius)',
                borderTopRightRadius: 'var(--cui-card-inner-border-radius)',
              }
            : caption
              ? {
                  // as tall as a framed one's (its padding, the card's top border) - the titles on one line
                  '--dc-preview-h': `calc(${PREVIEW_HEIGHT_REM}rem + 1rem + 1.2px)`,
                  borderTopLeftRadius: 'var(--cui-card-border-radius)',
                  borderTopRightRadius: 'var(--cui-card-border-radius)',
                }
              : {
                  '--dc-preview-h': `calc(${PREVIEW_HEIGHT_REM}rem + 1rem + 1px)`,
                  borderRadius: 'var(--cui-card-border-radius)',
                }
        }
      >
        {/* its own background (migration 091) - the whole top block, under the picture */}
        {cardImageUrl(card, 'background') && (
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              inset: 0,
              backgroundImage: `url(${cardImageUrl(card, 'background')})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              opacity: (card.picture.backgroundOpacityPct ?? 40) / 100,
              // its scale: 100 % - covers the block, over - larger (its middle seen), under - smaller, centred
              transform: `scale(${(card.picture.backgroundScalePct ?? 100) / 100})`,
              pointerEvents: 'none',
            }}
          />
        )}
        <div className="position-relative">
          <CardPreview card={card} processes={processes} frame={caption ? 'none' : frame} />
        </div>
      </div>
      <CCardBody
        className={`py-2 d-flex align-items-center justify-content-center gap-2 ${framed || caption ? 'px-3' : 'px-1'}`}
        style={
          caption
            ? {
                border: '1px solid var(--cui-border-color)',
                borderBottomLeftRadius: 'var(--cui-card-border-radius)',
                borderBottomRightRadius: 'var(--cui-card-border-radius)',
                background: 'var(--cui-card-bg, var(--cui-body-bg))',
              }
            : undefined
        }
      >
        <CIcon icon={cardIcon(card)} className="text-body-secondary flex-shrink-0" />
        <span className="fw-semibold text-truncate">{card.title}</span>
      </CCardBody>
    </CCard>
  )
  return linked ? (
    <Link to={`/dashboard/${card.id}`} className="text-decoration-none text-reset">
      {body}
    </Link>
  ) : (
    body
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
  const { pathname } = useLocation()
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
    // right after a role switch - a folder the new role doesn't see: the Dashboard's top (roleSwitch.js)
    return isSwitchLanding(pathname) ? (
      <Navigate to="/dashboard" replace />
    ) : (
      <CAlert color="warning">This card is not there (removed, or not visible to you).</CAlert>
    )
  const path = card ? pathTo(cards, card) : []

  // the open level / card - plain text; the ones above it - links
  // (the AI button moved from here to the page's title - the user, 2026-10-25)
  const crumb = (key, to, title, active) =>
    active ? (
      <CBreadcrumbItem key={key} active>
        {title}
      </CBreadcrumbItem>
    ) : (
      <CBreadcrumbItem key={key}>
        <a
          href={`#${to}`}
          className="link-primary text-decoration-none"
          onClick={(e) => (e.preventDefault(), navigate(to))}
        >
          {title}
        </a>
      </CBreadcrumbItem>
    )
  const breadcrumb = (
    <CBreadcrumb className="mb-3 fw-semibold">
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
