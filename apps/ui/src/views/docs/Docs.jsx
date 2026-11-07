import React from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useTranslation } from 'react-i18next'
import PageTitle from '../../components/PageTitle'
import UpBreadcrumb from '../../components/UpBreadcrumb'
import { t } from 'src/i18n'

/**
 * The user guide (iot AGENTS_TO_DO.md 2026-10-31): the docs' one source - `docs/guide/` in this repo
 * (English; `docs/guide/<lang>/` - its translations, the same tree), bundled at build time; the same pages
 * make the site's /docs (nexus-edge-tech scripts/sync-docs.mjs) and the AI's documentation search.
 * The guide is a tree: a folder is a section (its index.md - the section's own page), any depth; a page's
 * place among its siblings - its front matter `order`. A page not yet translated shows in English.
 * Routes: /docs (the guide's index), /docs/<path> ("energy", "energy/strategies").
 */
const FILES = import.meta.glob('../../../../../docs/guide/**/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
})
const LOCALES = ['uk', 'de', 'es']
// the guide's screenshots - one English set, a light and a dark one each (docs/guide/_screens/<name>-<theme>.webp,
// taken by nexus-edge-tech scripts/capture-docs-screens.mjs); a page writes ![caption](screen:<name>)
const SHOTS = Object.fromEntries(
  Object.entries(
    import.meta.glob('../../../../../docs/guide/_screens/*.webp', {
      eager: true,
      import: 'default',
    }),
  ).map(([file, url]) => [file.match(/([^/]+)\.webp$/)[1], url]),
)

/** A page's front matter (title, description, order) and its body. */
const parse = (raw) => {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?/)
  const meta = {}
  if (m)
    for (const line of m[1].split('\n')) {
      const kv = line.match(/^(\w+):\s*(.*)$/)
      if (kv) meta[kv[1]] = kv[2].replace(/^"(.*)"$/, '$1').replace(/\\"/g, '"')
    }
  return { ...meta, body: m ? raw.slice(m[0].length) : raw }
}

// { lang: { id: page } } - the id: the path without ".md", a folder's index - the folder ("" - the root)
const PAGES = {}
for (const [file, raw] of Object.entries(FILES)) {
  const rel = file.split('/docs/guide/')[1]
  if (!rel) continue
  const parts = rel.replace(/\.md$/, '').split('/')
  const lang = LOCALES.includes(parts[0]) && parts.length > 1 ? parts.shift() : 'en'
  if (parts[parts.length - 1] === 'index') parts.pop()
  PAGES[lang] = PAGES[lang] ?? {}
  PAGES[lang][parts.join('/')] = parse(raw)
}
const pageOf = (id, lang) => PAGES[lang]?.[id] ?? PAGES.en?.[id] ?? null
const parentOf = (id) => (id.includes('/') ? id.slice(0, id.lastIndexOf('/')) : id ? '' : null)
// a page's children - by `order`, then the title
const childrenOf = (id) =>
  Object.keys(PAGES.en ?? {})
    .filter((k) => k !== id && parentOf(k) === id)
    .sort(
      (a, b) =>
        Number(PAGES.en[a].order ?? 999) - Number(PAGES.en[b].order ?? 999) ||
        PAGES.en[a].title.localeCompare(PAGES.en[b].title),
    )
const pathTo = (id) => (id ? `/docs/${id}` : '/docs')

// a link between the guide's pages - relative to the page, as the site's URLs ("strategies/", "../ai/")
const guideTarget = (href, fromId) => {
  if (!href || /^[a-z]+:/i.test(href) || href.startsWith('#')) return null
  const base = new URL(`http://guide/${fromId ? `${fromId}/` : ''}`)
  const id = new URL(href, base).pathname.replace(/^\/|\/$/g, '').replace(/(\/index)?\.md$/, '')
  return PAGES.en?.[id] ? id : null
}

/** The pages' tree: the root's children; a section's children shown while it is open. */
const Tree = ({ id, current, lang, depth = 0 }) =>
  childrenOf(id).map((c) => {
    const open = current === c || current.startsWith(`${c}/`)
    const hasChildren = childrenOf(c).length > 0
    return (
      <React.Fragment key={c}>
        <Link
          to={pathTo(c)}
          className={`nav-link ${current === c ? 'active fw-semibold' : 'text-body'}`}
          style={{ paddingInlineStart: `${0.75 + depth * 0.9}rem` }}
          aria-current={current === c ? 'page' : undefined}
        >
          {pageOf(c, lang)?.title ?? c}
        </Link>
        {hasChildren && open && <Tree id={c} current={current} lang={lang} depth={depth + 1} />}
      </React.Fragment>
    )
  })

