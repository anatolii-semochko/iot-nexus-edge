import React, { useEffect, useState } from 'react'
import {
  CAlert,
  CButton,
  CFormInput,
  CFormLabel,
  CFormSelect,
  CModal,
  CModalBody,
  CModalFooter,
  CModalHeader,
  CModalTitle,
  CSpinner,
  CTable,
  CTableBody,
  CTableDataCell,
  CTableRow,
} from '@coreui/react'
import CIcon from '@coreui/icons-react'
import { cilArrowBottom, cilArrowTop, cilPencil, cilPlus, cilTrash } from '@coreui/icons'
import { api, request } from '../../api/client'
import { availableComponents, dashboardComponents } from '../../dashboardRegistry'
import { cardIcon, DASHBOARD_ICONS } from '../../dashboardIcons'
import { useConfirmModal } from '../../hooks/useConfirmModal'
import IconButton from '../../components/IconButton'
import UpBreadcrumb from '../../components/UpBreadcrumb'
import Switch from '../../components/Switch'
import { BlockCard, cardFrame, pictureSource } from '../dashboard/Dashboard'

/**
 * Service -> Config -> Dashboard (Dashboard cards, 2026-10-16): the
 * Dashboard page's card tree - one for the system - browsed like the
 * Library: the up arrow and the path on top, one level listed; a folder's
 * name (blue) opens its level. A card's actions: up / down among its
 * siblings, edit, delete (with its subtree). Adding and editing - in a
 * popup (a new card's fields start empty), in groups (2026-10-29): the
 * title, where it is (the folders as a cascade), what it shows (a folder's
 * layout; an avatar's / a component's component - the components the
 * modules registered, dashboardRegistry, one per named process of their
 * kind, grouped by process, plus the system ones); the frame's parts; the
 * pictures; how an avatar opens (the default fit, the viewer's switch). A
 * component card - drawn at the level's full width - has the first group
 * only. Who sees a card - the role's Dashboard tab.
 */

const childrenOf = (cards, parentId) =>
  cards
    .filter((c) => (c.parentId ?? null) === parentId)
    .sort((a, b) => a.position - b.position || a.id - b.id)

const pathTo = (cards, id) => {
  const out = []
  for (let c = cards.find((x) => x.id === id); c; c = cards.find((x) => x.id === c.parentId))
    out.unshift(c)
  return out
}

// a folder and everything under it - not a place to move it to
const subtreeIds = (cards, id) =>
  new Set([id, ...childrenOf(cards, id).flatMap((c) => [...subtreeIds(cards, c.id)])])

const componentValue = (key, processId) => (key ? `${key}|${processId ?? ''}` : '')

// The component options grouped: the system ones, then one group per process.
const ComponentSelect = ({ value, options, onChange }) => {
  const system = options.filter((o) => !o.process)
  const byProcess = new Map()
  options
    .filter((o) => o.process)
    .forEach((o) => byProcess.set(o.process.id, [...(byProcess.get(o.process.id) ?? []), o]))
  return (
    <CFormSelect
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Component"
      invalid={!value}
    >
      <option value="">- choose -</option>
      {system.length > 0 && (
        <optgroup label="System">
          {system.map((o) => (
            <option key={o.key} value={componentValue(o.key, null)}>
              {o.title}
            </option>
          ))}
        </optgroup>
      )}
      {[...byProcess.values()].map((group) => (
        <optgroup key={group[0].process.id} label={group[0].process.name}>
          {group.map((o) => (
            <option key={o.key} value={componentValue(o.key, o.process.id)}>
              {o.title} - {o.process.name}
            </option>
          ))}
        </optgroup>
      ))}
    </CFormSelect>
  )
}

// The popup: the card's preview on the left (on top when narrow), the form
// in rows - one column of titles, one of fields - on the right, its groups
// apart (the user, 2026-10-29).
const FORM_CSS = `
.dc-layout { display: flex; gap: 1.5rem; flex-wrap: wrap; }
.dc-preview { flex: 1 1 280px; display: flex; flex-direction: column; align-items: center; }
.dc-form { flex: 2 1 420px; display: grid; grid-template-columns: max-content minmax(0, 1fr); column-gap: 1rem; row-gap: .75rem; align-items: center; align-content: start; }
.dc-row { display: contents; }
.dc-row > label { grid-column: 1; margin: 0; }
.dc-row > :not(label) { grid-column: 2; }
.dc-group { grid-column: 1 / -1; border-top: 1px solid var(--cui-border-color); margin: .25rem 0; }
.dc-sliders { display: grid; grid-template-columns: 4.5rem minmax(8rem, 1fr) 3.5rem; column-gap: .75rem; row-gap: .25rem; align-items: center; }
.dc-sliders input[type=range] { width: 100%; }
@media (max-width: 575.98px) {
  .dc-form { grid-template-columns: minmax(0, 1fr); }
  .dc-row > * { grid-column: 1 !important; }
}
`

