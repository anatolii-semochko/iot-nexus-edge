import React, { useEffect, useState } from 'react'
import {
  CAlert,
  CButton,
  CFormCheck,
  CFormInput,
  CFormLabel,
  CFormSelect,
  CModal,
  CModalBody,
  CModalFooter,
  CModalHeader,
  CModalTitle,
  CSpinner,
} from '@coreui/react'
import { api } from '../../api/client'

/**
 * Per-node Settings popup (AGENTS_TO_DO.md, 2026-08-01) - a Node is a
 * physical workplace served locally by exactly one group of Nodes, so
 * the group field is a single dropdown, not the checkbox-multiselect
 * shape ProcessSettingsModal/DeviceSettingsModal use for many-to-many
 * memberships. Also renames the node itself (2026-08-01 follow-up: "у
 * форму Config потрібно додати поле зміни Name"). `node.group_id`/
 * `node.name`/`node.location` already come back from GET /nodes (see
 * routes/nodes.ts's SELECT_NODE join), so no separate fetch-on-open is
 * needed here. `location` (AGENTS_TO_DO.md, 2026-08-23) was display-only
 * before this - shown in NodesList.jsx's own column and the row-detail
 * JSON, but with no write path anywhere - added here as a free-text
 * field, same as every other target-project so far has left it (no
 * fixed location taxonomy exists in this app).
 *
 * "Attached to" (AGENTS.md section 87) - the base node this node belongs
 * to, offered only for a node type whose node.yaml declares `parents:`;
 * candidates are the other nodes of those types. The API re-validates.
 */
const NodeSettingsModal = ({ visible, onClose, node, nodes = [], nodeGroups, onSaved }) => {
  const [name, setName] = useState('')
  const [location, setLocation] = useState('')
  const [groupId, setGroupId] = useState('')
  const [parentId, setParentId] = useState('')
  // the information popup's details (AGENTS_TO_DO.md 2026-10-20, X1)
  const [info, setInfo] = useState(null)
  const [model, setModel] = useState('')
  const [latitude, setLatitude] = useState('')
  const [longitude, setLongitude] = useState('')
  const [photo, setPhoto] = useState(null)
  const [removePhoto, setRemovePhoto] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (visible && node) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setName(node.name)
      setLocation(node.location ?? '')

      setGroupId(node.group_id ?? '')
      setParentId(node.parent_id ?? '')
      setModel(node.model ?? '')
      setLatitude(node.latitude ?? '')
      setLongitude(node.longitude ?? '')
      setPhoto(null)
      setRemovePhoto(false)
      setInfo(null)
      setError(null)
      api
        .getNodeInfo(node.id)
        .then(setInfo)
        .catch(() => {})
    }
  }, [visible, node])

  const parentTypes = node?.parent_types ?? []
  const parentCandidates = nodes.filter((n) => n.id !== node?.id && parentTypes.includes(n.type))

  const handleSave = async () => {
    const trimmedName = name.trim()
    if (!trimmedName) {
      setError('Name is required')
      return
    }
    const lat = latitude === '' ? null : Number(latitude)
    const lon = longitude === '' ? null : Number(longitude)
    if (
      (lat === null) !== (lon === null) ||
      (lat !== null && (Number.isNaN(lat) || Number.isNaN(lon)))
    ) {
      setError('Latitude and longitude: both numbers, or both empty')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await api.setNodeDetails(node.id, { model: model || null, latitude: lat, longitude: lon })
      if (photo) await api.uploadNodePhoto(node.id, photo)
      else if (removePhoto) await api.deleteNodePhoto(node.id)
      await Promise.all([
        api.renameNode(node.id, trimmedName),
        api.setNodeLocation(node.id, location.trim()),
        api.setNodeGroup(node.id, groupId === '' ? null : Number(groupId)),
        ...(parentTypes.length > 0
          ? [api.setNodeParent(node.id, parentId === '' ? null : Number(parentId))]
          : []),
      ])
      onSaved?.()
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <CModal visible={visible} onClose={onClose}>
      <CModalHeader>
        <CModalTitle>{node?.name} settings</CModalTitle>
      </CModalHeader>
      <CModalBody>
        {error && <CAlert color="danger">{error}</CAlert>}
        <div className="mb-3">
          <CFormLabel>Name</CFormLabel>
          <CFormInput value={name} onChange={(e) => setName(e.target.value)} disabled={busy} />
        </div>
        <div className="mb-3">
          <CFormLabel>Location</CFormLabel>
          <CFormInput
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            disabled={busy}
            placeholder="Not set"
          />
        </div>
        <CFormLabel>Node Group</CFormLabel>
        <CFormSelect value={groupId} onChange={(e) => setGroupId(e.target.value)} disabled={busy}>
          <option value="">No group</option>
          {nodeGroups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </CFormSelect>
        {info?.models?.length > 0 && (
          <div className="mt-3">
            <CFormLabel>Model</CFormLabel>
            <CFormSelect
              value={model}
              onChange={(e) => setModel(e.target.value)}
              disabled={busy}
              title="Which of the node type's reference models this unit is - shown in its information popup"
            >
              <option value="">{`Default - ${info.models[0].name}`}</option>
              {info.models.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.name}
                </option>
              ))}
            </CFormSelect>
          </div>
        )}
        <div className="mt-3">
          <CFormLabel>Position on the map</CFormLabel>
          <div className="d-flex gap-2">
            <CFormInput
              value={latitude}
              onChange={(e) => setLatitude(e.target.value)}
              disabled={busy}
              placeholder="Latitude"
              inputMode="decimal"
              aria-label="Latitude"
              title="Latitude, degrees (-90..90) - e.g. 51.3127"
            />
            <CFormInput
              value={longitude}
              onChange={(e) => setLongitude(e.target.value)}
              disabled={busy}
              placeholder="Longitude"
              inputMode="decimal"
              aria-label="Longitude"
              title="Longitude, degrees (-180..180) - e.g. 9.4797"
            />
          </div>
        </div>
        <div className="mt-3">
          <CFormLabel>Photo of the unit</CFormLabel>
          <CFormInput
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
            disabled={busy}
            title="A photo of the real unit - shown in its information popup (JPEG, PNG or WebP)"
          />
          {info?.photo && !photo && (
            <CFormCheck
              className="mt-1"
              label="Remove the current photo"
              checked={removePhoto}
              onChange={(e) => setRemovePhoto(e.target.checked)}
              disabled={busy}
            />
          )}
        </div>
        {parentTypes.length > 0 && (
          <div className="mt-3">
            <CFormLabel>Attached to</CFormLabel>
            <CFormSelect
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
              disabled={busy}
            >
              <option value="">Not attached</option>
              {parentCandidates.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.name}
                </option>
              ))}
            </CFormSelect>
          </div>
        )}
      </CModalBody>
      <CModalFooter>
        <CButton color="secondary" variant="outline" onClick={onClose} disabled={busy}>
          Cancel
        </CButton>
        <CButton color="success" onClick={handleSave} disabled={busy}>
          {busy ? <CSpinner size="sm" /> : 'Save'}
        </CButton>
      </CModalFooter>
    </CModal>
  )
}

export default NodeSettingsModal
