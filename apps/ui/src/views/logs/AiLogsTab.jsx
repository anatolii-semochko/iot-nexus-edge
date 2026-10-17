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

/**
 * Logs -> AI (Nexus Edge AI Assistant, stage 4; api ai/agent.ts): every
 * conversation with the assistant, newest first - the instance, the work
 * type, who, the model, the questions / tool calls / tokens. A row opens
 * its full payload: the system prompt it ran with, each message, each tool
 * call with its input and result (an instance that doesn't log keeps the
 * text only - "[not logged]").
 */

const PAGE_SIZE_OPTIONS = [25, 50, 100]

const Pre = ({ children }) => (
  <pre
    className="small mb-0 p-2 rounded bg-body-tertiary"
    style={{
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word',
      maxHeight: '18rem',
      overflow: 'auto',
    }}
  >
    {children}
  </pre>
)

const Conversation = ({ id }) => {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [showSystem, setShowSystem] = useState(false)
  React.useEffect(() => {
    api
      .getAiConversation(id)
      .then(setData)
      .catch((err) => setError(err.message))
  }, [id])
  if (error) return <CAlert color="danger">{error}</CAlert>
  if (!data) return <CSpinner size="sm" />
  return (
    <div className="d-flex flex-column gap-2 py-2">
      {data.systemPrompt && (
        <div>
          <button
            type="button"
            className="btn btn-link btn-sm p-0"
            onClick={() => setShowSystem((s) => !s)}
          >
            {showSystem ? 'Hide' : 'Show'} the system prompt ({data.systemPrompt.length} characters)
          </button>
          {showSystem && <Pre>{data.systemPrompt}</Pre>}
        </div>
      )}
      {data.messages.map((m) => (
        <div key={m.id}>
          <div className="small text-body-secondary">
            <strong className="text-body">
              {m.role === 'tool' ? `tool ${m.toolName}` : m.role}
            </strong>
            {m.isError && (
              <CBadge color="danger" className="ms-2">
                error
              </CBadge>
            )}
            {m.model && <span className="ms-2">{m.model}</span>}
            {m.tokensIn != null && (
              <span className="ms-2">
                {m.tokensIn} / {m.tokensOut} tokens
              </span>
            )}
            {m.latencyMs != null && <span className="ms-2">{m.latencyMs} ms</span>}
            <span className="ms-2">{formatSmartDateTime(m.createdAt)}</span>
          </div>
          {m.content && <Pre>{m.content}</Pre>}
          {m.toolCalls?.map((c) => (
            <Pre key={c.id}>{`-> ${c.name} ${JSON.stringify(c.input)}`}</Pre>
          ))}
        </div>
      ))}
    </div>
  )
}

const AiLogsTab = () => {
  const [open, setOpen] = useState(null)
  const { items, total, loading, error, page, pageSize, setPage, setPageSize } =
    useServerPaginatedList(
      (pageArg, pageSizeArg) => api.listAiLogs({ page: pageArg, pageSize: pageSizeArg }),
      [],
      { pageSize: PAGE_SIZE_OPTIONS[0] },
    )
  if (error) return <CAlert color="danger">{error}</CAlert>
  return (
    <>
      {loading && items.length === 0 ? (
        <CSpinner size="sm" />
      ) : items.length === 0 ? (
        <CAlert color="info">No conversation yet.</CAlert>
      ) : (
        <CTable small hover responsive className="align-middle">
          <CTableHead>
            <CTableRow>
              <CTableHeaderCell>Updated</CTableHeaderCell>
              <CTableHeaderCell>Conversation</CTableHeaderCell>
              <CTableHeaderCell>Instance</CTableHeaderCell>
              <CTableHeaderCell>Who</CTableHeaderCell>
              <CTableHeaderCell>Model</CTableHeaderCell>
              <CTableHeaderCell className="text-end">Questions</CTableHeaderCell>
              <CTableHeaderCell className="text-end">Tool calls</CTableHeaderCell>
              <CTableHeaderCell className="text-end">Tokens in / out</CTableHeaderCell>
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
                    {formatSmartDateTime(r.updated_at)}
                  </CTableDataCell>
                  <CTableDataCell>
                    <div className="fw-semibold">
                      {r.scheduled && (
                        <CBadge color="info" className="me-1">
                          scheduled
                        </CBadge>
                      )}
                      {r.title}
                    </div>
                    <div className="small text-body-secondary">
                      {r.work_type}
                      {!r.logged && ' - not logged'}
                    </div>
                  </CTableDataCell>
                  <CTableDataCell className="small">{r.instance_key}</CTableDataCell>
                  <CTableDataCell className="small">{r.created_by ?? '-'}</CTableDataCell>
                  <CTableDataCell className="small">
                    {r.connection_name}
                    <div className="text-body-secondary font-monospace">{r.model}</div>
                  </CTableDataCell>
                  <CTableDataCell className="text-end">{r.questions}</CTableDataCell>
                  <CTableDataCell className="text-end">{r.tool_calls}</CTableDataCell>
                  <CTableDataCell className="text-end small text-nowrap">
                    {r.tokens_in} / {r.tokens_out}
                  </CTableDataCell>
                </CTableRow>
                {open === r.id && (
                  <CTableRow>
                    <CTableDataCell colSpan={8}>
                      <Conversation id={r.id} />
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

export default AiLogsTab
