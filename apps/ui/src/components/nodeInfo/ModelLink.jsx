import React, { useEffect, useState } from 'react'
import { api } from 'src/api/client'
import UnitPopup from './UnitPopup'

// A card's model line (AGENTS_TO_DO.md 2026-10-20 X1; the scenes' unit
// popups have the Model tab instead, 2026-10-22 C): the unit's model (its
// node's Library model, else its type) - a link without underline opening
// the node's information (UnitPopup without Status); `fallback` until it is
// known or when the unit has no node.

/** The unit's model (its node's Library model) - a link opening the node's information popup. */
const ModelLink = ({ nodeId, picture, fallback }) => {
  const [info, setInfo] = useState(null)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!nodeId) return undefined
    let cancelled = false
    api
      .getNodeInfo(nodeId)
      .then((i) => !cancelled && setInfo(i))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [nodeId])
  const name = info?.model
    ? `${info.model.name} - ${info.model.maker ?? ''}`.replace(/ - $/, '')
    : (info?.type?.name ?? fallback)
  if (!nodeId || !info) return fallback ?? null
  return (
    <>
      <button
        type="button"
        className="btn btn-link p-0 text-decoration-none small align-baseline"
        title="The model, its technical data, the photo and the place on the map"
        onClick={() => setOpen(true)}
      >
        {name}
      </button>
      {open && <UnitPopup nodeId={nodeId} picture={picture} onClose={() => setOpen(false)} />}
    </>
  )
}

export default ModelLink
