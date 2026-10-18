import React from 'react'
import {
  CSpinner,
  CTable,
  CTableBody,
  CTableDataCell,
  CTableHead,
  CTableHeaderCell,
  CTableRow,
} from '@coreui/react'
import { cilTrash } from '@coreui/icons'

import IconButton from '../IconButton'
import TablePagination from '../table/TablePagination'
import { formatSmartDateTime } from '../../utils/format'

// Generic file-entry table (AGENTS.md section 81) - the UI half of the
// generic file store (apps/api/src/fileStore.ts): one row per entry, newest
// first, thumbnail + date + caller-defined columns, a delete action, and
// server-side paging via useServerPaginatedList. First consumer: the
// Devices page's Media tab; the AI Analyzer's Images tab reuses it with its
// own columns/filters.
//
// Entries are `{ id, createdAt, parts, json }` - the API's own list shape.
// `thumbnailUrl(entry)` returns an image URL or null (no thumbnail cell
// then). `toolbar` is rendered above the table (search/filters belong to
// the caller - which ones make sense is feature-specific).
const THUMB_STYLE = {
  width: '4rem',
  height: '3rem',
  objectFit: 'cover',
  borderRadius: '0.25rem',
  cursor: 'pointer',
}

const FileTable = ({
  items,
  total,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  loading,
  error,
  thumbnailUrl,
  columns = [],
  onOpen,
  onDelete,
  emptyText = 'No files yet',
  toolbar,
}) => (
  <div>
    {toolbar && <div className="mb-2">{toolbar}</div>}
    {error && <div className="text-danger small mb-2">{error}</div>}
    <CTable small align="middle" className="mb-0">
      <CTableHead>
        <CTableRow>
          {thumbnailUrl && <CTableHeaderCell style={{ width: '5rem' }} />}
          <CTableHeaderCell>Date</CTableHeaderCell>
          {columns.map((col) => (
            <CTableHeaderCell key={col.key}>{col.label}</CTableHeaderCell>
          ))}
          {onDelete && <CTableHeaderCell style={{ width: '3rem' }} />}
        </CTableRow>
      </CTableHead>
      <CTableBody>
        {items.length === 0 && (
          <CTableRow>
            <CTableDataCell
              colSpan={columns.length + 3}
              className="text-body-secondary text-center"
            >
              {loading ? <CSpinner size="sm" /> : emptyText}
            </CTableDataCell>
          </CTableRow>
        )}
        {items.map((entry) => (
          <CTableRow key={entry.id}>
            {thumbnailUrl && (
              <CTableDataCell>
                {thumbnailUrl(entry) && (
                  <img
                    src={thumbnailUrl(entry)}
                    alt=""
                    loading="lazy"
                    style={THUMB_STYLE}
                    onClick={onOpen ? () => onOpen(entry) : undefined}
                  />
                )}
              </CTableDataCell>
            )}
            <CTableDataCell
              style={onOpen ? { cursor: 'pointer' } : undefined}
              onClick={onOpen ? () => onOpen(entry) : undefined}
            >
              {formatSmartDateTime(entry.createdAt)}
            </CTableDataCell>
            {columns.map((col) => (
              <CTableDataCell key={col.key}>{col.render(entry)}</CTableDataCell>
            ))}
            {onDelete && (
              <CTableDataCell className="text-end">
                <IconButton
                  icon={cilTrash}
                  size="sm"
                  color="danger"
                  ariaLabel="Delete"
                  title="Delete"
                  onClick={() => onDelete(entry)}
                />
              </CTableDataCell>
            )}
          </CTableRow>
        ))}
      </CTableBody>
    </CTable>
    <TablePagination
      page={page}
      pageSize={pageSize}
      totalItems={total}
      onPageChange={onPageChange}
      onPageSizeChange={onPageSizeChange}
    />
  </div>
)

export default FileTable