const EMPTY = {
  title: '',
  icon: null,
  layout: 'blocks',
  componentKey: null,
  processId: null,
  view: 'fit-height',
  preview: 'auto',
  params: {},
  frame: null,
  picture: {},
  userFit: false,
}

const NOUNS = { folder: 'folder', avatar: 'avatar', component: 'component' }

/**
 * "In" (the user, 2026-10-29) - the folders as a cascade, top down: each select the folders inside the one
 * chosen above it, "- here -" stops there. A card's own subtree is not a place to move it to.
 */
const FolderCascade = ({ cards, value, exclude, onChange }) => {
  const folders = (parentId) =>
    childrenOf(cards, parentId).filter((c) => c.type === 'folder' && !exclude.has(c.id))
  const chain = value === null ? [] : pathTo(cards, value)
  const levels = []
  for (let i = 0; i <= chain.length; i++) {
    const parent = i === 0 ? null : chain[i - 1]
    const options = folders(parent ? parent.id : null)
    if (options.length === 0) break
    levels.push({ parent, options, chosen: chain[i]?.id ?? '' })
  }
  if (levels.length === 0)
    return <div className="small text-body-secondary">Dashboard (the top) - no folders yet</div>
  return (
    <div className="d-flex flex-column gap-1">
      {levels.map(({ parent, options, chosen }, i) => (
        <CFormSelect
          key={parent ? parent.id : 'top'}
          size="sm"
          value={chosen}
          style={{ marginLeft: `${i}rem`, width: `calc(100% - ${i}rem)` }}
          onChange={(e) =>
            onChange(e.target.value === '' ? (parent ? parent.id : null) : Number(e.target.value))
          }
          aria-label={parent ? `A folder in ${parent.title}` : 'A folder on the top'}
        >
          <option value="">
            {parent ? `- here, in ${parent.title} -` : 'Dashboard (the top)'}
          </option>
          {options.map((f) => (
            <option key={f.id} value={f.id}>
              {f.title}
            </option>
          ))}
        </CFormSelect>
      ))}
    </div>
  )
}

/** A row of the form: its title, its field. */
const Row = ({ label, hint, children }) => (
  <div className="dc-row">
    <CFormLabel title={hint}>{label}</CFormLabel>
    {children}
  </div>
)

/** A slider's row in the sliders' grid - its name, the slider, the value (the columns aligned). */
const Slider = ({ label, value, min, max, step = 5, hint, onChange }) => (
  <>
    <span className="small">{label}</span>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      title={hint}
      aria-label={label}
      onChange={(e) => onChange(Number(e.target.value))}
    />
    <span className="small text-end">{value} %</span>
  </>
)

const FRAME_ROWS = [
  ['top', 'Border top', "The picture's block bordered (the picture padded)"],
  ['middle', 'Border middle', 'A line between the picture and the title'],
  [
    'bottom',
    'Border bottom',
    "The title's block bordered; with the top - one border round the card",
  ],
  ['fill', 'Fill', "The card's background"],
]

/**
 * The card's pictures (migrations 091, 100; the user 2026-10-25, 2026-10-29): the picture's source -
 * none, the component's avatar (an avatar card), an icon from the set, an uploaded file - with its size;
 * a background under it with its size and opacity. The files are uploaded at once (the card must exist -
 * a new one after its first save).
 */
