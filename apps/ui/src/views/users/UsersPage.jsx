import React, { useEffect, useState } from 'react'
import { CAlert, CCard, CCardBody, CSpinner } from '@coreui/react'
import { api } from '../../api/client'
import SubTabs from '../../components/SubTabs'
import { usePersistedState } from '../../hooks/usePersistedState'
import GuestTab from './GuestTab'
import RolesTab from './RolesTab'
import UsersList from './UsersList'

/**
 * Users (B1.2; roles without groups since 2026-10-27): the people, the roles (what a person acts as -
 * a table object x level, its members), the guest - one page, three tabs. The roles and the people are
 * loaded here once for all.
 */
const TABS = [
  { key: 'users', label: 'Users' },
  { key: 'roles', label: 'Roles' },
  { key: 'guest', label: 'Guest' },
]

const UsersPage = () => {
  const [state, setState] = usePersistedState('nexusedge.usersTabs', { tab: 'users' })
  const [roles, setRoles] = useState(null)
  const [users, setUsers] = useState([])
  const [error, setError] = useState(null)
  const load = () =>
    Promise.all([api.listRoles(), api.listUsers()])
      .then(([r, u]) => {
        setRoles(r.roles)
        setUsers(u)
      })
      .catch((err) => setError(err.message))
  useEffect(() => {
    load()
  }, [])
  const tab = TABS.some((t) => t.key === state.tab) ? state.tab : 'users'
  if (!roles) return error ? <CAlert color="danger">{error}</CAlert> : <CSpinner size="sm" />
  return (
    <>
      <div className="mb-3">
        <SubTabs tabs={TABS} tab={tab} onChange={(t) => setState({ tab: t })} />
      </div>
      {tab === 'users' && <UsersList roles={roles} onChanged={load} />}
      {tab !== 'users' && (
        <CCard className="mb-4">
          <CCardBody>
            {tab === 'roles' && <RolesTab roles={roles} users={users} onChanged={load} />}
            {tab === 'guest' && <GuestTab roles={roles} users={users} onChanged={load} />}
          </CCardBody>
        </CCard>
      )}
    </>
  )
}

export default UsersPage
