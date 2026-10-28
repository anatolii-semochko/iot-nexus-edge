import React, { useEffect, useMemo, useState } from 'react'
import {
  CAlert,
  CBadge,
  CButton,
  CCol,
  CFormCheck,
  CFormInput,
  CFormLabel,
  CFormSelect,
  CFormSwitch,
  CModal,
  CModalBody,
  CModalFooter,
  CModalHeader,
  CModalTitle,
  CNav,
  CNavItem,
  CNavLink,
  CRow,
  CSpinner,
  CTable,
  CTableBody,
  CTableDataCell,
  CTableHead,
  CTableHeaderCell,
  CTableRow,
} from '@coreui/react'
import CIcon from '@coreui/icons-react'
import { cilCheckAlt, cilPlus, cilTrash, cilX } from '@coreui/icons'
import { api } from '../../api/client'
import { canAny, pageKey, permissionsForPath, useCan } from '../../access'
import navigation from '../../_nav'
import SearchChecklist from '../../components/SearchChecklist'
import { AiTokensInput, AiTokensMark, parseAiTokens } from './AiTokens'
import { AvatarRow, RoleAvatar, RoleLevelBadge, UserAvatar } from './Avatars'

/**
 * Users -> Roles (2026-10-27 - roles without groups; api routes/access.ts, access/rights.ts): a role is
 * what a person acts as (the header's menu) - a table object x level:
 * - the system sections (Dashboard, AI Assistant, Logs, ...) - each with the levels it has;
 * - "Every other object" and the objects added (DNP instances) - View / Control / Configure; an
 *   object's row replaces "Every other object" (up or down). A higher level brings the lower ones.
 *   The pages and the menu follow from the rows. The AI Assistant and Logs open by their section, on
 *   the objects viewed.
 * - the Dashboard cards it shows (all, or chosen), its link name (`?account=`), its AI tokens a day,
 *   its members. "Copy" - a new role from this one. Administrator and System service hold everything.
 * The form shows only what the choices above make relevant (the Dashboard's cards - with its View, the
 * AI tokens - with the AI Assistant's View; the cards - of the objects the role sees, "Show all" for
 * the rest). Without users.manage - read only.
 */

const LEVEL_LABELS = { view: 'View', control: 'Control', config: 'Configure' }
const LEVEL_HINTS = {
  view: 'See it - its pages, values, state',
  control: 'Operate it - ON / OFF, setpoints, commands, manual values',
  config: "An engineer's - its settings, registry, simulation",
}
// a row's quick choice (a level brings the lower ones)
const TEMPLATES = [
  ['', 'Nothing', []],
  ['viewer', 'Viewer', ['view']],
  ['operator', 'Operator', ['view', 'control']],
  ['engineer', 'Engineer', ['view', 'control', 'config']],
]
const ALL = '*'

// the role form's tabs - one part each (2026-10-27: the form was too much at once)
const FORM_TABS = [
  ['general', 'General'],
  ['sections', 'Sections'],
  ['objects', 'Objects'],
  ['dashboard', 'Dashboard'],
  ['pages', 'Pages'],
]

// the header's messages (the notification centre) - a "page" of the role's own
const MESSAGES = { to: '/messages', name: 'Messages in the header' }

/**
 * The role's pages (2026-10-27): each menu entry and the header's messages - on / off in the role; a page
 * opens when the role shows it AND its rights let it (which row opens it - api POST
 * /access/rights/preview, before saving). Only the Dashboard - no menu at all. Shown only - the rights
 * decide what may be read or done (the Dashboard reads the same data).
 */