const Docs = () => {
  const id = (useParams()['*'] ?? '').replace(/\/$/, '')
  const { i18n } = useTranslation()
  const navigate = useNavigate()
  const lang = i18n.resolvedLanguage
  const current = pageOf(id, lang)
  const ancestors = id
    ? id
        .split('/')
        .slice(0, -1)
        .map((_, i) =>
          id
            .split('/')
            .slice(0, i + 1)
            .join('/'),
        )
    : []
  const components = {
    table: ({ node, ...props }) => <table className="table table-sm" {...props} />,
    // a screenshot - the light and the dark one, the theme's shown (style.scss .ne-shot)
    img: ({ node, src, alt, ...props }) => {
      const name = src?.startsWith('screen:') ? src.slice('screen:'.length) : null
      if (!name) return <img src={src} alt={alt} className="ne-shot" {...props} />
      return (
        <>
          {['light', 'dark'].map((theme) =>
            SHOTS[`${name}-${theme}`] ? (
              <img
                key={theme}
                src={SHOTS[`${name}-${theme}`]}
                alt={alt}
                loading="lazy"
                className={`ne-shot ne-shot-${theme}`}
              />
            ) : null,
          )}
        </>
      )
    },
    a: ({ node, href, children, ...props }) => {
      const target = guideTarget(href, id)
      if (target !== null)
        return (
          <a
            href={`#${pathTo(target)}`}
            onClick={(e) => {
              e.preventDefault()
              navigate(pathTo(target))
            }}
            {...props}
          >
            {children}
          </a>
        )
      return (
        <a href={href} target="_blank" rel="noreferrer" {...props}>
          {children}
        </a>
      )
    },
  }
  // no frames (the user, 2026-10-31): the pages' tree and the text, a light line between them
  return (
    <div className="d-flex flex-column flex-lg-row align-items-stretch ne-docs-layout">
      <nav className="nav flex-column flex-shrink-0 ne-docs-nav" aria-label={t('Documentation')}>
        <Link
          to="/docs"
          className={`nav-link ${id === '' ? 'active fw-semibold' : 'text-body'}`}
          aria-current={id === '' ? 'page' : undefined}
        >
          {pageOf('', lang)?.title ?? t('Documentation')}
        </Link>
        <Tree id="" current={id} lang={lang} />
      </nav>
      <article className="flex-grow-1 ne-docs-text" style={{ minWidth: 0, maxWidth: 900 }}>
        {current ? (
          <>
            {/* the way here - the guide's root, the sections above, the page */}
            <UpBreadcrumb
              trail={[...ancestors, ...(id ? [id] : [])].map((up) => ({
                id: up,
                name: pageOf(up, lang)?.title ?? up,
              }))}
              onNavigate={(to) => navigate(pathTo(to ?? ''))}
              rootLabel={pageOf('', lang)?.title ?? t('Documentation')}
            />
            <PageTitle title={current.title} />
            {current.description && <p className="text-body-secondary mt-2">{current.description}</p>}
            {!PAGES[lang]?.[id] && lang !== 'en' && (
              <p className="small text-body-secondary fst-italic">
                {t('This page is not translated yet - shown in English.')}
              </p>
            )}
            {/* the section's pages: the title as a link, its short description under it */}
            {childrenOf(id).length > 0 && (
              <div className="ne-docs-sub">
                {childrenOf(id).map((c) => (
                  <div key={c} className="ne-docs-sub-item">
                    <Link to={pathTo(c)} className="link-primary text-decoration-none fw-semibold">
                      {pageOf(c, lang)?.title ?? c}
                    </Link>
                    {pageOf(c, lang)?.description && (
                      <div className="small text-body-secondary">{pageOf(c, lang).description}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
            <div className="ne-docs">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={components}
                urlTransform={(url) => (url.startsWith('screen:') ? url : defaultUrlTransform(url))}
              >
                {current.body}
              </ReactMarkdown>
            </div>
          </>
        ) : (
          t('The page you are looking for was not found.')
        )}
      </article>
    </div>
  )
}

export default Docs
