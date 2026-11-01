import React, { useState } from 'react'
import { CCol, CFormSelect, CRow } from '@coreui/react'

import { api, request } from 'src/api/client'
import FilePreviewModal from 'src/components/files/FilePreviewModal'
import FileTable from 'src/components/files/FileTable'
import DateRangeFilter from 'src/components/table/DateRangeFilter'
import TableSearchInput from 'src/components/table/TableSearchInput'
import { useConfirmModal } from 'src/hooks/useConfirmModal'
import { useServerPaginatedList } from 'src/hooks/useServerPaginatedList'
import BoxOverlay from './BoxOverlay'
import { formatFound } from './foundGroups'
import ResultDetails from './ResultDetails'
import { packageT } from 'src/i18n'
// the package's words (its own locales/, then the core's)
const tr = packageT('ai-analyzer')

// Images (AGENTS.md section 82): stored images with their results on the
// generic FileTable - search (result text, found object names), date range,
// found / status / target filters, preview with boxes, delete.
const toIso = (local) => (local ? new Date(local).toISOString() : '')

const ImagesTab = ({ process, metrics, targets }) => {
  const { confirm, modal } = useConfirmModal()
  const [filters, setFilters] = useState({
    search: '',
    from: '',
    to: '',
    found: '',
    status: '',
    targetId: '',
  })
  const [previewEntry, setPreviewEntry] = useState(null)
  const imageDeviceId = process.config.imageDeviceId
  const set = (patch) => setFilters((f) => ({ ...f, ...patch }))

  const list = useServerPaginatedList(
    (page, pageSize) => {
      const params = new URLSearchParams({
        offset: String((page - 1) * pageSize),
        limit: String(pageSize),
      })
      for (const [key, value] of Object.entries({
        ...filters,
        from: toIso(filters.from),
        to: toIso(filters.to),
      })) {
        if (value !== '') params.set(key, value)
      }
      return request(`/ai-analyzer/${process.id}/images?${params}`)
    },
    [process.id, filters, metrics.lastAnalyzedAt],
  )

  const handleDelete = async (entry) => {
    const ok = await confirm({
      title: tr('Delete image'),
      body: tr('Delete this image with its analysis result?'),
      confirmLabel: tr('Delete'),
      confirmColor: 'danger',
    })
    if (!ok) return
    await api.deleteDeviceMedia(imageDeviceId, entry.id)
    list.reload()
  }

  const toolbar = (
    <CRow className="g-2 align-items-center">
      <CCol xs="auto">
        <TableSearchInput
          value={filters.search}
          onSearch={(search) => set({ search })}
          placeholder={tr('Search text/objects...')}
        />
      </CCol>
      <DateRangeFilter
        from={filters.from}
        to={filters.to}
        onFromChange={(from) => set({ from })}
        onToChange={(to) => set({ to })}
      />
      <CCol xs="auto">
        <CFormSelect
          size="sm"
          value={filters.found}
          onChange={(e) => set({ found: e.target.value })}
          aria-label={tr('Found')}
        >
          <option value="">{tr('Any result')}</option>
          <option value="yes">{tr('Targets found')}</option>
          <option value="no">{tr('No targets')}</option>
        </CFormSelect>
      </CCol>
      <CCol xs="auto">
        <CFormSelect
          size="sm"
          value={filters.status}
          onChange={(e) => set({ status: e.target.value })}
          aria-label={tr('Status')}
        >
          <option value="">{tr('Any status')}</option>
          <option value="ok">{tr('Analysed')}</option>
          <option value="error">{tr('Failed')}</option>
        </CFormSelect>
      </CCol>
      <CCol xs="auto">
        <CFormSelect
          size="sm"
          value={filters.targetId}
          onChange={(e) => set({ targetId: e.target.value })}
          aria-label={tr('Target object')}
        >
          <option value="">{tr('Any object')}</option>
          {targets.map((t) => (
            <option key={t.id} value={t.id}>
              {t.text}
            </option>
          ))}
        </CFormSelect>
      </CCol>
    </CRow>
  )

  return (
    <div>
      <FileTable
        toolbar={toolbar}
        items={list.items}
        total={list.total}
        page={list.page}
        pageSize={list.pageSize}
        onPageChange={list.setPage}
        onPageSizeChange={list.setPageSize}
        loading={list.loading}
        error={list.error}
        thumbnailUrl={(entry) =>
          api.deviceMediaUrl(
            imageDeviceId,
            entry.id,
            entry.parts.includes('preview.jpg') ? 'preview.jpg' : undefined,
          )
        }
        columns={[
          {
            key: 'text',
            label: tr('Result'),
            render: (entry) =>
              entry.json?.status === 'error' ? (
                <span className="text-danger">{tr('Failed')}</span>
              ) : (
                (entry.json?.text ?? <span className="text-body-secondary">-</span>)
              ),
          },
          {
            key: 'found',
            label: tr('Found'),
            render: (entry) => formatFound(entry.json?.found),
          },
          {
            key: 'tokens',
            label: tr('Tokens'),
            render: (entry) => entry.json?.usage?.totalTokens ?? '',
          },
        ]}
        onOpen={setPreviewEntry}
        onDelete={handleDelete}
        emptyText={tr('No images match')}
      />
      <FilePreviewModal
        entry={previewEntry}
        imageUrl={previewEntry ? api.deviceMediaUrl(imageDeviceId, previewEntry.id) : null}
        overlay={previewEntry ? <BoxOverlay found={previewEntry.json?.found} /> : null}
        onClose={() => setPreviewEntry(null)}
      >
        {previewEntry && <ResultDetails result={previewEntry.json} />}
      </FilePreviewModal>
      {modal}
    </div>
  )
}

export default ImagesTab
