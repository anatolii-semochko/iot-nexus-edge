import React, { useMemo, useState } from 'react'
import {
  CButton,
  CFormInput,
  CTable,
  CTableBody,
  CTableDataCell,
  CTableHead,
  CTableHeaderCell,
  CTableRow,
} from '@coreui/react'
import { cilTrash } from '@coreui/icons'

import { request } from 'src/api/client'
import IconButton from 'src/components/IconButton'
import Switch from 'src/components/Switch'
import TablePagination from 'src/components/table/TablePagination'
import TableSearchInput from 'src/components/table/TableSearchInput'
import { useConfirmModal } from 'src/hooks/useConfirmModal'
import { usePagination } from 'src/hooks/usePagination'

// Target objects (AGENTS.md section 82): what the AI looks for. Paged and
// searched on the client (the list is capped at 100); every change is one
// atomic server-side operation on one object.
const TEXT_MAX = 50

const TargetsTab = ({ process, targets, limit, onChanged }) => {
  const { confirm, modal } = useConfirmModal()
  const [search, setSearch] = useState('')
  const [newText, setNewText] = useState('')
  const [editing, setEditing] = useState(null) // { id, text }
  const [error, setError] = useState(null)

  const filtered = useMemo(
    () => targets.filter((t) => t.text.toLowerCase().includes(search.trim().toLowerCase())),
    [targets, search],
  )
  const pagination = usePagination(filtered)
  const base = `/ai-analyzer/${process.id}/targets`

  const run = async (fn) => {
    setError(null)
    try {
      await fn()
      await onChanged()
    } catch (err) {
      setError(err.message)
    }
  }

  const add = () =>
    run(async () => {
      await request(base, { method: 'POST', body: JSON.stringify({ text: newText }) })
      setNewText('')
    })

  const saveEdit = () =>
    run(async () => {
      await request(`${base}/${editing.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ text: editing.text }),
      })
      setEditing(null)
    })

  const remove = async (target) => {
    const ok = await confirm({
      title: 'Delete target object',
      body: `Delete "${target.text}"? Past results keep its name.`,
      confirmLabel: 'Delete',
      confirmColor: 'danger',
    })
    if (ok) await run(() => request(`${base}/${target.id}`, { method: 'DELETE' }))
  }

  return (
    <div>
      <div className="d-flex flex-wrap gap-2 align-items-center mb-3">
        <TableSearchInput value={search} onSearch={setSearch} placeholder="Search objects..." />
        <CFormInput
          size="sm"
          style={{ width: '18rem' }}
          placeholder="New target object (any language)"
          maxLength={TEXT_MAX}
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && newText.trim() && add()}
        />
        <CButton
          size="sm"
          color="primary"
          disabled={!newText.trim() || targets.length >= limit}
          onClick={add}
        >
          Add
        </CButton>
        <span className="text-body-secondary small">
          {targets.length} / {limit}
        </span>
        {error && <span className="text-danger small">{error}</span>}
      </div>
      <CTable small align="middle" className="mb-0 table-no-last-border">
        <CTableHead>
          <CTableRow>
            <CTableHeaderCell style={{ width: '4rem' }}>ID</CTableHeaderCell>
            <CTableHeaderCell>Object</CTableHeaderCell>
            <CTableHeaderCell style={{ width: '6rem' }}>Active</CTableHeaderCell>
            <CTableHeaderCell style={{ width: '3rem' }} />
          </CTableRow>
        </CTableHead>
        <CTableBody>
          {pagination.pageItems.length === 0 && (
            <CTableRow>
              <CTableDataCell colSpan={4} className="text-body-secondary text-center">
                No target objects
              </CTableDataCell>
            </CTableRow>
          )}
          {pagination.pageItems.map((t) => (
            <CTableRow key={t.id}>
              <CTableDataCell className="text-body-secondary">{t.id}</CTableDataCell>
              <CTableDataCell>
                {editing?.id === t.id ? (
                  <CFormInput
                    size="sm"
                    autoFocus
                    maxLength={TEXT_MAX}
                    value={editing.text}
                    onChange={(e) => setEditing({ id: t.id, text: e.target.value })}
                    onBlur={saveEdit}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') e.currentTarget.blur()
                      if (e.key === 'Escape') setEditing(null)
                    }}
                  />
                ) : (
                  <span
                    style={{ cursor: 'text' }}
                    title="Click to edit"
                    onClick={() => setEditing({ id: t.id, text: t.text })}
                  >
                    {t.text}
                  </span>
                )}
              </CTableDataCell>
              <CTableDataCell>
                <Switch
                  checked={t.active}
                  ariaLabel={`Active: ${t.text}`}
                  onChange={(active) =>
                    run(() =>
                      request(`${base}/${t.id}`, {
                        method: 'PATCH',
                        body: JSON.stringify({ active }),
                      }),
                    )
                  }
                />
              </CTableDataCell>
              <CTableDataCell className="text-end">
                <IconButton
                  icon={cilTrash}
                  size="sm"
                  color="danger"
                  ariaLabel="Delete"
                  title="Delete"
                  onClick={() => remove(t)}
                />
              </CTableDataCell>
            </CTableRow>
          ))}
        </CTableBody>
      </CTable>
      <TablePagination
        page={pagination.page}
        pageSize={pagination.pageSize}
        totalItems={filtered.length}
        onPageChange={pagination.setPage}
        onPageSizeChange={pagination.setPageSize}
      />
      {modal}
    </div>
  )
}

export default TargetsTab
