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
import { BlockCard } from '../dashboard/Dashboard'

/**
 * Service -> Config -> Dashboard (Dashboard cards, 2026-10-16): the
 * Dashboard page's card tree - one for the system - browsed like the
 * Library: the up arrow and the path on top, one level listed; a folder's
 * name (blue) opens its level. A card's actions: up / down among its
 * siblings, edit, delete (with its subtree). Adding and editing - in a
 * popup (a new card's fields start empty): the title, where it is (edit),
 * a folder's layout (blocks / list), a component card's component (the
 * components the modules registered - dashboardRegistry -, one per named
 * process of their kind, grouped by process, plus the system ones), its
 * view (the visible height - scaled to fit / the visible width) and its
 * preview (one of the component's avatars / a scaled copy).
 *
 * Access by user groups - not built: the system has no user groups yet
 * (AGENTS_TO_DO.md "Доступи / права"); every signed-in user sees every
 * card (api routes/dashboardCards.ts cardVisibleTo).
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
// in rows - one column of titles, one of fields - on the right.
const FORM_CSS = `
.dc-layout { display: flex; gap: 1.5rem; flex-wrap: wrap; }
.dc-preview { flex: 1 1 280px; display: flex; flex-direction: column; align-items: center; }
.dc-form { flex: 2 1 420px; display: grid; grid-template-columns: max-content minmax(0, 1fr); column-gap: 1rem; row-gap: .75rem; align-items: center; align-content: start; }
.dc-row { display: contents; }
.dc-row > label { grid-column: 1; margin: 0; }
.dc-row > :not(label) { grid-column: 2; }
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
}

/**
 * The card's own pictures (migration 091, the user 2026-10-25): the picture - from the set (the icon /
 * the component's avatar, as before) or an uploaded image with its size; a background under it with
 * its opacity. Uploaded at once (the card must exist - a new one after its first save).
 */
const CardPictureRows = ({ form, set }) => {
  const [error, setError] = useState(null)
  const picture = form.picture ?? {}
  const setPicture = (changes) => set({ picture: { ...picture, ...changes } })
  const upload = (slot, file) => {
    if (!file) return
    setError(null)
    const body = new FormData()
    body.append('file', file)
    request(`/dashboard-cards/${form.id}/images/${slot}`, { method: 'POST', body })
      .then((card) => set({ picture: card.picture }))
      .catch((err) => setError(err.message))
  }
  const remove = (slot) =>
    request(`/dashboard-cards/${form.id}/images/${slot}`, { method: 'DELETE' })
      .then((card) => set({ picture: card.picture }))
      .catch((err) => setError(err.message))
  const file = (slot) => (
    <input
      type="file"
      accept="image/png,image/jpeg,image/webp,image/gif"
      className="form-control form-control-sm"
      aria-label={`Upload the ${slot}`}
      onChange={(e) => upload(slot, e.target.files?.[0])}
    />
  )
  if (!form.id)
    return (
      <div className="dc-row">
        <CFormLabel>Own pictures</CFormLabel>
        <div className="small text-body-secondary">
          An own picture and a background - after the card is added.
        </div>
      </div>
    )
  return (
    <>
      <div className="dc-row">
        <CFormLabel>Picture</CFormLabel>
        <div className="d-flex flex-column gap-2">
          <CFormSelect
            size="sm"
            value={picture.hidden ? 'none' : picture.useImage && picture.icon ? 'image' : 'set'}
            onChange={(e) =>
              setPicture({
                useImage: e.target.value === 'image',
                hidden: e.target.value === 'none',
              })
            }
            aria-label="The picture's source"
          >
            <option value="set">
              {form.type === 'folder' ? 'From the icons (above)' : 'The avatar (above)'}
            </option>
            <option value="image" disabled={!picture.icon}>
              An own image{picture.icon ? '' : ' - upload it below'}
            </option>
            <option value="none">None - no picture (the background only, if any)</option>
          </CFormSelect>
          <div className="d-flex gap-2 align-items-center">
            {file('icon')}
            {picture.icon && (
              <CButton size="sm" color="danger" variant="ghost" onClick={() => remove('icon')}>
                Remove
              </CButton>
            )}
          </div>
          {picture.icon && (
            <label className="d-flex align-items-center gap-2 small mb-0">
              Size
              <input
                type="range"
                min={10}
                max={300}
                step={5}
                value={picture.imageScalePct ?? 80}
                title="Over 100 % - larger than the block, only its middle seen"
                onChange={(e) => setPicture({ imageScalePct: Number(e.target.value) })}
              />
              {picture.imageScalePct ?? 80} %
            </label>
          )}
        </div>
      </div>
      <div className="dc-row">
        <CFormLabel>Background</CFormLabel>
        <div className="d-flex flex-column gap-2">
          <div className="d-flex gap-2 align-items-center">
            {file('background')}
            {picture.background && (
              <CButton
                size="sm"
                color="danger"
                variant="ghost"
                onClick={() => remove('background')}
              >
                Remove
              </CButton>
            )}
          </div>
          {picture.background && (
            <>
              <label className="d-flex align-items-center gap-2 small mb-0">
                Size
                <input
                  type="range"
                  min={10}
                  max={300}
                  step={5}
                  value={picture.backgroundScalePct ?? 100}
                  title="100 % - covers the block; over - larger, only its middle seen; under - smaller"
                  onChange={(e) => setPicture({ backgroundScalePct: Number(e.target.value) })}
                />
                {picture.backgroundScalePct ?? 100} %
              </label>
              <label className="d-flex align-items-center gap-2 small mb-0">
                Opacity
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={picture.backgroundOpacityPct ?? 40}
                  onChange={(e) => setPicture({ backgroundOpacityPct: Number(e.target.value) })}
                />
                {picture.backgroundOpacityPct ?? 40} %
              </label>
            </>
          )}
          {error && <div className="small text-danger">{error}</div>}
        </div>
      </div>
    </>
  )
}

