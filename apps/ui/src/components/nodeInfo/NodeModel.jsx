import React from 'react'
import { CTable, CTableBody, CTableDataCell, CTableHeaderCell, CTableRow } from '@coreui/react'
import { api } from 'src/api/client'
import { t } from 'src/i18n'

// A node's model (AGENTS_TO_DO.md 2026-10-20 X1, 2026-10-22 C): the real
// unit's picture from the node type's Library model, else its type's icon,
// else `picture` (the scene's own drawing); the maker and the model, what
// it is for, the main data, the maker's page. `info` - GET /nodes/:id/info.

// `imageHeight` - the room the popup gives the picture (UnitPopup's Model tab fills its height)
const NodeModel = ({ info, picture, imageHeight = null }) => {
  const model = info.model
  const image = model?.image ? api.apiUrl(model.image) : null
  return (
    <div className="d-flex gap-4 flex-wrap pb-3">
      <div
        style={{
          flex: imageHeight ? '1 1 360px' : '0 0 auto',
          width: imageHeight ? undefined : 300,
          maxWidth: '100%',
        }}
        className="d-flex align-items-start justify-content-center"
      >
        {image ? (
          <img
            src={image}
            alt={model.name}
            style={{
              maxWidth: '100%',
              maxHeight: imageHeight ? Math.max(240, imageHeight - 16) : 320,
              objectFit: 'contain',
            }}
          />
        ) : info.type?.iconPath ? (
          <img src={api.apiUrl(info.type.iconPath)} alt="" width="120" height="120" />
        ) : (
          picture
        )}
      </div>
      <div style={{ flex: '1 1 300px', minWidth: 0 }}>
        {model ? (
          <>
            <div className="text-body-secondary small">{model.maker}</div>
            <div className="fs-5 fw-semibold mb-1">{model.name}</div>
            {model.purpose && <p className="mb-2">{model.purpose}</p>}
            {model.specs.length > 0 && (
              <CTable small className="mb-2">
                <CTableBody>
                  {model.specs.map((s) => (
                    <CTableRow key={s.label}>
                      <CTableHeaderCell scope="row" className="fw-normal text-body-secondary">
                        {s.label}
                      </CTableHeaderCell>
                      <CTableDataCell>{s.value}</CTableDataCell>
                    </CTableRow>
                  ))}
                </CTableBody>
              </CTable>
            )}
            {model.url && (
              <a
                href={model.url}
                target="_blank"
                rel="noreferrer"
                className="small"
                title={t("The maker's page or datasheet (opens a new tab)")}
              >
                {t("The maker's data")}
              </a>
            )}
          </>
        ) : (
          <p className="mb-2">
            {info.type?.description ?? t('No model data for this node type yet.')}
          </p>
        )}
        <div className="text-body-secondary small mt-2" title={t('The node type in the Library')}>
          {info.type?.name ?? info.node.type}
          {info.node.location ? ` · ${info.node.location}` : ''}
        </div>
      </div>
    </div>
  )
}

export default NodeModel
