import React, { useEffect, useState } from 'react'
import {
  CModal,
  CModalBody,
  CModalHeader,
  CModalTitle,
  CNav,
  CNavItem,
  CNavLink,
  CSpinner,
} from '@coreui/react'
import { api } from 'src/api/client'
import NodeModel from './NodeModel'
import TileMap from './TileMap'
import AiButton from '../ai/AiButton'
import { ChartSize } from '../charts/SeriesChart'

// A unit's popup (AGENTS_TO_DO.md 2026-10-22, C - images/device-popup.png):
// tabs "Status" (the scene's live picture on the left - as tall as the
// readings and charts on its right, a wide one held by the width; the
// readings, the charts, `footer` - the controls), "Model" (the node type's
// Library model - its real picture, the data), "Photo" (the real unit -
// when the node has one), "Map" (where it stands - when placed). No
// `children` - the node's information only (Model first). One tab - no
// switcher. `picture` - a root <svg> (its viewBox keeps the proportions).
// `processId` - the process the unit is shown in (the AI button's subject). `className` - on the modal: a scene's class whose colour variables its
// picture uses (the modal renders outside the scene). Big - for the charts (the user, 2026-10-29): the
// dialog nearly the window's width, its charts taller (ChartSize).

const STACK_BELOW_PX = 700 // narrower - the picture above the readings
const STACKED_PICTURE_PX = 220
// the charts' height inside (viewBox units at 680 wide); the dialog's width - `.chart-popup` (style.scss)
const CHART_H = 220
const PICTURE_CSS = `
.unit-picture { display: flex; align-items: center; justify-content: center; flex: 0 0 auto; }
.unit-picture > svg { height: 100%; width: auto; max-width: 100%; }
`

const UnitPopup = ({
  title,
  nodeId,
  processId = null,
  picture,
  children,
  footer,
  className,
  onClose,
}) => {
  const hasStatus = children != null
  const [info, setInfo] = useState(null)
  const [error, setError] = useState(null)
  const [tab, setTab] = useState(hasStatus ? 'status' : 'model')
  // the elements by callback refs - the modal mounts its body after the first effects
  const [row, setRow] = useState(null)
  const [right, setRight] = useState(null)
  const [rightPx, setRightPx] = useState(null)
  const [rowPx, setRowPx] = useState(null)

  useEffect(() => {
    if (!nodeId) return undefined
    let cancelled = false
    api
      .getNodeInfo(nodeId)
      .then((i) => !cancelled && setInfo(i))
      .catch((err) => !cancelled && setError(err.message))
    return () => {
      cancelled = true
    }
  }, [nodeId])

  // the picture follows the readings' height (and the row's width - stacked when narrow)
  useEffect(() => {
    if (!row || !right) return undefined
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        if (e.target === right) setRightPx(Math.round(e.contentRect.height))
        if (e.target === row) setRowPx(Math.round(e.contentRect.width))
      }
    })
    ro.observe(right)
    ro.observe(row)
    return () => ro.disconnect()
  }, [row, right])

  const tabs = [
    ...(hasStatus ? [['status', 'Status', 'The unit now - its readings and today']] : []),
    ...(info ? [['model', 'Model', 'The model and its main technical data']] : []),
    ...(info?.photo ? [['photo', 'Photo', 'A photo of the real unit']] : []),
    ...(info?.position ? [['map', 'Map', 'Where the unit stands']] : []),
  ]
  const stacked = rowPx != null && rowPx < STACK_BELOW_PX
  const pictureStyle = stacked
    ? { height: STACKED_PICTURE_PX, flexBasis: '100%' }
    : { height: rightPx ?? STACKED_PICTURE_PX, maxWidth: '40%' }

  return (
    <CModal
      visible
      onClose={onClose}
      size="xl"
      alignment="center"
      className={['chart-popup', className].filter(Boolean).join(' ')}
    >
      <style>{PICTURE_CSS}</style>
      <CModalHeader>
        <CModalTitle className="d-flex align-items-center gap-2">
          {/* the AI button before the name (2026-10-24) - the assistant on this unit */}
          <AiButton
            subject={
              nodeId
                ? { type: 'node', id: nodeId, processId }
                : processId
                  ? { type: 'process', id: processId }
                  : null
            }
            label={title ?? info?.node?.name}
            size={24}
          />
          {title ?? info?.node?.name ?? 'Unit'}
        </CModalTitle>
      </CModalHeader>
      <CModalBody>
        {tabs.length > 1 && (
          <CNav variant="underline-border" className="mb-3" role="tablist">
            {tabs.map(([key, label, hint]) => (
              <CNavItem key={key}>
                <CNavLink
                  as="button"
                  type="button"
                  role="tab"
                  active={tab === key}
                  aria-selected={tab === key}
                  title={hint}
                  onClick={() => setTab(key)}
                >
                  {label}
                </CNavLink>
              </CNavItem>
            ))}
          </CNav>
        )}
        {tab === 'status' && hasStatus && (
          <>
            <div ref={setRow} className="d-flex gap-4 flex-wrap">
              {picture && (
                <div className="unit-picture" style={pictureStyle} title="The unit now">
                  {picture}
                </div>
              )}
              <div ref={setRight} style={{ flex: '1 1 420px', minWidth: 0 }}>
                <ChartSize.Provider value={CHART_H}>{children}</ChartSize.Provider>
              </div>
            </div>
            {footer}
          </>
        )}
        {tab !== 'status' && error && <div className="text-danger small">{error}</div>}
        {tab !== 'status' && !info && !error && <CSpinner size="sm" />}
        {tab === 'model' && info && <NodeModel info={info} picture={picture} />}
        {tab === 'photo' && info?.photo && (
          <img
            src={api.apiUrl(info.photo)}
            alt={`${info.node.name} - photo`}
            style={{
              maxWidth: '100%',
              maxHeight: '60vh',
              display: 'block',
              margin: '0 auto',
              borderRadius: 8,
            }}
          />
        )}
        {tab === 'map' && info?.position && (
          <TileMap
            latitude={info.position.latitude}
            longitude={info.position.longitude}
            label={info.node.name}
          />
        )}
      </CModalBody>
    </CModal>
  )
}

export default UnitPopup
