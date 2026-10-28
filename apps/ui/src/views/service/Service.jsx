import React, { useEffect, useState } from 'react'
import { useSelector } from 'react-redux'
import { canAny, useCan } from '../../access'
import {
  CAlert,
  CBadge,
  CButton,
  CCard,
  CCardBody,
  CCardHeader,
  CModal,
  CModalBody,
  CModalFooter,
  CModalHeader,
  CModalTitle,
  CSpinner,
  CTab,
  CTabList,
  CTable,
  CTableBody,
  CTableDataCell,
  CTableRow,
  CTabs,
} from '@coreui/react'
import { api } from '../../api/client'
import { usePersistedState } from '../../hooks/usePersistedState'
import SubTabs, { SubTabIcon } from '../../components/SubTabs'
import AiConfigTab from './AiConfigTab'
import DashboardConfigTab from './DashboardConfigTab'
import DatabaseTab from './DatabaseTab'
import PageTitle from '../../components/PageTitle'

// Service page (AGENTS_TO_DO.md, 2026-08-30) - admin-only (server-side
// requireAdmin on every /service/* route, same pattern as UsersList.jsx's
// own /users routes - this page has no extra client-side guard beyond
// that, it trusts the 403). Tabs will grow (user's own "буде
// розширюватися"). Config - its sub-tabs: Dashboard (the Dashboard page's
// card tree, DashboardConfigTab, 2026-10-16); Database and Commands.
// `permissions` - any of them opens the tab (access.js)
const TABS = [
  { key: 'config', label: 'Config', permissions: ['dashboard.manage', 'ai.configure'] },
  {
    key: 'database',
    label: 'Database',
    permissions: [
      'service.view',
      'service.database.backup',
      'service.database.restore',
      'service.database.clear-logs',
    ],
  },
  { key: 'commands', label: 'Commands', permissions: ['service.view', 'service.system'] },
]

const PLACEHOLDER_TABS = new Set([])
// Config's sub-tabs
// The more often used first, the system ones last (2026-10-17).
const CONFIG_TABS = [
  {
    key: 'dashboard',
    label: 'Dashboard',
    permission: 'dashboard.manage',
    icon: (
      <SubTabIcon>
        <rect x="3.5" y="3.5" width="7.5" height="7.5" rx="1.5" />
        <rect x="13" y="3.5" width="7.5" height="7.5" rx="1.5" />
        <rect x="3.5" y="13" width="7.5" height="7.5" rx="1.5" />
        <rect x="13" y="13" width="7.5" height="7.5" rx="1.5" />
      </SubTabIcon>
    ),
  },
  {
    key: 'ai',
    label: 'AI',
    permission: 'ai.configure',
    // sparkles - a large four-pointed star and two small ones
    icon: (
      <SubTabIcon>
        <path d="M10 3.5l1.6 4.9 4.9 1.6-4.9 1.6L10 16.5l-1.6-4.9L3.5 10l4.9-1.6z" />
        <path d="M17.5 13.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" />
        <path d="M17.5 3.5l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6z" />
      </SubTabIcon>
    ),
  },
]

const ConfigTab = () => {
  const can = useCan()
  const tabs = CONFIG_TABS.filter((t) => can(t.permission))
  const [chosen, setTab] = useState(tabs[0]?.key)
  const tab = tabs.some((t) => t.key === chosen) ? chosen : tabs[0]?.key
  return (
    <div className="pt-3">
      <SubTabs tabs={tabs} tab={tab} onChange={setTab} />
      {tab === 'dashboard' && <DashboardConfigTab />}
      {tab === 'ai' && <AiConfigTab />}
    </div>
  )
}

// A real <table> (AGENTS_TO_DO.md, 2026-08-30 correction: the earlier
// row/col-3/col-8 grid pinned the button column to a fixed 25% of the
// container regardless of what the labels actually needed - "Shutdown"/
// "Restart" ended up disproportionately wide with dead space, not sized
// to their own content) - a table's own column-width behavior sizes the
// button column to its widest cell and every row shares that width, so
// buttons come out consistently sized without a hardcoded fraction. The
// "disabled" badge stays in the description cell (prefixing the text)
// rather than the button cell - keeping it there would make the button
// column's own auto-width fight between rows that have a badge and rows
// that don't.
// `allowed` - the person may run commands (service.system); else the list only (Service: View)
const CommandRow = ({ command, onRun, allowed }) => (
  <CTableRow>
    <CTableDataCell>
      <CButton
        className={'w-100'}
        color={command.enabled ? 'danger' : 'secondary'}
        variant="outline"
        disabled={!command.enabled || !allowed}
        onClick={() => onRun(command)}
      >
        {command.label}
      </CButton>
    </CTableDataCell>
    <CTableDataCell className="text-body-secondary small align-middle w-100">
      {!command.enabled && (
        <CBadge color="secondary" className="me-3">
          disabled
        </CBadge>
      )}
      {command.description}
    </CTableDataCell>
  </CTableRow>
)

