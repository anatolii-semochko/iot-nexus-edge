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

// The energy field's engineer settings (Processes -> its Settings; processes.config - iot
// AGENTS_TO_DO.md 2026-10-25, S1): the plant, not the operation - the groups (one level, each of
// the generation - PV blocks and turbines - or of the batteries) and which unit is in which, the
// batteries' hard limits, the thresholds of the flows' critical states (red). The operation (the
// mode, the reserve, selling) stays on the Energy scene. Staged; the modal's Save sends the
// changed sections (registered with '*').

const BLOCKS = [
  ['generation', 'Generation', 'PV blocks and wind turbines'],
  ['batteries', 'Batteries', 'Battery units'],
]
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

const EnergyFieldSettingsSection = ({ process, extraConfigRef }) => {
  const c = process.config ?? {}
  const [groups, setGroups] = useState(
    (c.groups ?? []).map((g) => ({ ...g, block: g.block ?? 'generation' })),
  )
  const [units, setUnits] = useState({
    pvBlocks: c.pvBlocks ?? [],
    turbines: c.turbines ?? [],
    batteries: c.batteries ?? [],
  })
  const [strategy, setStrategy] = useState(c.strategy ?? {})
  const [alerts, setAlerts] = useState(c.alerts ?? {})
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
    // its units stay, ungrouped
    for (const list of ['pvBlocks', 'turbines', 'batteries'])
      if (units[list].some((x) => x.group === g.key))
        saveUnits(
          list,
          units[list].map((x) => (x.group === g.key ? { ...x, group: undefined } : x)),
        )
  }
  const editStrategy = (key, value) => {
    const next = { ...strategy, [key]: value }
    if (value === undefined) delete next[key]
    setStrategy(next)
    stage('strategy', next)
  }
  const editAlerts = (key, value) => {
    const next = { ...alerts, [key]: value }
    if (value === undefined) delete next[key]
    setAlerts(next)
    stage('alerts', next)
  }
  const rows = [
    ...units.pvBlocks.map((x, i) => ['pvBlocks', 'PV block', 'generation', x, i]),
    ...units.turbines.map((x, i) => ['turbines', 'Wind turbine', 'generation', x, i]),
    ...units.batteries.map((x, i) => ['batteries', 'Battery', 'batteries', x, i]),
  ]

  return (
    <>
      <h6>Groups</h6>
      <p className="small text-body-secondary mb-2">
        One level. A generation group holds PV blocks and turbines, a battery group - battery units.
        The scene shows the units by their groups; the ungrouped ones - in &quot;Other&quot; (no
        groups at all - all together).
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
          <CFormSelect
            size="sm"
            style={{ width: 'auto' }}
            aria-label={`${g.name} - block`}
            value={g.block}
            onChange={(e) => {
              const block = e.target.value
              saveGroups(groups.map((x, j) => (j === i ? { ...x, block } : x)))
              // the units of the other block leave it
              for (const list of block === 'batteries' ? ['pvBlocks', 'turbines'] : ['batteries'])
                if (units[list].some((x) => x.group === g.key))
                  saveUnits(
                    list,
                    units[list].map((x) => (x.group === g.key ? { ...x, group: undefined } : x)),
                  )
            }}
          >
            {BLOCKS.map(([k, l, hint]) => (
              <option key={k} value={k} title={hint}>
                {l}
              </option>
            ))}
          </CFormSelect>
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
      <div className="d-flex gap-2 mb-3">
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
                  name: `New ${label.toLowerCase()} group`,
                  block,
                },
              ])
            }
          >
            Add a {label.toLowerCase()} group
          </CButton>
        ))}
      </div>
      <CTable small responsive className="mb-4">
        <CTableHead>
          <CTableRow>
            <CTableHeaderCell>Unit</CTableHeaderCell>
            <CTableHeaderCell>Kind</CTableHeaderCell>
            <CTableHeaderCell style={{ width: '40%' }}>Group</CTableHeaderCell>
          </CTableRow>
        </CTableHead>
        <CTableBody>
          {rows.map(([list, kind, block, x, i]) => (
            <CTableRow key={`${list}${x.nodeId}`}>
              <CTableDataCell>{x.name}</CTableDataCell>
              <CTableDataCell className="text-body-secondary">{kind}</CTableDataCell>
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
          ))}
        </CTableBody>
      </CTable>

      <h6>The batteries&apos; limits</h6>
      <p className="small text-body-secondary mb-2">
        The plant&apos;s hard band - never left by any mode or plan. The outage reserve and selling
        are the operator&apos;s - on the Energy scene (kept by the Energy Ledger).
      </p>
      <CRow className="g-3 mb-4">
        <CCol sm={4}>
          <CFormLabel>Lowest charge, %</CFormLabel>
          <CFormInput
            type="number"
            min={0}
            max={50}
            value={strategy.socMinPct ?? ''}
            placeholder="10"
            onChange={(e) => editStrategy('socMinPct', numberOr(e.target.value))}
          />
        </CCol>
        <CCol sm={4}>
          <CFormLabel>Highest charge, %</CFormLabel>
          <CFormInput
            type="number"
            min={50}
            max={100}
            value={strategy.socMaxPct ?? ''}
            placeholder="95"
            onChange={(e) => editStrategy('socMaxPct', numberOr(e.target.value))}
          />
        </CCol>
      </CRow>

      <h6>Critical states (red on the scene)</h6>
      <p className="small text-body-secondary mb-2">
        The import or the consumption over the plan&apos;s by both the share and the kW below; a
        unit over its model&apos;s rating by the share. The import at the connection&apos;s limit is
        always critical.
      </p>
      <CRow className="g-3">
        <CCol sm={4}>
          <CFormLabel>Over the plan, %</CFormLabel>
          <CFormInput
            type="number"
            min={0}
            value={alerts.overPlanPct ?? ''}
            placeholder="30"
            onChange={(e) => editAlerts('overPlanPct', numberOr(e.target.value))}
          />
        </CCol>
        <CCol sm={4}>
          <CFormLabel>Over the plan, kW</CFormLabel>
          <CFormInput
            type="number"
            min={0}
            value={alerts.overPlanMinKw ?? ''}
            placeholder="20"
            onChange={(e) => editAlerts('overPlanMinKw', numberOr(e.target.value))}
          />
        </CCol>
        <CCol sm={4}>
          <CFormLabel>Over a rating, %</CFormLabel>
          <CFormInput
            type="number"
            min={0}
            value={alerts.overRatedPct ?? ''}
            placeholder="2"
            onChange={(e) => editAlerts('overRatedPct', numberOr(e.target.value))}
          />
        </CCol>
      </CRow>
    </>
  )
}

export default EnergyFieldSettingsSection
