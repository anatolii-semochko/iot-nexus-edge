import React, { useState } from 'react'
import {
  CAlert,
  CSpinner,
  CTable,
  CTableBody,
  CTableDataCell,
  CTableHead,
  CTableHeaderCell,
  CTableRow,
} from '@coreui/react'
import { api } from '../../api/client'
import TablePagination from '../../components/table/TablePagination'
import { useServerPaginatedList } from '../../hooks/useServerPaginatedList'
import { formatSmartDateTime } from '../../utils/format'

/**
 * Logs -> AI Reports (Nexus Edge AI Assistant, stage 4): what the assistant
 * reported to the Nexus Edge developers (an instance with Report on - a
 * defect, a gap, an improvement of the platform itself), newest first; a row
 * opens the report. Stored only - sending them anywhere comes later.
 */

const PAGE_SIZE_OPTIONS = [25, 50, 100]

const AiReportsTab = () => {
  const [open, setOpen] = useState(null)
  const { items, total, loading, error, page, pageSize, setPage, setPageSize } =
    useServerPaginatedList(
      (pageArg, pageSizeArg) => api.listAiReports({ page: pageArg, pageSize: pageSizeArg }),
      [],
      { pageSize: PAGE_SIZE_OPTIONS[0] },
    )
  if (error) return <CAlert color="danger">{error}</CAlert>
  return (
    <>
      {loading && items.length === 0 ? (
        <CSpinner size="sm" />
      ) : items.length === 0 ? (
        <CAlert color="info">
          No report yet - an instance reports when its Report access is on (Service -&gt; Config
          -&gt; AI).
        </CAlert>
      ) : (
        <CTable small hover responsive className="align-middle">
          <CTableHead>
            <CTableRow>
              <CTableHeaderCell>When</CTableHeaderCell>
              <CTableHeaderCell>Report</CTableHeaderCell>
              <CTableHeaderCell>Instance</CTableHeaderCell>
              <CTableHeaderCell className="text-end">Conversation</CTableHeaderCell>
            </CTableRow>
          </CTableHead>
          <CTableBody>
            {items.map((r) => (
              <React.Fragment key={r.id}>
                <CTableRow
                  style={{ cursor: 'pointer' }}
                  onClick={() => setOpen(open === r.id ? null : r.id)}
                >
                  <CTableDataCell className="small text-nowrap">
                    {formatSmartDateTime(r.created_at)}
                  </CTableDataCell>
                  <CTableDataCell className="fw-semibold">{r.title}</CTableDataCell>
                  <CTableDataCell className="small">{r.instance_key}</CTableDataCell>
                  <CTableDataCell className="text-end small">
                    {r.conversation_id ?? '-'}
                  </CTableDataCell>
                </CTableRow>
                {open === r.id && (
                  <CTableRow>
                    <CTableDataCell colSpan={4}>
                      <pre
                        className="small mb-0 p-2 rounded bg-body-tertiary"
                        style={{ whiteSpace: 'pre-wrap' }}
                      >
                        {r.body}
                      </pre>
                    </CTableDataCell>
                  </CTableRow>
                )}
              </React.Fragment>
            ))}
          </CTableBody>
        </CTable>
      )}
      <TablePagination
        page={page}
        pageSize={pageSize}
        totalItems={total}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
        pageSizeOptions={PAGE_SIZE_OPTIONS}
      />
    </>
  )
}

export default AiReportsTab