const PagesTab = ({ rights, full, pages, onChange, disabled }) => {
  const [preview, setPreview] = useState(null)
  const [error, setError] = useState(null)
  useEffect(() => {
    let cancelled = false
    const t = setTimeout(() => {
      api
        .previewRights({ rights, full })
        .then((p) => !cancelled && (setPreview(p), setError(null)))
        .catch((err) => !cancelled && setError(err.message))
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [rights, full])
  if (error) return <CAlert color="danger">{error}</CAlert>
  if (!preview) return <CSpinner size="sm" />
  // the shape access.js checks (a scoped action - on some objects)
  const access = {
    global: preview.global,
    scoped: Object.fromEntries(
      Object.keys(preview.scoped).map((a) => [a, { processes: [], nodes: [], devices: [] }]),
    ),
  }
  const where = (a) =>
    preview.global.includes('*') || preview.global.includes(a)
      ? 'everywhere'
      : preview.scoped[a]
        ? `on ${preview.scoped[a]} object${preview.scoped[a] === 1 ? '' : 's'}`
        : null
  const entries = [...navigation.filter((item) => item.to), MESSAGES]
  const keys = entries.map((e) => pageKey(e.to))
  const shown = (key) => pages === null || pages.includes(key)
  const toggle = (key) => {
    const now = pages ?? keys
    const next = now.includes(key) ? now.filter((k) => k !== key) : [...now, key]
    // every page on - null (a new page added later shows too)
    onChange(keys.every((k) => next.includes(k)) ? null : next)
  }
  const opened = entries.filter(
    (e) => shown(pageKey(e.to)) && canAny(access, permissionsForPath(e.to)),
  )
  return (
    <>
      <div className="small text-body-secondary">
        The pages the role shows. A page opens when it is on here and the rights (Sections, Objects)
        let it. An owner, an operator, a visitor work on the Dashboard - their rights let it read
        the devices, the pages need not show. Only the Dashboard - no menu at all.
      </div>
      <CTable small className="align-middle mb-0">
        <CTableHead>
          <CTableRow>
            <CTableHeaderCell>Page</CTableHeaderCell>
            <CTableHeaderCell className="text-center">Shown</CTableHeaderCell>
            <CTableHeaderCell>The rights</CTableHeaderCell>
          </CTableRow>
        </CTableHead>
        <CTableBody>
          {entries.map((item) => {
            const key = pageKey(item.to)
            const needs = permissionsForPath(item.to) ?? []
            const ok = canAny(access, needs)
            const giving = needs.filter(where)
            return (
              <CTableRow key={key}>
                <CTableDataCell>{item.name}</CTableDataCell>
                <CTableDataCell className="text-center">
                  <CFormCheck
                    id={`page-${key}`}
                    aria-label={`${item.name} shown`}
                    checked={full || shown(key)}
                    disabled={disabled || full}
                    onChange={() => toggle(key)}
                  />
                </CTableDataCell>
                <CTableDataCell className={`small ${ok ? '' : 'text-body-tertiary'}`}>
                  {needs.length === 0
                    ? 'no right needed'
                    : ok
                      ? `opened by ${giving.map((a) => `${preview.sources[a] ?? a} (${where(a)})`).join('; ')}`
                      : `closed - needs ${[...new Set(needs.map((a) => preview.sources[a] ?? a))].join(' or ')}`}
                </CTableDataCell>
              </CTableRow>
            )
          })}
        </CTableBody>
      </CTable>
      <div className="small">
        The role gets: <strong>{opened.map((e) => e.name).join(', ') || 'nothing'}</strong>
        {opened.filter((e) => e.to !== MESSAGES.to).length <= 1 && ' - no menu'}
      </div>
    </>
  )
}

const withLower = (levels, order) => {
  const top = Math.max(-1, ...levels.map((l) => order.indexOf(l)))
  return order.slice(0, top + 1)
}

/** One row's level checkboxes: checking a level checks the lower ones, unchecking - the higher ones. */
const LevelCells = ({ id, offered, all, value, onChange, disabled }) =>
  all.map((l) => (
    <CTableDataCell key={l} className="text-center">
      {offered.includes(l) && (
        <CFormCheck
          id={`${id}-${l}`}
          aria-label={`${LEVEL_LABELS[l]}`}
          checked={value.includes(l)}
          disabled={disabled}
          onChange={(e) => {
            const i = all.indexOf(l)
            onChange(
              e.target.checked
                ? withLower([...value, l], all).filter((x) => offered.includes(x))
                : value.filter((x) => all.indexOf(x) < i),
            )
          }}
        />
      )}
    </CTableDataCell>
  ))

const templateOf = (levels) => TEMPLATES.find(([, , t]) => t.join() === levels.join())?.[0] ?? 'own'

const cardLabel = (c) => c.title || c.componentKey || `#${c.id}`

const personName = (u) => u.display_name ?? u.username

const has = (rights, key, level) => (rights[key] ?? []).includes(level)

/** The cards as a tree list (folders first by position), with each card's depth. */
const cardTree = (cards) => {
  const children = new Map()
  for (const c of cards) children.set(c.parentId, [...(children.get(c.parentId) ?? []), c])
  const out = []
  const walk = (parentId, depth) =>
    (children.get(parentId) ?? []).forEach((c) => {
      out.push({ ...c, depth })
      walk(c.id, depth + 1)
    })
  walk(null, 0)
  return out
}

const RoleForm = ({ role, copyOf, objectsInfo, users, cards, readOnly, onClose, onSaved }) => {
  const source = role ?? copyOf
  const [key, setKey] = useState(role?.key ?? '')
  const [name, setName] = useState(role?.name ?? (copyOf ? `${copyOf.name} (copy)` : ''))
  const [linkKey, setLinkKey] = useState(role?.linkKey ?? '')
  const [aiTokens, setAiTokens] = useState(source?.aiDailyTokens ?? '')
  const [rights, setRights] = useState(source?.rights ?? {})
  const [dashboard, setDashboard] = useState(source?.dashboard ?? null)
  const [pages, setPages] = useState(source?.pages ?? null)
  const [memberIds, setMemberIds] = useState(role?.memberIds ?? [])
  const [adding, setAdding] = useState([])
  const [rowQuery, setRowQuery] = useState('')
  const [tab, setTab] = useState('general')
  const [allCards, setAllCards] = useState(false)
  const [saving, setBusy] = useState(false)
  const busy = saving || readOnly
  const [error, setError] = useState(null)
  const full = Boolean(role?.full)
  const service = Boolean(role?.service)
  const levels = objectsInfo.levels
  const objectName = useMemo(
    () => new Map(objectsInfo.objects.map((o) => [o.key, o])),
    [objectsInfo.objects],
  )
  const objectRows = Object.keys(rights)
    .filter((k) => k !== ALL && !k.startsWith('section:'))
    .sort((a, b) => (objectName.get(a)?.name ?? a).localeCompare(objectName.get(b)?.name ?? b))
  const words = rowQuery.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const matches = (text) => words.every((w) => text.toLowerCase().includes(w))
  const setRow = (object, value) => setRights((r) => ({ ...r, [object]: value }))
  const removeRow = (object) =>
    setRights((r) => {
      const next = { ...r }
      delete next[object]
      return next
    })
  const people = users.filter((u) => !u.service)
  const tree = useMemo(() => cardTree(cards), [cards])
  const byId = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards])
  // a card's detail: its process and the folders it is in (many cards share a title - "Heating")
  const cardDetail = (c) => {
    const path = []
    for (let p = byId.get(c.parentId); p; p = byId.get(p.parentId)) path.unshift(cardLabel(p))
    const process = c.processId != null ? objectsInfo.processNames?.[c.processId] : null
    return [c.type === 'folder' ? 'folder' : process, path.join(' / ')].filter(Boolean).join(', ')
  }
  // the cards this role's objects show (a process's - where it sees the process; the core's own - with
  // any object seen; a folder - with a relevant card inside)
  const relevant = useMemo(() => {
    if (full) return null
    const seen = new Set()
    let anyObject = false
    for (const o of objectsInfo.objects) {
      if ((rights[o.key] ?? rights[ALL] ?? []).includes('view')) {
        anyObject = true
        o.processIds.forEach((id) => seen.add(id))
      }
    }
    const ok = new Set()
    const visit = (c) => {
      const kids = cards.filter((x) => x.parentId === c.id).map(visit)
      const yes =
        c.type === 'folder'
          ? kids.some(Boolean)
          : c.processId != null
            ? seen.has(c.processId)
            : anyObject
      if (yes) ok.add(c.id)
      return yes
    }
    cards.filter((c) => c.parentId == null).forEach(visit)
    return ok
  }, [full, rights, objectsInfo.objects, cards])
  const dashboardView = full || has(rights, 'section:dashboard', 'view')
  const dashboardArranges = full || has(rights, 'section:dashboard', 'config')
  const aiOn = full || has(rights, 'section:ai', 'view')
  const toggleCard = (id) => {
    const chosen = new Set(dashboard ?? [])
    const byId = new Map(cards.map((c) => [c.id, c]))
    const below = (cid) =>
      cards.filter((c) => c.parentId === cid).flatMap((c) => [c.id, ...below(c.id)])
    if (chosen.has(id)) [id, ...below(id)].forEach((x) => chosen.delete(x))
    else {
      ;[id, ...below(id)].forEach((x) => chosen.add(x))
      // its folders too - a hidden folder hides what is inside
      for (let p = byId.get(id)?.parentId; p != null; p = byId.get(p)?.parentId) chosen.add(p)
    }
    setDashboard([...chosen])
  }

  const save = async () => {
    const aiDailyTokens = parseAiTokens(aiTokens)
    if (aiDailyTokens === undefined) return setError('AI tokens a day: empty, 0 or a whole number')
    setBusy(true)
    setError(null)
    try {
      const body = {
        name,
        linkKey,
        aiDailyTokens,
        dashboard,
        pages,
        ...(full ? {} : { rights }),
        ...(service ? {} : { memberIds }),
      }
      if (role) await api.updateRole(role.key, body)
      else await api.createRole({ key, ...body })
      onSaved()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }
  const remove = async () => {
    setBusy(true)
    try {
      await api.deleteRole(role.key)
      onSaved()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  const header = (
    <CTableHead>
      <CTableRow>
        <CTableHeaderCell>Object</CTableHeaderCell>
        {levels.map((l) => (
          <CTableHeaderCell key={l} className="text-center" title={LEVEL_HINTS[l]}>
            {LEVEL_LABELS[l]}
          </CTableHeaderCell>
        ))}
        <CTableHeaderCell style={{ width: '12rem' }} />
      </CTableRow>
    </CTableHead>
  )
  const objectRow = (object, label, detail, removable) => (
    <CTableRow key={object}>
      <CTableDataCell>
        <div className={object === ALL ? 'fw-semibold' : ''}>{label}</div>
        {detail && <div className="small text-body-secondary">{detail}</div>}
      </CTableDataCell>
      <LevelCells
        id={`row-${object}`}
        offered={levels}
        all={levels}
        value={rights[object] ?? []}
        onChange={(v) => setRow(object, v)}
        disabled={busy}
      />
      <CTableDataCell className="text-nowrap">
        <div className="d-flex gap-1 align-items-center">
          <CFormSelect
            size="sm"
            aria-label={`${label} - a quick choice`}
            value={templateOf(rights[object] ?? [])}
            disabled={busy}
            onChange={(e) =>
              setRow(object, TEMPLATES.find(([k]) => k === e.target.value)?.[2] ?? [])
            }
          >
            {TEMPLATES.map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
            <option value="own" disabled>
              Own
            </option>
          </CFormSelect>
          {removable && (
            <CButton
              size="sm"
              color="danger"
              variant="ghost"
              title="Remove the row - the object follows Every other object"
              aria-label={`Remove ${label}`}
              disabled={busy}
              onClick={() => removeRow(object)}
            >
              <CIcon icon={cilTrash} />
            </CButton>
          )}
        </div>
      </CTableDataCell>
    </CTableRow>
  )

  return (
    <CModal visible size="xl" onClose={onClose} backdrop="static">
      <CModalHeader>
        <CModalTitle>
          {role ? `Role ${role.name}` : copyOf ? `A copy of ${copyOf.name}` : 'New role'}
        </CModalTitle>
      </CModalHeader>
      <CModalBody className="d-flex flex-column gap-3">
        {error && <CAlert color="danger">{error}</CAlert>}
        <CNav variant="tabs" role="tablist">
          {FORM_TABS.map(([k, label]) => (
            <CNavItem key={k}>
              <CNavLink
                href="#"
                active={tab === k}
                onClick={(e) => {
                  e.preventDefault()
                  setTab(k)
                }}
              >
                {label}
              </CNavLink>
            </CNavItem>
          ))}
        </CNav>
        {tab === 'general' && (
          <>
            <CRow className="g-3">
              <CCol md={4}>
                <CFormLabel>Name</CFormLabel>
                <CFormInput
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={busy}
                />
              </CCol>
              <CCol md={3}>
                <CFormLabel>Key</CFormLabel>
                <CFormInput
                  value={key}
                  onChange={(e) => setKey(e.target.value.toLowerCase())}
                  disabled={busy || Boolean(role)}
                  placeholder="e.g. energy-operator"
                />
              </CCol>
              <CCol md={2}>
                <CFormLabel title="A link with ?account=<it> opens the application in this role">
                  Link name
                </CFormLabel>
                <CFormInput
                  value={linkKey}
                  placeholder="none"
                  maxLength={40}
                  onChange={(e) => setLinkKey(e.target.value)}
                  disabled={busy}
                />
              </CCol>
              {aiOn && (
                <CCol md={3}>
                  <AiTokensInput
                    id="role-ai-tokens"
                    value={aiTokens}
                    onChange={setAiTokens}
                    disabled={busy}
                  />
                </CCol>
              )}
            </CRow>
            <div>
              <h6>Members</h6>
              {service ? (
                <div className="small text-body-secondary">
                  The internal services&apos; accounts - fixed.
                </div>
              ) : (
                <SearchChecklist
                  id="role-members"
                  items={people.map((u) => ({
                    key: u.id,
                    label: personName(u),
                    detail: u.guest ? 'the guest' : u.username,
                  }))}
                  selected={memberIds}
                  onToggle={(id) =>
                    setMemberIds((ids) =>
                      ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id],
                    )
                  }
                  disabled={busy}
                />
              )}
            </div>
          </>
        )}
        {(tab === 'sections' || tab === 'objects') && full && (
          <CAlert color="info" className="mb-0">
            This role always holds everything.
          </CAlert>
        )}
        {tab === 'sections' && !full && (
          <>
            <div className="small text-body-secondary">
              The system&apos;s sections - each with the levels it has. The AI Assistant, Logs and
              Simulation work on the objects the role views (the Objects tab).
            </div>
            <CTable small className="align-middle mb-3">
              {header}
              <CTableBody>
                {objectsInfo.sections.map((s) => (
                  <CTableRow key={s.key}>
                    <CTableDataCell>{s.label}</CTableDataCell>
                    <LevelCells
                      id={`row-${s.key}`}
                      offered={s.levels}
                      all={levels}
                      value={rights[s.key] ?? []}
                      onChange={(v) => setRow(s.key, v)}
                      disabled={busy}
                    />
                    <CTableDataCell />
                  </CTableRow>
                ))}
              </CTableBody>
            </CTable>
          </>
        )}
        {tab === 'objects' && !full && (
          <>
            <div className="small text-body-secondary">
              The installations and processes. &quot;Every other object&quot; - the level of every
              object without a row of its own; an object&apos;s row replaces it (up or down).
            </div>
            <div className="d-flex gap-2 align-items-center mb-1">
              <span className="small text-body-secondary">
                The objects - every other one, and those with rights of their own (
                {objectRows.length})
              </span>
              <CFormInput
                size="sm"
                type="search"
                placeholder="Search"
                aria-label="Search the objects' rows"
                value={rowQuery}
                onChange={(e) => setRowQuery(e.target.value)}
                style={{ maxWidth: '14rem' }}
                className="ms-auto"
              />
            </div>
            <CTable small className="align-middle mb-2">
              {header}
              <CTableBody>
                {objectRow(
                  ALL,
                  'Every other object',
                  'the objects with no row of their own',
                  false,
                )}
                {objectRows
                  .filter((k) =>
                    matches(`${objectName.get(k)?.name ?? k} ${objectName.get(k)?.detail ?? ''}`),
                  )
                  .map((k) =>
                    objectRow(k, objectName.get(k)?.name ?? k, objectName.get(k)?.detail, true),
                  )}
              </CTableBody>
            </CTable>
            {!readOnly && (
              <>
                <SearchChecklist
                  id="role-add-objects"
                  label="Add objects with rights of their own"
                  items={objectsInfo.objects
                    .filter((o) => !(o.key in rights))
                    .map((o) => ({ key: o.key, label: o.name, detail: o.detail }))}
                  selected={adding}
                  onToggle={(k) =>
                    setAdding((a) => (a.includes(k) ? a.filter((x) => x !== k) : [...a, k]))
                  }
                  disabled={busy}
                  maxHeight="10rem"
                  empty="Every object has a row."
                />
                <CButton
                  size="sm"
                  color="primary"
                  variant="outline"
                  className="mt-2"
                  disabled={busy || adding.length === 0}
                  onClick={() => {
                    setRights((r) => ({
                      ...r,
                      ...Object.fromEntries(adding.map((k) => [k, r[ALL] ?? []])),
                    }))
                    setAdding([])
                  }}
                >
                  <CIcon icon={cilPlus} className="me-1" />
                  Add {adding.length || ''} as rows (starting as Every other object)
                </CButton>
              </>
            )}
          </>
        )}
        {tab === 'dashboard' && (
          <div>
            {!dashboardView ? (
              <div className="small text-body-secondary">
                No Dashboard - its row above has no View.
              </div>
            ) : dashboardArranges ? (
              <div className="small text-body-secondary">
                Configure on the Dashboard - sees and arranges every card.
              </div>
            ) : (
              <>
                <div className="d-flex gap-4 mb-2 flex-wrap">
                  <CFormCheck
                    type="radio"
                    id="role-dash-all"
                    label="Every card of its objects"
                    checked={dashboard === null}
                    disabled={busy}
                    onChange={() => setDashboard(null)}
                  />
                  <CFormCheck
                    type="radio"
                    id="role-dash-some"
                    label="The cards chosen"
                    checked={dashboard !== null}
                    disabled={busy}
                    onChange={() =>
                      setDashboard(
                        cards.filter((c) => !relevant || relevant.has(c.id)).map((c) => c.id),
                      )
                    }
                  />
                  {dashboard !== null && (
                    <CFormSwitch
                      id="role-dash-every"
                      label="Show the cards of other objects too"
                      checked={allCards}
                      onChange={(e) => setAllCards(e.target.checked)}
                      className="ms-auto mb-0 small"
                    />
                  )}
                </div>
                {dashboard !== null && (
                  <SearchChecklist
                    id="role-cards"
                    items={tree
                      .filter((c) => allCards || !relevant || relevant.has(c.id))
                      .map((c) => ({
                        key: c.id,
                        label: cardLabel(c),
                        detail: cardDetail(c),
                        depth: c.depth,
                      }))}
                    selected={dashboard}
                    onToggle={toggleCard}
                    disabled={busy}
                    empty="The role sees no object with cards."
                  />
                )}
                <div className="form-text">
                  A card shows only where the role sees its object; a folder - with something
                  inside.
                </div>
              </>
            )}
          </div>
        )}
        {tab === 'pages' && (
          <PagesTab rights={rights} full={full} pages={pages} onChange={setPages} disabled={busy} />
        )}
      </CModalBody>
      <CModalFooter className="justify-content-between">
        <div>
          {role && !role.system && !readOnly && (
            <CButton color="danger" variant="outline" disabled={busy} onClick={remove}>
              Delete
            </CButton>
          )}
        </div>
        <div className="d-flex gap-2">
          <CButton color="secondary" variant="outline" onClick={onClose} disabled={saving}>
            {readOnly ? 'Close' : 'Cancel'}
          </CButton>
          {!readOnly && (
            <CButton
              color="primary"
              onClick={save}
              disabled={busy || !name.trim() || (!role && !key)}
            >
              {saving && <CSpinner size="sm" className="me-1" />}Save
            </CButton>
          )}
        </div>
      </CModalFooter>
    </CModal>
  )
}

/**
 * A role's objects in a few words - by level ("Every other: View; Control - 43 objects, View - 3"), the
 * objects' names in `title` (a role may name many objects).
 */
const rightsSummary = (role, objectName) => {
  if (role.full) return { text: 'Everything', title: '' }
  const rows = Object.entries(role.rights ?? {}).filter(([k]) => !k.startsWith('section:'))
  const top = (v) => (v.length ? LEVEL_LABELS[v[v.length - 1]] : 'Nothing')
  const all = rows.find(([k]) => k === ALL)
  const byLevel = new Map()
  for (const [k, v] of rows) {
    if (k === ALL) continue
    const l = top(v)
    byLevel.set(l, [...(byLevel.get(l) ?? []), objectName.get(k)?.name ?? k])
  }
  const parts = [
    ...(all ? [`Every other: ${top(all[1])}`] : []),
    ...[...byLevel].map(([l, names]) =>
      names.length > 3 ? `${l} - ${names.length} objects` : `${l}: ${names.join(', ')}`,
    ),
  ]
  return {
    text: parts.join('; ') || 'No objects',
    title: [...byLevel].map(([l, names]) => `${l}: ${names.join(', ')}`).join('\n'),
  }
}

const RolesTab = ({ roles, users, onChanged }) => {
  const readOnly = !useCan()('users.manage')
  const [objectsInfo, setObjectsInfo] = useState(null)
  const [cards, setCards] = useState([])
  const [editing, setEditing] = useState(undefined) // {role} | {copyOf} | {} - a new one
  const [query, setQuery] = useState('')
  const [error, setError] = useState(null)
  useEffect(() => {
    Promise.all([api.listAccessObjects(), api.listDashboardCards()])
      .then(([o, c]) => {
        setObjectsInfo(o)
        setCards(c)
      })
      .catch((err) => setError(err.message))
  }, [])
  const objectName = useMemo(
    () => new Map((objectsInfo?.objects ?? []).map((o) => [o.key, o])),
    [objectsInfo],
  )
  if (!objectsInfo) return error ? <CAlert color="danger">{error}</CAlert> : <CSpinner size="sm" />
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const member = (id) => users.find((u) => u.id === id) ?? { id, username: `#${id}`, active: true }
  const shown = roles.filter((r) =>
    words.every((w) =>
      `${r.name} ${r.key} ${r.memberIds.map((id) => personName(member(id))).join(' ')}`
        .toLowerCase()
        .includes(w),
    ),
  )
  return (
    <>
      {error && <CAlert color="danger">{error}</CAlert>}
      <div className="d-flex gap-2 mb-2 align-items-center">
        <CFormInput
          size="sm"
          type="search"
          placeholder="Search roles"
          aria-label="Search roles"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ maxWidth: '16rem' }}
        />
        {!readOnly && (
          <CButton size="sm" color="primary" className="ms-auto" onClick={() => setEditing({})}>
            Add role
          </CButton>
        )}
      </div>
      <CTable small hover responsive className="align-middle">
        <CTableHead>
          <CTableRow>
            <CTableHeaderCell>Role</CTableHeaderCell>
            <CTableHeaderCell>Rights</CTableHeaderCell>
            <CTableHeaderCell>Members</CTableHeaderCell>
            <CTableHeaderCell title="The AI's tokens a day">AI</CTableHeaderCell>
            <CTableHeaderCell />
          </CTableRow>
        </CTableHead>
        <CTableBody>
          {shown.map((r) => (
            <CTableRow key={r.key}>
              <CTableDataCell>
                <div className="d-flex align-items-center gap-2">
                  <RoleAvatar role={r} />
                  <div>
                    <span className="fw-semibold">{r.name}</span>
                    {r.system && (
                      <CBadge color="light" textColor="dark" className="border ms-2">
                        built-in
                      </CBadge>
                    )}
                  </div>
                </div>
              </CTableDataCell>
              <CTableDataCell>
                {/* the highest level; what on which objects - in the title */}
                <RoleLevelBadge role={r} title={rightsSummary(r, objectName).text} />
              </CTableDataCell>
              <CTableDataCell>
                <AvatarRow
                  items={r.memberIds.map(member)}
                  render={(u) => <UserAvatar user={u} />}
                  titleOf={(u) => personName(u)}
                  max={8}
                />
              </CTableDataCell>
              <CTableDataCell>
                <AiTokensMark value={r.aiDailyTokens} />
              </CTableDataCell>
              <CTableDataCell className="text-end text-nowrap">
                {!r.full && !r.service && !readOnly && (
                  <CButton
                    size="sm"
                    color="secondary"
                    variant="ghost"
                    className="me-1"
                    title="A new role from this one"
                    onClick={() => setEditing({ copyOf: r })}
                  >
                    Copy
                  </CButton>
                )}
                <CButton
                  size="sm"
                  color="secondary"
                  variant="outline"
                  onClick={() => setEditing({ role: r })}
                >
                  {readOnly ? 'View' : 'Edit'}
                </CButton>
              </CTableDataCell>
            </CTableRow>
          ))}
        </CTableBody>
      </CTable>
      {editing !== undefined && (
        <RoleForm
          role={editing.role ?? null}
          copyOf={editing.copyOf ?? null}
          objectsInfo={objectsInfo}
          users={users}
          cards={cards}
          readOnly={readOnly}
          onClose={() => setEditing(undefined)}
          onSaved={() => {
            setEditing(undefined)
            onChanged()
          }}
        />
      )}
    </>
  )
}

export default RolesTab
