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
 * Library -> a node / device type's "Add node" / "Add device" (Nexus Edge
 * AI Assistant, stage 8 - api registry.ts; the AI Assistant's Install
 * proposals make the same calls). A node: its name, its parent (a module
 * type - required, of the types it plugs into), the devices its node.yaml
 * declares by role (all checked - uncheck what this unit hasn't got). A
 * device: its name, its node (optional - standalone) and role. Both
 * virtual (played by a simulation) - a physical binding (transport) is set
 * through the API for now.
 */

const AddNodeForm = ({ item, nodes, value, onChange }) => {
  const [nodeType, setNodeType] = useState(null)
  const [error, setError] = useState(null)
  useEffect(() => {
    api
      .getNodeType(item.typeName)
      .then((t) => {
        setNodeType(t)
        onChange({ roles: t.devices.map((d) => d.role) })
      })
      .catch((err) => setError(err.message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.typeName])
  if (error) return <CAlert color="danger">{error}</CAlert>
  if (!nodeType) return <CSpinner size="sm" />
  const parents = nodes.filter((n) => nodeType.parents.includes(n.type))
  const roles = value.roles ?? []
  return (
    <>
      {nodeType.parents.length > 0 && (
        <div className="mb-3">
          <CFormLabel>Plugs into</CFormLabel>
          <CFormSelect
            value={value.parentId ?? ''}
            onChange={(e) => onChange({ parentId: e.target.value ? Number(e.target.value) : null })}
          >
            <option value="">- choose ({nodeType.parents.join(' / ')}) -</option>
            {parents.map((n) => (
              <option key={n.id} value={n.id}>
                {n.name}
              </option>
            ))}
          </CFormSelect>
        </div>
      )}
      <CFormLabel>
        Devices ({roles.length} of {nodeType.devices.length})
      </CFormLabel>
      <div className="border rounded p-2" style={{ maxHeight: '14rem', overflow: 'auto' }}>
        {nodeType.devices.length === 0 && (
          <div className="small text-body-secondary">The type declares no devices.</div>
        )}
        {nodeType.devices.map((d) => (
          <CFormCheck
            key={d.role}
            id={`role-${d.role}`}
            label={
              <>
                {d.role} <span className="text-body-secondary small">({d.type})</span>
              </>
            }
            checked={roles.includes(d.role)}
            onChange={(e) =>
              onChange({
                roles: e.target.checked ? [...roles, d.role] : roles.filter((r) => r !== d.role),
              })
            }
          />
        ))}
      </div>
    </>
  )
}

const AddDeviceForm = ({ nodes, value, onChange }) => (
  <>
    <div className="mb-3">
      <CFormLabel>Node</CFormLabel>
      <CFormSelect
        value={value.nodeId ?? ''}
        onChange={(e) => onChange({ nodeId: e.target.value ? Number(e.target.value) : null })}
      >
        <option value="">- standalone -</option>
        {nodes.map((n) => (
          <option key={n.id} value={n.id}>
            {n.name} ({n.type})
          </option>
        ))}
      </CFormSelect>
    </div>
    <div className="mb-3">
      <CFormLabel>Role</CFormLabel>
      <CFormInput
        value={value.role ?? ''}
        placeholder="how its process finds it, e.g. heater"
        onChange={(e) => onChange({ role: e.target.value })}
      />
    </div>
  </>
)

/** `kind` - "node" | "device"; `onCreated(message)`. */
const AddRegistryModal = ({ kind, item, onClose, onCreated }) => {
  const [form, setForm] = useState({ name: item.name })
  const [nodes, setNodes] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  useEffect(() => {
    api
      .listNodes()
      .then(setNodes)
      .catch((err) => setError(err.message))
  }, [])
  const change = (c) => setForm((f) => ({ ...f, ...c }))
  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      if (kind === 'node') {
        const r = await api.createNode({ ...form, type: item.typeName })
        onCreated(
          `Node "${form.name}" registered with ${r.deviceIds.length} device(s) - see the Nodes page.`,
        )
      } else {
        await api.createDevice({ ...form, type: item.typeName, role: form.role || null })
        onCreated(`Device "${form.name}" registered - see the Devices page.`)
      }
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <CModal visible onClose={onClose}>
      <CModalHeader>
        <CModalTitle>
          Add {kind} - {item.name}
        </CModalTitle>
      </CModalHeader>
      <CModalBody>
        {error && <CAlert color="danger">{error}</CAlert>}
        <div className="mb-3">
          <CFormLabel>Name</CFormLabel>
          <CFormInput
            value={form.name}
            onChange={(e) => change({ name: e.target.value })}
            disabled={busy}
          />
        </div>
        {!nodes ? (
          <CSpinner size="sm" />
        ) : kind === 'node' ? (
          <AddNodeForm item={item} nodes={nodes} value={form} onChange={change} />
        ) : (
          <AddDeviceForm nodes={nodes} value={form} onChange={change} />
        )}
        <div className="small text-body-secondary mt-2">
          Virtual - played by a simulation until the hardware is wired.
        </div>
      </CModalBody>
      <CModalFooter>
        <CButton color="secondary" variant="outline" onClick={onClose} disabled={busy}>
          Cancel
        </CButton>
        <CButton color="primary" onClick={submit} disabled={busy || !form.name?.trim()}>
          {busy && <CSpinner size="sm" className="me-1" />}Register
        </CButton>
      </CModalFooter>
    </CModal>
  )
}

export default AddRegistryModal
