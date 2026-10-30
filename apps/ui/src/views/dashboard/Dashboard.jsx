import React, { Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import { isSwitchLanding } from '../../roleSwitch'
import {
  CAlert,
  CBreadcrumb,
  CButton,
  CBreadcrumbItem,
  CCard,
  CCardBody,
  CCardHeader,
  CSpinner,
} from '@coreui/react'
import CIcon from '@coreui/icons-react'
import { cilChevronRight, cilResizeHeight, cilResizeWidth } from '@coreui/icons'
import { usePersistedState } from '../../hooks/usePersistedState'
import { api } from '../../api/client'
import { dashboardComponents, dashboardContent } from '../../dashboardRegistry'
import { cardIcon } from '../../dashboardIcons'

/**
 * The Dashboard (Dashboard cards, 2026-10-16): the card tree built in
 * Service -> Config -> Dashboard (one for the whole system). A level -
 * the root or a folder - shows its cards as blocks or a list (the
 * folder's own `layout`); a folder opens its children, an avatar card
 * opens its component on the whole page by its `view` (or the viewer's own
 * fit - `userFit`); a component card is drawn at the level's full width
 * under its blocks (migration 100). Each card has its
 * address (`#/dashboard/<id>`) - Back and links work. An avatar card
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
const FitBox = ({ factor = 1, children }) => {
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
  const scale = size?.natural
    ? Math.min(size.width / PREVIEW_WIDTH, size.height / size.natural) * factor
    : 0
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
// as it is, but whole); measured live. Scaled by CSS `zoom`, not a transform
// (the user, 2026-10-30 - the cards' texts shimmered): a zoomed picture is laid
// out at its real size, its text drawn as any other, never a scaled raster
// re-drawn beside the cards' animations; its place on whole pixels.
const StretchBox = ({ grow = true, factor = 1, children }) => {
  const box = useRef(null)
  const inner = useRef(null)
  // the zoom now applied - the natural size is the drawn one over it
  const applied = useRef(1)
  const [size, setSize] = useState(null)
  useLayoutEffect(() => {
    const measure = () => {
      if (!box.current || !inner.current) return
      const rect = inner.current.getBoundingClientRect()
      const next = {
        width: box.current.clientWidth,
        height: box.current.clientHeight,
        naturalWidth: Math.round(rect.width / applied.current),
        naturalHeight: Math.round(rect.height / applied.current),
      }
      // the same within a pixel - no new render (the zoom's own rounding never loops)
      setSize((prev) =>
        prev &&
        prev.width === next.width &&
        prev.height === next.height &&
        Math.abs(prev.naturalWidth - next.naturalWidth) <= 1 &&
        Math.abs(prev.naturalHeight - next.naturalHeight) <= 1
          ? prev
          : next,
      )
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
        ) * factor
      : 0
  // eslint-disable-next-line react-hooks/refs -- the zoom drawn this render, read by the next measure
  applied.current = scale || 1
  return (
    <div
      ref={box}
      // the picture is the card's (a link) - its own titles' tooltips would flicker over it (the user,
      // 2026-10-29), so no pointer events inside, as FitBox
      style={{ position: 'relative', height: PREVIEW_H, overflow: 'hidden', pointerEvents: 'none' }}
      aria-hidden="true"
    >
      <div
        style={{
          position: 'absolute',
          left: size ? Math.round((size.width - size.naturalWidth * scale) / 2) : 0,
          top: size ? Math.round((size.height - size.naturalHeight * scale) / 2) : 0,
        }}
      >
        <div
          ref={inner}
          style={{
            // its own size, not squeezed to the card's width
            width: 'max-content',
            zoom: scale || 1,
            visibility: scale ? 'visible' : 'hidden',
          }}
        >
          {children}
        </div>
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

// a card's own uploaded picture (migration 091) - the URL carries its upload time (the cache)
export const cardImageUrl = (card, slot) =>
  card.id && card.picture?.[slot]
    ? `/api/dashboard-cards/${card.id}/images/${slot}?v=${card.picture[slot].at}`
    : null

/** The picture's source (migration 100): "none" | "avatar" | "icon" | "file"; unset - the type's default. */
export const pictureSource = (card) =>
  card.picture?.source ?? (card.type === 'folder' ? 'icon' : 'avatar')

// The card's picture by its source: none - the block empty (its background, if any, shows); an uploaded
// file or an icon from the set - at its size (a share of the block's height; over 100 % - larger than the
// block, only its middle seen); the component's avatar - one made for the block (StretchBox: unpadded -
// scaled to the block's edges, padded - as it is, shrunk only when larger), or a `fit` one / a copy of the
// component scaled into the block (FitBox), its size slider a factor on that.
const CardPreview = ({ card, processes, padded }) => {
  const source = pictureSource(card)
  const sizePct = card.picture?.imageScalePct
  if (source === 'none') return <div style={{ height: PREVIEW_H }} />
  const own = source === 'file' ? cardImageUrl(card, 'icon') : null
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
            height: `${sizePct ?? 80}%`,
            maxWidth: (sizePct ?? 80) > 100 ? 'none' : '100%',
            objectFit: 'contain',
            flexShrink: 0,
          }}
        />
      </div>
    )
  if (source !== 'avatar' || card.type === 'folder') {
    // padded - about 60 % of the block's height; unpadded - the whole block
    const size = `${sizePct ?? (padded ? 60 : 100)}%`
    return (
      <div
        className="d-flex align-items-center justify-content-center text-body-secondary"
        style={{ height: PREVIEW_H }}
      >
        <CIcon icon={cardIcon(card)} style={{ width: 'auto', height: size, flexShrink: 0 }} />
      </div>
    )
  }
  const { def, process, problem } = resolve(card, processes)
  if (problem) return <div className="small text-warning p-2">{problem}</div>
  const avatar = avatarOf(def, card.preview)
  const factor = (sizePct ?? 100) / 100
  if (avatar && !avatar.fit) {
    const Avatar = avatar.Component
    return (
      <StretchBox grow={!padded} factor={factor}>
        <Suspense fallback={<CSpinner size="sm" />}>
          <Avatar process={process} params={card.params ?? {}} />
        </Suspense>
      </StretchBox>
    )
  }
  return (
    <FitBox factor={factor}>
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

// A card's frame (migration 100, the user 2026-10-29): its parts, each on or off - `top` the picture's
// block bordered (the picture padded), `middle` the line between it and the title, `bottom` the title's
// block bordered, `fill` the card's background; top and bottom both - one border round the card. Unset -
// a folder all of them, an avatar none (the rule of 2026-10-16).
const ALL_PARTS = { top: true, middle: true, bottom: true, fill: true }
const NO_PARTS = { top: false, middle: false, bottom: false, fill: false }
export const cardFrame = (card) => card.frame ?? (card.type === 'folder' ? ALL_PARTS : NO_PARTS)

const BORDER = '1px solid var(--cui-border-color)'
const RADIUS = 'var(--cui-card-border-radius)'

export const BlockCard = ({ card, processes, linked = true }) => {
  const { top, middle, bottom, fill } = cardFrame(card)
  const outline = top && bottom
  // the four cases: one border round the card (the middle line inside, if on); the picture's block in
  // its own box; the title's block in its own box (the frame of 2026-10-25 "caption"); no box - the
  // middle line only, if on. The pictures (an own image, a background) inside the rounded corners (the
  // user, 2026-10-25).
  const box = { border: BORDER }
  const pictureStyle = outline
    ? {
        borderTopLeftRadius: 'var(--cui-card-inner-border-radius)',
        borderTopRightRadius: 'var(--cui-card-inner-border-radius)',
        ...(middle ? { borderBottom: BORDER } : {}),
      }
    : top
      ? { ...box, borderRadius: RADIUS }
      : bottom
        ? { borderTopLeftRadius: RADIUS, borderTopRightRadius: RADIUS }
        : { borderRadius: RADIUS, ...(middle ? { borderBottom: BORDER } : {}) }
  const captionStyle =
    bottom && !outline
      ? { ...box, borderBottomLeftRadius: RADIUS, borderBottomRightRadius: RADIUS }
      : undefined
  const body = (
    <CCard
      className={`h-100 ${outline ? '' : 'border-0'} ${fill ? 'shadow-sm' : 'bg-transparent shadow-none'}`}
    >
      <div
        className={`position-relative overflow-hidden ${top ? 'p-2' : ''}`}
        style={{
          ...pictureStyle,
          // the picture's block as tall in every frame - the titles on one line (the padding and the
          // border it lacks given to the picture)
          ...(top ? {} : { '--dc-preview-h': `calc(${PREVIEW_HEIGHT_REM}rem + 1rem + 1px)` }),
        }}
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
          <CardPreview card={card} processes={processes} padded={top} />
        </div>
      </div>
      <CCardBody
        className={`py-2 d-flex align-items-center justify-content-center gap-2 ${top || bottom ? 'px-3' : 'px-1'}`}
        style={captionStyle}
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

// A level's components (migration 100) - each at the level's full width under its blocks, its title
// over it (unless its frame's `title` is off - the user, 2026-10-30), laid out in the width (a component
// on the whole page is an avatar's)
const InlineComponents = ({ items, processes }) =>
  items.map((c) => (
    <section key={c.id} className="mt-4" aria-label={c.title}>
      {c.frame?.title !== false && <div className="fw-semibold mb-2">{c.title}</div>}
      <div style={{ width: '100%', overflowX: 'auto', overflowY: 'hidden' }}>
        <ComponentView card={c} processes={processes} />
      </div>
    </section>
  ))

const Level = ({ cards, items, layout, processes }) => {
  const blocks = items.filter((c) => c.type !== 'component')
  const inline = items.filter((c) => c.type === 'component')
  if (items.length === 0)
    return (
      <CAlert color="info">
        Nothing here yet - add cards in Service {'->'} Config {'->'} Dashboard.
      </CAlert>
    )
  const top =
    blocks.length === 0 ? null : layout === 'list' ? (
      <div className="list-group">
        {blocks.map((c) => (
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
    ) : (
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(16rem, 1fr))',
          gap: '1rem',
        }}
      >
        {blocks.map((c) => (
          <BlockCard key={c.id} card={c} processes={processes} />
        ))}
      </div>
    )
  return (
    <>
      {top}
      <InlineComponents items={inline} processes={processes} />
    </>
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
  // the viewer's own fit of an opened avatar (its card's "Viewer can switch the fit"): {cardId: view}
  const [viewed, setViewed] = usePersistedState('nexusedge.dashboard', { fit: {} })
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
  const opened = card && card.type !== 'folder'
  // the card's `view` - the default; with "Viewer can switch the fit" - the viewer's own choice, kept
  const view = (opened && card.userFit && viewed.fit?.[card.id]) || card?.view
  const fitSwitch = opened && card.userFit && (
    <div className="btn-group" role="group" aria-label="Fit">
      {[
        ['fit-width', cilResizeWidth, 'Fit the width - laid out in it'],
        ['fit-height', cilResizeHeight, 'Fit the height - scaled to fit, no scrolling'],
      ].map(([key, icon, hint]) => (
        <CButton
          key={key}
          size="sm"
          color="secondary"
          variant={view === key ? undefined : 'outline'}
          aria-pressed={view === key}
          title={hint}
          aria-label={hint}
          onClick={() => setViewed({ fit: { ...viewed.fit, [card.id]: key } })}
        >
          <CIcon icon={icon} />
        </CButton>
      ))}
    </div>
  )
  const breadcrumb = (
    <div className="d-flex align-items-center justify-content-between gap-2 mb-3">
      <CBreadcrumb className="mb-0 fw-semibold">
        {crumb('root', '/dashboard', 'Dashboard', !card)}
        {path.map((c, i) => crumb(c.id, `/dashboard/${c.id}`, c.title, i === path.length - 1))}
      </CBreadcrumb>
      {fitSwitch}
    </div>
  )

  if (opened) {
    // an avatar's component on the whole page (a component card opened by its address - the same);
    // fit-height - scaled to the visible height (FitHeight); fit-width - the visible width: the
    // component lays itself out in it (2026-10-16: was its natural width - a wide part, e.g. a table,
    // pushed the rest out of view); what still can't shrink scrolls sideways
    return (
      <div>
        {breadcrumb}
        {view === 'fit-width' ? (
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