// The add / edit popup. `draft` - {type, parentId, ...fields, id?} or null (closed).
const CardModal = ({ draft, cards, options, processes = [], onClose, onSave }) => {
  const [form, setForm] = useState(draft)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setForm(draft), [draft])
  if (!form) return null
  const set = (changes) => setForm({ ...form, ...changes })
  const def = form.componentKey ? dashboardComponents[form.componentKey] : null
  const folders = cards.filter(
    (c) => c.type === 'folder' && !(form.id && subtreeIds(cards, form.id).has(c.id)),
  )
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
  const noun = form.type === 'folder' ? 'folder' : 'component'
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
            <div style={{ width: '100%', maxWidth: 360 }}>
              <BlockCard
                card={{ ...form, type: form.type, title: form.title || 'Untitled' }}
                processes={processes}
                linked={false}
              />
            </div>
          </div>
          <div className="dc-form">
            <div className="dc-row">
              <CFormLabel>Title</CFormLabel>
              <CFormInput
                value={form.title}
                onChange={(e) => set({ title: e.target.value })}
                invalid={!form.title.trim()}
                autoFocus
                aria-label="Title"
              />
            </div>
            <div className="dc-row">
              <CFormLabel>In</CFormLabel>
              <CFormSelect
                value={form.parentId ?? ''}
                onChange={(e) =>
                  set({ parentId: e.target.value === '' ? null : Number(e.target.value) })
                }
                aria-label="Folder"
              >
                <option value="">Dashboard (the top level)</option>
                {folders.map((f) => (
                  <option key={f.id} value={f.id}>
                    {pathTo(cards, f.id)
                      .map((c) => c.title)
                      .join(' / ')}
                  </option>
                ))}
              </CFormSelect>
            </div>
            {form.type === 'folder' ? (
              <>
                <div className="dc-row">
                  <CFormLabel>Icon</CFormLabel>
                  {/* the card icons (dashboardIcons.js); none chosen - the folder icon */}
                  <div className="d-flex flex-wrap gap-1" role="radiogroup" aria-label="Icon">
                    {Object.entries(DASHBOARD_ICONS).map(([key, icon]) => {
                      const chosen = (form.icon ?? 'cilFolder') === key
                      return (
                        <CButton
                          key={key}
                          size="sm"
                          color={chosen ? 'primary' : 'secondary'}
                          variant={chosen ? undefined : 'ghost'}
                          role="radio"
                          aria-checked={chosen}
                          title={key.slice(3)}
                          onClick={() => set({ icon: key === 'cilFolder' ? null : key })}
                          style={{ width: '2.25rem', height: '2.25rem', padding: 0 }}
                        >
                          <CIcon icon={icon} />
                        </CButton>
                      )
                    })}
                  </div>
                </div>
                <div className="dc-row">
                  <CFormLabel>Shows</CFormLabel>
                  <CFormSelect
                    value={form.layout}
                    onChange={(e) => set({ layout: e.target.value })}
                    aria-label="Layout"
                  >
                    <option value="blocks">Its cards as blocks</option>
                    <option value="list">Its cards as a list</option>
                  </CFormSelect>
                </div>
              </>
            ) : (
              <>
                <div className="dc-row">
                  <CFormLabel>Component</CFormLabel>
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
                {paramDefs.map((d) => (
                  <div key={d.key} className="dc-row">
                    <CFormLabel>{d.label}</CFormLabel>
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
                  </div>
                ))}
                <div className="dc-row">
                  <CFormLabel>Opened</CFormLabel>
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
                </div>
                <div className="dc-row">
                  <CFormLabel>Avatar - the card's picture</CFormLabel>
                  <CFormSelect
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
                </div>
              </>
            )}
            <div className="dc-row">
              <CFormLabel>Frame</CFormLabel>
              <CFormSelect
                value={form.frame ?? ''}
                onChange={(e) => set({ frame: e.target.value || null })}
                aria-label="Frame"
                title="How the card is framed on the Dashboard"
              >
                <option value="">
                  {`Default - ${form.type === 'folder' ? 'border and background' : 'none'}`}
                </option>
                <option value="none">None - the picture to the block's edges</option>
                <option value="border">Border - a border and a divider, no background</option>
                <option value="filled">Border and background</option>
                <option value="caption">
                  The title's border only - the picture above to the edges
                </option>
              </CFormSelect>
            </div>
            <CardPictureRows form={form} set={set} />
            <div className="dc-row">
              <span />
              <div className="small text-body-secondary">
                Access: everyone signed in. By user groups - with the access rights of the whole
                system (not built yet).
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
    const fields =
      type === 'folder'
        ? { title, icon: form.icon, layout, parentId }
        : { title, componentKey, processId, view, preview, parentId, params: form.params ?? {} }
    fields.frame = form.frame ?? null
    // the own pictures' settings (the images themselves - uploaded at once)
    if (form.picture)
      fields.picture = {
        useImage: !!form.picture.useImage,
        hidden: !!form.picture.hidden,
        imageScalePct: form.picture.imageScalePct,
        backgroundOpacityPct: form.picture.backgroundOpacityPct,
        backgroundScalePct: form.picture.backgroundScalePct,
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
          <CButton
            size="sm"
            color="primary"
            onClick={() => setDraft({ ...EMPTY, type: 'folder', parentId: folder?.id ?? null })}
          >
            <CIcon icon={cilPlus} /> Folder
          </CButton>
          <CButton
            size="sm"
            color="primary"
            onClick={() => setDraft({ ...EMPTY, type: 'component', parentId: folder?.id ?? null })}
          >
            <CIcon icon={cilPlus} /> Component
          </CButton>
        </div>
      </div>
      {level.length === 0 ? (
        <CAlert color="info">
          {folder
            ? 'This folder is empty - add a folder or a component.'
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
