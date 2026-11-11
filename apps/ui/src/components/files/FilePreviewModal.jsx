import React from 'react'
import { CModal, CModalBody, CModalHeader, CModalTitle } from '@coreui/react'

import { formatSmartDateTime } from '../../utils/format'

// Generic image preview popup (AGENTS.md section 81) - the file, its date
// and whatever the caller puts under it (`children`: e.g. the AI Analyzer's
// list of found objects). `overlay` is drawn on top of the image in its own
// coordinate box - absolutely positioned over the image, so a caller can
// draw e.g. SVG boxes in normalized (0..1) coordinates without knowing the
// rendered size.
const FilePreviewModal = ({ entry, imageUrl, onClose, overlay, children }) => (
  <CModal visible={Boolean(entry)} onClose={onClose} size="lg" alignment="center">
    <CModalHeader>
      <CModalTitle>{entry ? formatSmartDateTime(entry.createdAt) : ''}</CModalTitle>
    </CModalHeader>
    <CModalBody>
      {entry && imageUrl && (
        <div style={{ position: 'relative', lineHeight: 0 }}>
          <img src={imageUrl} alt="" style={{ width: '100%', borderRadius: '0.25rem' }} />
          {overlay && <div style={{ position: 'absolute', inset: 0 }}>{overlay}</div>}
        </div>
      )}
      {children && <div className="mt-3">{children}</div>}
    </CModalBody>
  </CModal>
)

export default FilePreviewModal
