import React, { useState } from 'react'

import { api } from '../../api/client'
import FilePreviewModal from '../../components/files/FilePreviewModal'
import FileTable from '../../components/files/FileTable'
import FileUploadButton from '../../components/files/FileUploadButton'
import { useConfirmModal } from '../../hooks/useConfirmModal'
import { useServerPaginatedList } from '../../hooks/useServerPaginatedList'

// Media tab of a media device's expand row (AGENTS.md section 81): the
// latest image (the device's own live value is its Media Store id), a file
// upload while the device is simulated - the same "capture" a real device
// would make - and the device's stored history on the generic FileTable.
const ACCEPT = 'image/jpeg,image/png,image/webp'
const LATEST_STYLE = {
  maxWidth: '100%',
  maxHeight: '18rem',
  borderRadius: '0.25rem',
  cursor: 'pointer',
}

const DeviceMediaTab = ({ device, value, effectivelySimulated }) => {
  const { confirm, modal } = useConfirmModal()
  const [previewEntry, setPreviewEntry] = useState(null)
  // `value` in the deps: a new capture (live device event) refreshes the
  // history too, without a poll of its own.
  const list = useServerPaginatedList(
    (page, pageSize) =>
      api.listDeviceMedia(device.id, { offset: (page - 1) * pageSize, limit: pageSize }),
    [device.id, value],
  )
  const latestId = typeof value === 'string' && value !== '' ? value : null

  const handleDelete = async (entry) => {
    const ok = await confirm({
      title: 'Delete image',
      body: 'Delete this image and everything stored with it?',
      confirmLabel: 'Delete',
      confirmColor: 'danger',
    })
    if (!ok) return
    await api.deleteDeviceMedia(device.id, entry.id)
    list.reload()
  }

  return (
    <div>
      <div className="d-flex flex-wrap align-items-start gap-3 mb-3">
        <div>
          <div
            className="text-body-secondary text-uppercase fw-semibold mb-1"
            style={{ fontSize: '0.6875rem', letterSpacing: '0.04em' }}
          >
            Latest
          </div>
          {latestId ? (
            <img
              src={api.deviceMediaUrl(device.id, latestId)}
              alt=""
              style={LATEST_STYLE}
              onClick={() =>
                setPreviewEntry({
                  id: latestId,
                  createdAt: list.items.find((i) => i.id === latestId)?.createdAt,
                })
              }
            />
          ) : (
            <div className="text-body-secondary small">No image yet</div>
          )}
        </div>
        {effectivelySimulated && (
          <div>
            <div
              className="text-body-secondary text-uppercase fw-semibold mb-1"
              style={{ fontSize: '0.6875rem', letterSpacing: '0.04em' }}
            >
              Simulate
            </div>
            <FileUploadButton
              accept={ACCEPT}
              label="Upload image"
              onFile={async (file) => {
                await api.simulateDeviceMedia(device.id, file)
                list.reload()
              }}
            />
          </div>
        )}
      </div>
      <FileTable
        items={list.items}
        total={list.total}
        page={list.page}
        pageSize={list.pageSize}
        onPageChange={list.setPage}
        onPageSizeChange={list.setPageSize}
        loading={list.loading}
        error={list.error}
        thumbnailUrl={(entry) => api.deviceMediaUrl(device.id, entry.id)}
        columns={[
          {
            key: 'id',
            label: 'Media id',
            render: (entry) => <code className="small">{entry.id}</code>,
          },
        ]}
        onOpen={setPreviewEntry}
        onDelete={handleDelete}
        emptyText="No images stored yet"
      />
      <FilePreviewModal
        entry={previewEntry}
        imageUrl={previewEntry ? api.deviceMediaUrl(device.id, previewEntry.id) : null}
        onClose={() => setPreviewEntry(null)}
      />
      {modal}
    </div>
  )
}

export default DeviceMediaTab
