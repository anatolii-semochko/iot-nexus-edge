import React, { useEffect, useLayoutEffect, useState } from 'react'
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
import { ChartSize, ChartSpace } from '../charts/SeriesChart'
import { t } from 'src/i18n'

// A unit's popup (AGENTS_TO_DO.md 2026-10-22, C - images/device-popup.png):
// tabs "Status" (the scene's live picture on the left - a narrow column, its
// readings and charts on its right; `footer` - the controls), "Model" (the node type's
// Library model - its real picture, the data), "Photo" (the real unit -
// when the node has one), "Map" (where it stands - when placed). No
// `children` - the node's information only (Model first). One tab - no
// switcher. `picture` - a root <svg> (its viewBox keeps the proportions).
// `processId` - the process the unit is shown in (the AI button's subject). `className` - on the modal: a scene's class whose colour variables its
// picture uses (the modal renders outside the scene). Big - for the charts (the user, 2026-10-29): the
// dialog as wide as the window lets it (`.chart-popup`, style.scss - the aquarium's history popup's
// width). `charts` (the user, 2026-10-30): under the readings, right of the picture, each drawn at its
// real width and together as tall as the window lets them - the dialog fits the window, its charts fill
// what the rest leaves (ChartSpace); narrow - one column, the charts CHART_H tall, the dialog scrolls.

// the tabs of the node's own information
const NODE_TABS = ['model', 'photo', 'map']
const STACK_BELOW_PX = 700 // narrower - the picture above the readings
const STACKED_PICTURE_PX = 220
// the charts' height when they don't fill the window (narrow, no room), px
const CHART_H = 220
// the picture's column beside the readings - this share of the row (the user, 2026-10-30: 2.5 times
// smaller than the 30 % before), its width not its height (the charts' height never moves it)
const PICTURE_SHARE = '12%'
const PICTURE_CSS = `
.unit-picture { display: flex; align-items: center; justify-content: center; flex: 0 0 auto; min-width: 0; max-width: 100%; }
/* a picture with its own overlays (heating's FanIcon - an inline-block box of layers, not a root <svg>,
   2026-11-09): within the frame, never wider than it */
.unit-picture > [role='img'] { max-width: 100%; max-height: 100%; }
.unit-picture > svg { height: 100%; width: auto; max-width: 100%; }
.unit-picture.side { align-self: flex-start; }
.unit-picture.side > svg { width: 100%; height: auto; }
`