const CardPictureRows = ({ form, set, def }) => {
  const [error, setError] = useState(null)
  const picture = form.picture ?? {}
  const source = pictureSource(form)
  const setPicture = (changes) => set({ picture: { ...picture, ...changes } })
  const upload = (slot, file) => {
    if (!file) return
    setError(null)
    const body = new FormData()
    body.append('file', file)
    request(`/dashboard-cards/${form.id}/images/${slot}`, { method: 'POST', body })
      .then((card) => set({ picture: { ...picture, ...card.picture } }))
      .catch((err) => setError(err.message))
  }
  const remove = (slot) =>
    request(`/dashboard-cards/${form.id}/images/${slot}`, { method: 'DELETE' })
      .then((card) => set({ picture: card.picture }))
      .catch((err) => setError(err.message))
  const file = (slot) =>
    form.id ? (
      <div className="d-flex gap-2 align-items-center">
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="form-control form-control-sm"
          aria-label={`Upload the ${slot}`}
          onChange={(e) => upload(slot, e.target.files?.[0])}
        />
        {picture[slot] && (
          <CButton size="sm" color="danger" variant="ghost" onClick={() => remove(slot)}>
            Remove
          </CButton>
        )}
      </div>
    ) : (
      <div className="small text-body-secondary">The file - after the card is added.</div>
    )
  const sizeDefault =
    source === 'file' ? 80 : source === 'icon' ? (cardFrame(form).top ? 60 : 100) : 100
  return (
    <>
      <Row label="Picture">
        <div className="d-flex flex-column gap-2">
          <CFormSelect
            size="sm"
            value={source}
            onChange={(e) => setPicture({ source: e.target.value })}
            aria-label="The picture's source"
          >
            <option value="none">No - no picture (the background only, if any)</option>
            {form.type === 'avatar' && <option value="avatar">Avatar - the component's</option>}
            <option value="icon">Icon - from the set</option>
            <option value="file">File - an own image</option>
          </CFormSelect>
          {source === 'avatar' && (
            <CFormSelect
              size="sm"
              value={form.preview}
              onChange={(e) => set({ preview: e.target.value })}
              aria-label="Avatar"
            >
              <option value="auto">
                {def?.avatars?.length
                  ? `Auto - ${def.avatars[0].title}`
                  : 'Auto - a scaled copy (the component has no avatar)'}
              </option>
              {/* the component's avatars (dashboardRegistry.js) */}
              {(def?.avatars ?? []).map((a) => (
                <option key={a.key} value={a.key}>
                  {a.title}
                </option>
              ))}
              <option value="scaled">A scaled copy</option>
            </CFormSelect>
          )}
          {source === 'icon' && (
            // the card icons (dashboardIcons.js); none chosen - the type's own
            <div className="d-flex flex-wrap gap-1" role="radiogroup" aria-label="Icon">
              {Object.entries(DASHBOARD_ICONS).map(([key, icon]) => {
                const chosen = cardIcon(form) === icon
                return (
                  <CButton
                    key={key}
                    size="sm"
                    color={chosen ? 'primary' : 'secondary'}
                    variant={chosen ? undefined : 'ghost'}
                    role="radio"
                    aria-checked={chosen}
                    title={key.slice(3)}
                    onClick={() => set({ icon: key })}
                    style={{ width: '2.25rem', height: '2.25rem', padding: 0 }}
                  >
                    <CIcon icon={icon} />
                  </CButton>
                )
              })}
            </div>
          )}
          {source === 'file' && file('icon')}
          {source !== 'none' && (
            <div className="dc-sliders">
              <Slider
                label="Size"
                value={picture.imageScalePct ?? sizeDefault}
                min={10}
                max={300}
                hint="Over 100 % - larger than the block, only its middle seen"
                onChange={(v) => setPicture({ imageScalePct: v })}
              />
            </div>
          )}
        </div>
      </Row>
      <Row label="Background">
        <div className="d-flex flex-column gap-2">
          {file('background')}
          {picture.background && (
            <div className="dc-sliders">
              <Slider
                label="Size"
                value={picture.backgroundScalePct ?? 100}
                min={10}
                max={300}
                hint="100 % - covers the block; over - larger, only its middle seen; under - smaller"
                onChange={(v) => setPicture({ backgroundScalePct: v })}
              />
              <Slider
                label="Opacity"
                value={picture.backgroundOpacityPct ?? 40}
                min={0}
                max={100}
                onChange={(v) => setPicture({ backgroundOpacityPct: v })}
              />
            </div>
          )}
          {error && <div className="small text-danger">{error}</div>}
        </div>
      </Row>
    </>
  )
}

// The add / edit popup. `draft` - {type, parentId, ...fields, id?} or null (closed). The groups (the
// user, 2026-10-29): where and what - the title, the folder, what it shows; the frame; the pictures;
// how an avatar opens. A component (at the level's full width) - the first group only.
const CardModal = ({ draft, cards, options, processes = [], onClose, onSave }) => {
  const [form, setForm] = useState(draft)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setForm(draft), [draft])
  if (!form) return null
  const set = (changes) => setForm({ ...form, ...changes })
  const def = form.componentKey ? dashboardComponents[form.componentKey] : null
  const block = form.type !== 'component'
  // the component's own parameters (e.g. which room) - declared by it, from its process
  const process = processes.find((p) => p.id === form.processId) ?? null
  const paramDefs = def?.params ? def.params(process) : []
  const params = form.params ?? {}
  const valid =
    form.title.trim() &&
    (form.type === 'folder' ||
      (form.componentKey && paramDefs.every((d) => !d.required || params[d.key] != null)))
  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      await onSave({ ...form, title: form.title.trim() })
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }
  const frame = cardFrame(form)
  const noun = NOUNS[form.type]
  return (
    <CModal visible onClose={onClose} alignment="center" size="xl">
      <CModalHeader>
        <CModalTitle>{form.id ? `Edit the ${noun}` : `New ${noun}`}</CModalTitle>
      </CModalHeader>
      <CModalBody>
        <style>{FORM_CSS}</style>
        {error && <CAlert color="danger">{error}</CAlert>}
        <div className="dc-layout">
          {/* how the card will look on the Dashboard */}
          <div className="dc-preview" aria-label="Preview">
            <div className="small text-body-secondary mb-2">On the Dashboard</div>
            {block ? (
              <div style={{ width: '100%', maxWidth: 360 }}>
                <BlockCard
                  card={{ ...form, title: form.title || 'Untitled' }}
                  processes={processes}
                  linked={false}
                />
              </div>
            ) : (
              <div className="small text-body-secondary text-center">
                The component itself, at the full width under the level&apos;s blocks, its title
                over it (unless switched off).
              </div>
            )}
          </div>
          <div className="dc-form">
            <Row label="Title">
              <CFormInput
                value={form.title}
                onChange={(e) => set({ title: e.target.value })}
                invalid={!form.title.trim()}
                autoFocus
                aria-label="Title"
              />
            </Row>
            <Row label="In">
              <FolderCascade
                cards={cards}
                value={form.parentId ?? null}
                exclude={form.id ? subtreeIds(cards, form.id) : new Set()}
                onChange={(parentId) => set({ parentId })}
              />
            </Row>
            {form.type === 'folder' ? (
              <Row label="Shows">
                <CFormSelect
                  value={form.layout}
                  onChange={(e) => set({ layout: e.target.value })}
                  aria-label="Layout"
                >
                  <option value="blocks">Its cards as blocks</option>
                  <option value="list">Its cards as a list</option>
                </CFormSelect>
              </Row>
            ) : (
              <>
                <Row label="Shows">
                  <div>
                    <ComponentSelect
                      value={componentValue(form.componentKey, form.processId)}
                      options={options}
                      onChange={(v) => {
                        const [componentKey, processId] = v.split('|')
                        set({
                          componentKey: componentKey || null,
                          processId: processId ? Number(processId) : null,
                          params: {},
                        })
                      }}
                    />
                    {form.componentKey && !def && (
                      <div className="small text-warning mt-1">
                        &quot;{form.componentKey}&quot; is not available (its module is not
                        installed).
                      </div>
                    )}
                    {def?.description && <div className="form-text">{def.description}</div>}
                  </div>
                </Row>
                {paramDefs.map((d) => (
                  <Row key={d.key} label={d.label} hint={d.hint}>
                    <CFormSelect
                      value={params[d.key] ?? ''}
                      onChange={(e) => {
                        const option = d.options.find((o) => String(o.value) === e.target.value)
                        set({ params: { ...params, [d.key]: option ? option.value : null } })
                      }}
                      aria-label={d.label}
                      title={d.hint}
                    >
                      <option value="">{d.required ? 'Choose…' : 'All'}</option>
                      {d.options.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </CFormSelect>
                  </Row>
                ))}
              </>
            )}
            {!block && (
              <>
                <div className="dc-group" />
                <Row label="Its title" hint="The card's title over the component">
                  <Switch
                    checked={form.frame?.title !== false}
                    ariaLabel="Its title"
                    onChange={(on) => set({ frame: { ...frame, title: on } })}
                  />
                </Row>
              </>
            )}
            {block && (
              <>
                <div className="dc-group" />
                {FRAME_ROWS.map(([part, label, hint]) => (
                  <Row key={part} label={label} hint={hint}>
                    <Switch
                      checked={frame[part]}
                      ariaLabel={label}
                      onChange={(on) => set({ frame: { ...frame, [part]: on } })}
                    />
                  </Row>
                ))}
                <div className="dc-group" />
                <CardPictureRows form={form} set={set} def={def} />
              </>
            )}
            {form.type === 'avatar' && (
              <>
                <div className="dc-group" />
                <Row label="Opened" hint="The default - with the switch below, the viewer's own">
                  <CFormSelect
                    value={form.view}
                    onChange={(e) => set({ view: e.target.value })}
                    aria-label="View"
                  >
                    <option value="fit-height">
                      On the visible height - scaled to fit, no scrolling
                    </option>
                    <option value="fit-width">On the visible width - laid out in it</option>
                  </CFormSelect>
                </Row>
                <Row
                  label="Viewer can switch the fit"
                  hint="Two buttons right of the path on top - the width / the height; each viewer's choice kept in their browser"
                >
                  <Switch
                    checked={!!form.userFit}
                    ariaLabel="Viewer can switch the fit"
                    onChange={(on) => set({ userFit: on })}
                  />
                </Row>
              </>
            )}
            <div className="dc-row">
              <span />
              <div className="small text-body-secondary">
                Who sees the card - each role&apos;s Dashboard tab (Users {'->'} Roles).
              </div>
            </div>
          </div>
        </div>
      </CModalBody>
      <CModalFooter>
        <CButton color="secondary" variant="outline" onClick={onClose}>
          Cancel
        </CButton>
        <CButton color="primary" disabled={busy || !valid} onClick={save}>
          {busy ? <CSpinner size="sm" /> : form.id ? 'Save' : 'Add'}
        </CButton>
      </CModalFooter>
    </CModal>
  )
}

