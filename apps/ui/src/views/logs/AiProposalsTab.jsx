import React, { useState } from 'react'
import { CAlert, CFormSelect, CSpinner } from '@coreui/react'
import { api } from '../../api/client'
import TablePagination from '../../components/table/TablePagination'
import { useServerPaginatedList } from '../../hooks/useServerPaginatedList'
import { formatSmartDateTime } from '../../utils/format'
import ProposalCard from '../ai/ProposalCard'

/**
 * Logs -> AI Proposals (Nexus Edge AI Assistant, stage 6 - api
 * ai/proposals.ts): every change an agent proposed - the built-in
 * assistant's (its conversation) and an MCP client's - newest first, by
 * status. A pending one is decided here as in the messenger: Accept
 * (applied as you) / Reject.
 */

const PAGE_SIZE_OPTIONS = [25, 50, 100]
const STATUSES = ['pending', 'applied', 'rejected', 'failed']

const AiProposalsTab = () => {
  const [status, setStatus] = useState('')
  const { items, total, loading, error, page, pageSize, setPage, setPageSize, reload } =
    useServerPaginatedList(
      (pageArg, pageSizeArg) =>
        api.listAiProposals({ page: pageArg, pageSize: pageSizeArg, status }),
      [status],
      { pageSize: PAGE_SIZE_OPTIONS[0] },
    )
  if (error) return <CAlert color="danger">{error}</CAlert>
  return (
    <>
      <div className="d-flex align-items-center gap-2 mb-2">
        <CFormSelect
          size="sm"
          style={{ width: 'auto' }}
          value={status}
          onChange={(e) => {
            setStatus(e.target.value)
            setPage(1)
          }}
          aria-label="Status"
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </CFormSelect>
      </div>
      {loading && items.length === 0 ? (
        <CSpinner size="sm" />
      ) : items.length === 0 ? (
        <CAlert color="info">
          No proposal{status ? ` ${status}` : ''} - an agent proposes changes when its Config /
          Control / Install access isn&apos;t Off (Service -&gt; Config -&gt; AI).
        </CAlert>
      ) : (
        items.map((p) => (
          <div key={p.id}>
            <div className="small text-body-secondary">
              {formatSmartDateTime(p.createdAt)} - {p.instanceKey}
              {p.viaMcp ? ' - MCP' : p.conversationId ? ` - conversation ${p.conversationId}` : ''}
            </div>
            <ProposalCard proposal={p} onDecided={reload} />
          </div>
        ))
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

export default AiProposalsTab
