import React from 'react'
import { CTable, CTableBody, CTableDataCell, CTableHeaderCell, CTableRow } from '@coreui/react'
import { api } from 'src/api/client'

// A node's model (AGENTS_TO_DO.md 2026-10-20 X1, 2026-10-22 C): the real
// unit's picture from the node type's Library model, else its type's icon,
// else `picture` (the scene's own drawing); the maker and the model, what
// it is for, the main data, the maker's page. `info` - GET /nodes/:id/info.

const NodeModel = ({ info, picture }) => {
  const model = info.model
  const image = model?.image ? api.apiUrl(model.image) : null
  return (
    <div className="d-flex gap-4 flex-wrap pb-3">
      <div
        style={{ flex: '0 0 auto', width: 300, maxWidth: '100%' }}
        className="d-flex align-items-start justify-content-center"
      >
        {image ? (
          <img
            src={image}
            alt={model.name}
            style={{ maxWidth: '100%', maxHeight: 320, objectFit: 'contain' }}
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
                title="The maker's page or datasheet (opens a new tab)"
              >
                The maker's data
              </a>
            )}
          </>
        ) : (
          <p className="mb-2">
            {info.type?.description ?? 'No model data for this node type yet.'}
          </p>
        )}
        <div className="text-body-secondary small mt-2" title="The node type in the Library">
          {info.type?.name ?? info.node.type}
          {info.node.location ? ` · ${info.node.location}` : ''}
        </div>
      </div>
    </div>
  )
}

export default NodeModel