const DashboardConfigTab = () => {
  const [cards, setCards] = useState(null)
  const [processes, setProcesses] = useState([])
  const [error, setError] = useState(null)
  const [folderId, setFolderId] = useState(null)
  const [draft, setDraft] = useState(null)
  const { confirm, modal } = useConfirmModal()
  const load = () =>
    Promise.all([api.listDashboardCards(), api.listProcesses()])
      .then(([c, p]) => {
        setCards(c)
        setProcesses(p)
      })
      .catch((err) => setError(err.message))
  useEffect(() => {
    load()
  }, [])
  const run = async (work) => {
    setError(null)
    try {
      await work()
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  if (!cards) return error ? <CAlert color="danger">{error}</CAlert> : <CSpinner size="sm" />
  // the open folder gone (deleted elsewhere) - back to the top
  const folder = folderId === null ? null : (cards.find((c) => c.id === folderId) ?? null)
  const level = childrenOf(cards, folder ? folder.id : null)
  const trail = folder ? pathTo(cards, folder.id).map((c) => ({ id: c.id, name: c.title })) : []
  const options = availableComponents(processes)

  const saveDraft = async (form) => {
    const { id, type, parentId, title, layout, componentKey, processId, view, preview } = form
    const shown = { componentKey, processId, parentId, params: form.params ?? {} }
    const fields =
      type === 'folder'
        ? { title, icon: form.icon, layout, parentId }
        : type === 'avatar'
          ? { title, icon: form.icon, view, preview, userFit: !!form.userFit, ...shown }
          : { title, ...shown }
    if (type !== 'component') {
      fields.frame = form.frame ?? null
      // the pictures' settings (the images themselves - uploaded at once)
      const picture = form.picture ?? {}
      fields.picture = {
        source: picture.source ?? null,
        imageScalePct: picture.imageScalePct,
        backgroundOpacityPct: picture.backgroundOpacityPct,
        backgroundScalePct: picture.backgroundScalePct,
      }
    }
    if (id) await api.updateDashboardCard(id, fields)
    else await api.createDashboardCard({ type, ...fields })
    setDraft(null)
    await load()
  }
  const remove = async (card) => {
    const inside = subtreeIds(cards, card.id).size - 1
    const ok = await confirm({
      title: 'Delete the card',
      body:
        inside > 0
          ? `"${card.title}" and the ${inside} card(s) inside it will be deleted.`
          : `"${card.title}" will be deleted.`,
      confirmLabel: 'Delete',
      confirmColor: 'danger',
    })
    if (ok) run(() => api.deleteDashboardCard(card.id))
  }
  const what = (card) =>
    card.type === 'folder'
      ? `folder, ${childrenOf(cards, card.id).length} inside, ${card.layout === 'list' ? 'a list' : 'blocks'}`
      : [
          card.type === 'avatar' ? 'avatar' : 'component, full width',
          dashboardComponents[card.componentKey]?.title ?? card.componentKey,
          processes.find((p) => p.id === card.processId)?.name,
        ]
          .filter(Boolean)
          .join(' - ')

  return (
    <div className="pt-2">
      {modal}
      <CardModal
        draft={draft}
        cards={cards}
        options={options}
        processes={processes}
        onClose={() => setDraft(null)}
        onSave={saveDraft}
      />
      {error && <CAlert color="danger">{error}</CAlert>}
      <div className="d-flex align-items-center gap-2 mb-2">
        <div className="me-auto">
          <UpBreadcrumb trail={trail} onNavigate={setFolderId} rootLabel="Dashboard" />
        </div>
        {/* the two adds - one button group */}
        <div className="btn-group" role="group" aria-label="Add">
          {[
            ['folder', 'Folder', 'A folder - its cards on a level of their own'],
            ['avatar', 'Avatar', "A block - the component's picture, opening it on the whole page"],
            [
              'component',
              'Component',
              "The component itself - at the full width under the level's blocks",
            ],
          ].map(([type, label, hint]) => (
            <CButton
              key={type}
              size="sm"
              color="primary"
              title={hint}
              onClick={() => setDraft({ ...EMPTY, type, parentId: folder?.id ?? null })}
            >
              <CIcon icon={cilPlus} /> {label}
            </CButton>
          ))}
        </div>
      </div>
      {level.length === 0 ? (
        <CAlert color="info">
          {folder
            ? 'This folder is empty - add a folder, an avatar or a component.'
            : `No cards yet - the Dashboard shows the project's own page${options.length > 0 ? '' : ' (no module offers components)'}.`}
        </CAlert>
      ) : (
        // a table - the rows' lines, none under the last
        <CTable align="middle" hover className="mb-0">
          <CTableBody>
            {level.map((card, i) => (
              <CTableRow key={card.id}>
                <CTableDataCell style={{ width: '2rem' }}>
                  <CIcon icon={cardIcon(card)} className="text-body-secondary" />
                </CTableDataCell>
                <CTableDataCell>
                  <div className="d-flex align-items-center gap-2" style={{ minWidth: 0 }}>
                    {card.type === 'folder' ? (
                      <a
                        href="#"
                        className="link-primary fw-semibold text-truncate text-decoration-none"
                        onClick={(e) => {
                          e.preventDefault()
                          setFolderId(card.id)
                        }}
                      >
                        {card.title}
                      </a>
                    ) : (
                      <span className="fw-semibold text-truncate">{card.title}</span>
                    )}
                    <span className="small text-body-secondary text-truncate">{what(card)}</span>
                  </div>
                </CTableDataCell>
                <CTableDataCell className="text-end text-nowrap" style={{ width: '1%' }}>
                  <span className="d-inline-flex gap-2">
                    {/* the order - up / down as one button group */}
                    <span className="btn-group" role="group" aria-label="Order">
                      <IconButton
                        icon={cilArrowTop}
                        size="sm"
                        center
                        disabled={i === 0}
                        ariaLabel="Up"
                        title="Up"
                        onClick={() => run(() => api.moveDashboardCard(card.id, 'up'))}
                      />
                      <IconButton
                        icon={cilArrowBottom}
                        size="sm"
                        center
                        disabled={i === level.length - 1}
                        ariaLabel="Down"
                        title="Down"
                        onClick={() => run(() => api.moveDashboardCard(card.id, 'down'))}
                      />
                    </span>
                    <IconButton
                      icon={cilPencil}
                      size="sm"
                      center
                      ariaLabel="Edit"
                      title="Edit"
                      onClick={() => setDraft({ ...EMPTY, ...card })}
                    />
                    <IconButton
                      icon={cilTrash}
                      size="sm"
                      color="danger"
                      center
                      ariaLabel="Delete"
                      title="Delete"
                      onClick={() => remove(card)}
                    />
                  </span>
                </CTableDataCell>
              </CTableRow>
            ))}
          </CTableBody>
        </CTable>
      )}
    </div>
  )
}

export default DashboardConfigTab
