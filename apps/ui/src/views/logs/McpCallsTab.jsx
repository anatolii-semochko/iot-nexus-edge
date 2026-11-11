import React, { useState } from 'react'
import {
  CAlert,
  CBadge,
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
import { t } from 'src/i18n'

/**
 * Logs -> MCP calls (2026-11-10; api ai/mcp.ts, ai_mcp_calls): every tool an MCP client called - when,
 * the token and its service account, the tool, how long, an error; a row opens the call's input.
 */

const PAGE_SIZE_OPTIONS = [25, 50, 100]

const McpCallsTab = () => {
  const [open, setOpen] = useState(null)
  const { items, total, loading, error, page, pageSize, setPage, setPageSize } =
    useServerPaginatedList(
      (pageArg, pageSizeArg) => api.listMcpCalls({ page: pageArg, pageSize: pageSizeArg }),
      [],
      { pageSize: PAGE_SIZE_OPTIONS[0] },
    )
  if (error) return <CAlert color="danger">{error}</CAlert>
  return (
    <>
      {loading && items.length === 0 ? (
        <CSpinner size="sm" />
      ) : items.length === 0 ? (
        <CAlert color="info">{t('No MCP call yet.')}</CAlert>
      ) : (
        <CTable small hover responsive className="align-middle">
          <CTableHead>
            <CTableRow>
              <CTableHeaderCell>{t('Time')}</CTableHeaderCell>
              <CTableHeaderCell>{t('Token')}</CTableHeaderCell>
              <CTableHeaderCell>{t('Account')}</CTableHeaderCell>
              <CTableHeaderCell>{t('Tool')}</CTableHeaderCell>
              <CTableHeaderCell className="text-end">ms</CTableHeaderCell>
              <CTableHeaderCell>{t('Result')}</CTableHeaderCell>
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
                    {formatSmartDateTime(r.createdAt)}
                  </CTableDataCell>
                  <CTableDataCell className="small">{r.tokenName ?? '-'}</CTableDataCell>
                  <CTableDataCell className="small font-monospace">
                    {r.username ?? '-'}
                  </CTableDataCell>
                  <CTableDataCell className="font-monospace small">{r.tool}</CTableDataCell>
                  <CTableDataCell className="small text-end">{r.ms ?? '-'}</CTableDataCell>
                  <CTableDataCell className="small">
                    {r.isError ? (
                      <>
                        <CBadge color="danger" className="me-2">
                          {t('error')}
                        </CBadge>
                        {r.error}
                      </>
                    ) : (
                      <span className="text-body-secondary">{t('ok')}</span>
                    )}
                  </CTableDataCell>
                </CTableRow>
                {open === r.id && (
                  <CTableRow>
                    <CTableDataCell colSpan={6}>
                      <pre
                        className="small mb-0 p-2 rounded bg-body-tertiary"
                        style={{
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                          maxHeight: '18rem',
                          overflow: 'auto',
                        }}
                      >
                        {JSON.stringify(r.input, null, 2)}
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

export default McpCallsTab