const CommandsTab = () => {
  const canRun = useCan()('service.system')
  const [commands, setCommands] = useState(null)
  const [error, setError] = useState(null)
  const [pending, setPending] = useState(null)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState(null)

  const reload = () => {
    api
      .listSystemCommands()
      .then((res) => setCommands(res.commands))
      .catch((err) => setError(err.message))
  }

  useEffect(reload, [])

  const handleConfirm = async () => {
    setRunning(true)
    try {
      await api.runSystemCommand(pending.id)
      // A successful Shutdown/Restart call means the host is about to go
      // down (or is already rebooting) - there is no "after" state to
      // reload here, just tell the operator the call was accepted.
      setResult({ ok: true, label: pending.label })
    } catch (err) {
      setResult({ ok: false, label: pending.label, message: err.message })
    } finally {
      setRunning(false)
      setPending(null)
    }
  }

  if (error) return <CAlert color="danger">{error}</CAlert>
  if (!commands) return <CSpinner color="primary" />

  return (
    <div className="pt-2">
      {result && (
        <CAlert
          color={result.ok ? 'success' : 'danger'}
          dismissible
          onClose={() => setResult(null)}
        >
          {result.ok
            ? `${result.label} command sent.`
            : `${result.label} command failed: ${result.message}`}
        </CAlert>
      )}
      <CTable borderless>
        <CTableBody>
          {commands.map((command) => (
            <CommandRow key={command.id} command={command} onRun={setPending} allowed={canRun} />
          ))}
        </CTableBody>
      </CTable>

      <CModal visible={pending !== null} onClose={() => setPending(null)}>
        <CModalHeader>
          <CModalTitle>Confirm {pending?.label}</CModalTitle>
        </CModalHeader>
        <CModalBody>
          {pending?.description} This affects the host machine this stack runs on, not just this
          browser tab.
        </CModalBody>
        <CModalFooter>
          <CButton
            color="secondary"
            variant="outline"
            onClick={() => setPending(null)}
            disabled={running}
          >
            Cancel
          </CButton>
          <CButton color="danger" onClick={handleConfirm} disabled={running}>
            {running ? <CSpinner size="sm" /> : `Confirm ${pending?.label}`}
          </CButton>
        </CModalFooter>
      </CModal>
    </div>
  )
}

const PlaceholderTab = ({ label }) => (
  <div className="pt-2 text-body-secondary">{label} is not configured yet.</div>
)

// Registration for usePersistedState (AGENTS.md section 22) - remembers
// the last tab across visits; a saved key that no longer matches any TABS
// entry (a tab removed later) falls back to the first tab in the list
// rather than rendering nothing.
const PERSISTED_DEFAULTS = { activeTab: TABS[0].key }

const Service = () => {
  const [pageState, setPageState] = usePersistedState('nexusedge.servicePage', PERSISTED_DEFAULTS)
  const access = useSelector((state) => state.access)
  const tabs = TABS.filter((t) => canAny(access, t.permissions))
  const activeTab = tabs.some((t) => t.key === pageState.activeTab)
    ? pageState.activeTab
    : tabs[0]?.key
  const setActiveTab = (key) => setPageState({ activeTab: key })

  return (
    <CCard className="mb-4">
      <CCardHeader>
        <PageTitle title="Service" />
      </CCardHeader>
      <CCardBody>
        <CTabs activeItemKey={activeTab} onChange={setActiveTab}>
          <CTabList variant="tabs" className="mb-3">
            {tabs.map((tab) => (
              <CTab key={tab.key} itemKey={tab.key}>
                {tab.label}
              </CTab>
            ))}
          </CTabList>
        </CTabs>
        {PLACEHOLDER_TABS.has(activeTab) && (
          <PlaceholderTab label={TABS.find((t) => t.key === activeTab).label} />
        )}
        {activeTab === 'config' && <ConfigTab />}
        {activeTab === 'database' && <DatabaseTab />}
        {activeTab === 'commands' && <CommandsTab />}
      </CCardBody>
    </CCard>
  )
}

export default Service
