import React, { useState } from 'react'
import {
  CButton,
  CCol,
  CFormInput,
  CFormLabel,
  CFormSelect,
  CRow,
  CTable,
  CTableBody,
  CTableDataCell,
  CTableHead,
  CTableHeaderCell,
  CTableRow,
} from '@coreui/react'

// The heating's engineer settings (Processes -> its Settings; processes.config - iot AGENTS_TO_DO.md
// 2026-10-25, S2): the plant, not the operation - the groups of each block (heat pumps, tanks, fan
// coils; one level) and which unit is in which, the auto mode's outdoor thresholds, the tanks' bands
// (start / stop, heating and cooling) and their room's temperature. The operation (the mode, the room
// setpoints, a unit on / off) stays on the scene. Staged; the modal's Save sends the changed sections
// (registered with '*').

const BLOCKS = [
  ['pumps', 'Heat pumps', 'heatPumps'],
  ['tanks', 'Tanks', 'tanks'],
  ['consumers', 'Fan coils', 'consumers'],
]
const DEFAULTS = {
  heatBelowC: 15,
  coolAboveC: 24,
  tankRoomC: 15,
  tank: { heating: { startC: 42, stopC: 50 }, cooling: { startC: 14, stopC: 9 } },
}
const numberOr = (text) => (text.trim() === '' ? undefined : Number(text))
const keyOf = (name, taken) => {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 24) || 'group'
  let key = base
  for (let i = 2; taken.includes(key); i++) key = `${base}-${i}`
  return key
}