// The room from an element's top to the dialog body's bottom, `reserve` (an element under it, e.g. the
// footer) taken off - what a tab's main content fills. The popup rule (iot memory popup-size-rules, the
// user 2026-11-08): the dialog is the window's size whatever the tab (`.chart-popup`, style.scss); its
// room goes to the charts (Status), then the photo (Model, Photo), then the map (Map).
export const useRoomBelow = (el, reserve = null) => {
  const [room, setRoom] = useState(null)
  useLayoutEffect(() => {
    if (!el) return undefined
    const body = el.closest('.modal-body')
    if (!body) return undefined
    const measure = () => {
      const b = body.getBoundingClientRect()
      const pad = parseFloat(getComputedStyle(body).paddingBottom) || 0
      const under = reserve ? reserve.getBoundingClientRect().height + 8 : 0
      setRoom(Math.max(0, Math.floor(b.bottom - pad - el.getBoundingClientRect().top - under - 2)))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(body)
    if (el.parentElement) ro.observe(el.parentElement)
    if (reserve) ro.observe(reserve)
    window.addEventListener('resize', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [el, reserve])
  return room
}

const UnitPopup = ({
  title,
  nodeId,
  processId = null,
  picture,
  children,
  charts,
  footer,
  className,
  // the caller's own tabs after Status (2026-11-09 - an overview's summed popups, no node):
  // [{ key, label, hint, content }]
  extraTabs = [],
  onClose,
}) => {
  const hasStatus = children != null
  const [info, setInfo] = useState(null)
  const [error, setError] = useState(null)
  const [tab, setTab] = useState(hasStatus ? 'status' : 'model')
  // the elements by callback refs - the modal mounts its body after the first effects
  const [row, setRow] = useState(null)
  const [rowPx, setRowPx] = useState(null)
  const [chartsBox, setChartsBox] = useState(null)

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

  // the row's width - stacked when narrow (reported before the frame's paint)
  useLayoutEffect(() => {
    if (!row) return undefined
    const ro = new ResizeObserver(([e]) => setRowPx(Math.round(e.contentRect.width)))
    ro.observe(row)
    return () => ro.disconnect()
  }, [row])

  // the room under each tab's main content - the charts, the photo, the map (useRoomBelow)
  const [footerBox, setFooterBox] = useState(null)
  const space = useRoomBelow(chartsBox, footerBox)
  const [photoBox, setPhotoBox] = useState(null)
  const photoRoom = useRoomBelow(photoBox)
  const [mapBox, setMapBox] = useState(null)
  const mapRoom = useRoomBelow(mapBox)

  const tabs = [
    ...(hasStatus ? [['status', t('Status'), t('The unit now - its readings and today')]] : []),
    ...extraTabs.map((x) => [x.key, x.label, x.hint]),
    ...(info ? [['model', t('Model'), t('The model and its main technical data')]] : []),
    ...(info?.photo ? [['photo', t('Photo'), t('A photo of the real unit')]] : []),
    ...(info?.position ? [['map', t('Map'), t('Where the unit stands')]] : []),
  ]
  const stacked = rowPx != null && rowPx < STACK_BELOW_PX
  const pictureStyle = stacked
    ? { height: STACKED_PICTURE_PX, flexBasis: '100%' }
    : { width: PICTURE_SHARE }

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
          {title ?? info?.node?.name ?? t('Unit')}
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
                <div
                  className={`unit-picture${stacked ? '' : ' side'}`}
                  style={pictureStyle}
                  title={t('The unit now')}
                >
                  {picture}
                </div>
              )}
              <div
                // its own content's height (not the row's) - the picture follows it, never the other way
                style={{ flex: '1 1 420px', minWidth: 0, alignSelf: 'flex-start' }}
              >
                <ChartSize.Provider value={CHART_H}>
                  {children}
                  {charts && (
                    // the room held from the first frame - the dialog opens at its height, the charts
                    // loading in it
                    <div
                      ref={setChartsBox}
                      style={!stacked && space ? { minHeight: space } : undefined}
                    >
                      <ChartSpace.Provider value={stacked ? null : space}>
                        {charts}
                      </ChartSpace.Provider>
                    </div>
                  )}
                </ChartSize.Provider>
              </div>
            </div>
            {footer && <div ref={setFooterBox}>{footer}</div>}
          </>
        )}
        {NODE_TABS.includes(tab) && error && <div className="text-danger small">{error}</div>}
        {NODE_TABS.includes(tab) && !info && !error && <CSpinner size="sm" />}
        {extraTabs.map((x) => tab === x.key && <div key={x.key}>{x.content}</div>)}
        {tab === 'model' && info && (
          <div ref={setPhotoBox}>
            <NodeModel info={info} picture={picture} imageHeight={photoRoom} />
          </div>
        )}
        {tab === 'photo' && info?.photo && (
          <img
            ref={setPhotoBox}
            src={api.apiUrl(info.photo)}
            alt={t('{{name}} - photo', { name: info.node.name })}
            style={{
              maxWidth: '100%',
              maxHeight: Math.max(240, photoRoom ?? 0) || '60vh',
              display: 'block',
              margin: '0 auto',
              borderRadius: 8,
            }}
          />
        )}
        {tab === 'map' && info?.position && (
          <div ref={setMapBox}>
            <TileMap
              latitude={info.position.latitude}
              longitude={info.position.longitude}
              label={info.node.name}
              height={Math.max(240, (mapRoom ?? 300) - 30)}
            />
          </div>
        )}
      </CModalBody>
    </CModal>
  )
}

export default UnitPopup