const HeatingSettingsSection = ({ process, extraConfigRef }) => {
  const c = process.config ?? {}
  const [groups, setGroups] = useState(c.groups ?? [])
  const [units, setUnits] = useState({
    heatPumps: c.heatPumps ?? [],
    tanks: c.tanks ?? [],
    consumers: c.consumers ?? [],
  })
  const [control, setControl] = useState(c.control ?? {})
  const stage = (section, value) => {
    extraConfigRef.current = { ...(extraConfigRef.current ?? {}), [section]: value }
  }
  const saveGroups = (next) => {
    setGroups(next)
    stage('groups', next)
  }
  const saveUnits = (list, next) => {
    setUnits((u) => ({ ...u, [list]: next }))
    stage(list, next)
  }
  const removeGroup = (g) => {
    saveGroups(groups.filter((x) => x.key !== g.key))
    const list = BLOCKS.find(([b]) => b === g.block)[2]
    if (units[list].some((x) => x.group === g.key))
      saveUnits(
        list,
        units[list].map((x) => (x.group === g.key ? { ...x, group: undefined } : x)),
      )
  }
  const saveControl = (next) => {
    setControl(next)
    stage('control', next)
  }
  const editControl = (key, value) => {
    const next = { ...control, [key]: value }
    if (value === undefined) delete next[key]
    saveControl(next)
  }
  const band = (mode) => control.tank?.[mode] ?? DEFAULTS.tank[mode]
  const editBand = (mode, key, value) => {
    if (value === undefined) return
    saveControl({
      ...control,
      tank: { ...(control.tank ?? {}), [mode]: { ...band(mode), [key]: value } },
    })
  }

  return (
    <>
      <h6>Groups</h6>
      <p className="small text-body-secondary mb-2">
        One level, each in one block. The scene shows each block by its groups; the ungrouped units
        - in &quot;Other&quot; (no groups at all - all together).
      </p>
      {groups.map((g, i) => (
        <div key={g.key} className="d-flex gap-2 mb-2 align-items-center">
          <CFormInput
            size="sm"
            aria-label="Group name"
            value={g.name}
            maxLength={60}
            onChange={(e) =>
              saveGroups(groups.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))
            }
          />
          <span className="small text-body-secondary text-nowrap">
            {BLOCKS.find(([b]) => b === g.block)?.[1]}
          </span>
          <CButton
            size="sm"
            color="danger"
            variant="outline"
            title="Remove this group - its units stay, ungrouped"
            onClick={() => removeGroup(g)}
          >
            Delete
          </CButton>
        </div>
      ))}
      <div className="d-flex gap-2 mb-3 flex-wrap">
        {BLOCKS.map(([block, label]) => (
          <CButton
            key={block}
            size="sm"
            color="secondary"
            variant="outline"
            onClick={() =>
              saveGroups([
                ...groups,
                {
                  key: keyOf(
                    `${block} group`,
                    groups.map((g) => g.key),
                  ),
                  name: `New group - ${label.toLowerCase()}`,
                  block,
                },
              ])
            }
          >
            Add a group of {label.toLowerCase()}
          </CButton>
        ))}
      </div>
      <CTable small responsive className="mb-4">
        <CTableHead>
          <CTableRow>
            <CTableHeaderCell>Unit</CTableHeaderCell>
            <CTableHeaderCell>Block</CTableHeaderCell>
            <CTableHeaderCell style={{ width: '40%' }}>Group</CTableHeaderCell>
          </CTableRow>
        </CTableHead>
        <CTableBody>
          {BLOCKS.flatMap(([block, label, list]) =>
            units[list].map((x, i) => (
              <CTableRow key={`${list}${x.nodeId}`}>
                <CTableDataCell>{x.name}</CTableDataCell>
                <CTableDataCell className="text-body-secondary">{label}</CTableDataCell>
                <CTableDataCell>
                  <CFormSelect
                    size="sm"
                    aria-label={`${x.name} - group`}
                    value={x.group ?? ''}
                    onChange={(e) =>
                      saveUnits(
                        list,
                        units[list].map((y, j) =>
                          j === i ? { ...y, group: e.target.value || undefined } : y,
                        ),
                      )
                    }
                  >
                    <option value="">No group (Other)</option>
                    {groups
                      .filter((g) => g.block === block)
                      .map((g) => (
                        <option key={g.key} value={g.key}>
                          {g.name}
                        </option>
                      ))}
                  </CFormSelect>
                </CTableDataCell>
              </CTableRow>
            )),
          )}
        </CTableBody>
      </CTable>

      <h6>The auto mode</h6>
      <p className="small text-body-secondary mb-2">
        Heating below the first outdoor temperature, cooling above the second; between them it keeps
        what it was doing.
      </p>
      <CRow className="g-3 mb-4">
        <CCol sm={4}>
          <CFormLabel>Heat below, °C</CFormLabel>
          <CFormInput
            type="number"
            value={control.heatBelowC ?? ''}
            placeholder={String(DEFAULTS.heatBelowC)}
            onChange={(e) => editControl('heatBelowC', numberOr(e.target.value))}
          />
        </CCol>
        <CCol sm={4}>
          <CFormLabel>Cool above, °C</CFormLabel>
          <CFormInput
            type="number"
            value={control.coolAboveC ?? ''}
            placeholder={String(DEFAULTS.coolAboveC)}
            onChange={(e) => editControl('coolAboveC', numberOr(e.target.value))}
          />
        </CCol>
        <CCol sm={4}>
          <CFormLabel title="A room closed by a day note: its setpoint lower (heating) / higher (cooling) by this much">
            Closed room set back, K
          </CFormLabel>
          <CFormInput
            type="number"
            min={0}
            max={15}
            value={control.closedSetbackK ?? ''}
            placeholder="4"
            onChange={(e) => editControl('closedSetbackK', numberOr(e.target.value))}
          />
        </CCol>
      </CRow>

      <h6>The tanks</h6>
      <p className="small text-body-secondary mb-2">
        The tanks&apos; average temperature: charging starts at the first and stops at the second
        (heating - start below, stop above; cooling - start above, stop below). The Energy
        Ledger&apos;s signal moves them when the energy is cheap or dear.
      </p>
      <CRow className="g-3">
        {[
          ['heating', 'Heating'],
          ['cooling', 'Cooling'],
        ].map(([mode, label]) => (
          <React.Fragment key={mode}>
            <CCol sm={3}>
              <CFormLabel>{label} - start, °C</CFormLabel>
              <CFormInput
                type="number"
                value={band(mode).startC}
                onChange={(e) => editBand(mode, 'startC', numberOr(e.target.value))}
              />
            </CCol>
            <CCol sm={3}>
              <CFormLabel>{label} - stop, °C</CFormLabel>
              <CFormInput
                type="number"
                value={band(mode).stopC}
                onChange={(e) => editBand(mode, 'stopC', numberOr(e.target.value))}
              />
            </CCol>
          </React.Fragment>
        ))}
        <CCol sm={4}>
          <CFormLabel title="The tanks' standing loss goes to it">
            The tanks&apos; room, °C
          </CFormLabel>
          <CFormInput
            type="number"
            value={control.tankRoomC ?? ''}
            placeholder={String(DEFAULTS.tankRoomC)}
            onChange={(e) => editControl('tankRoomC', numberOr(e.target.value))}
          />
        </CCol>
      </CRow>
    </>
  )
}

export default HeatingSettingsSection
