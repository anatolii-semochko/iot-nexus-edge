import React, { useEffect, useState } from 'react'
import {
  CAlert,
  CBadge,
  CButton,
  CCard,
  CCardBody,
  CCardHeader,
  CSpinner,
  CTable,
  CTableBody,
  CTableDataCell,
  CTableHead,
  CTableHeaderCell,
  CTableRow,
} from '@coreui/react'
import { api } from '../../api/client'
import TablePagination from '../../components/table/TablePagination'
import ExpandToggleButton from '../../components/table/ExpandToggleButton'
import {
  NARROW_ONLY,
  NarrowFieldsRow,
  WIDE_ONLY,
  WIDE_ONLY_INLINE,
  cx,
} from '../../components/table/narrow'
import TableSearchInput from '../../components/table/TableSearchInput'
import { usePagination } from '../../hooks/usePagination'
import { usePersistedState } from '../../hooks/usePersistedState'
import UserForm from './UserForm'
import { AiTokensMark } from './AiTokens'
import { AvatarRow, byStrength, RoleAvatar, UserAvatar } from './Avatars'
import PageTitle from '../../components/PageTitle'
import { useCan } from '../../access'
import { t } from 'src/i18n'

// Registration for usePersistedState (AGENTS_TO_DO.md, 2026-08-01) - flat
// variant, same shape as NodesList.jsx/DevicesList.jsx.
const PERSISTED_DEFAULTS = {
  search: '',
  pageSize: 10,
}

// by the name and the roles' names (the roles are circles now - their names in the titles)
const matchesSearch = (user, search, roles) => {
  if (!search) return true
  const needle = search.toLowerCase()
  const roleNames = (user.roleKeys ?? []).map((k) => roles.find((r) => r.key === k)?.name ?? k)
  return [user.username, user.display_name, ...roleNames].some((field) =>
    field?.toLowerCase().includes(needle),
  )
}

// Delete is destructive and rare - arm it with one click, then require a
// second click within a few seconds to actually confirm, rather than a
// separate confirm modal for a single button.
const DeleteButton = ({ user, onDeleted, onError }) => {
  const [armed, setArmed] = useState(false)
  const [busy, setBusy] = useState(false)

  if (!user.deletable) {
    return (
      <CButton size="sm" color="secondary" variant="outline" disabled>
        {t('Delete')}
      </CButton>
    )
  }

  const handleClick = async () => {
    if (!armed) {
      setArmed(true)
      setTimeout(() => setArmed(false), 3000)
      return
    }
    setBusy(true)
    try {
      await api.deleteUser(user.id)
      onDeleted()
    } catch (err) {
      onError(err.message)
    } finally {
      setBusy(false)
      setArmed(false)
    }
  }

  return (
    <CButton
      size="sm"
      color={armed ? 'danger' : 'secondary'}
      variant={armed ? undefined : 'outline'}
      disabled={busy}
      onClick={handleClick}
    >
      {busy ? <CSpinner size="sm" /> : armed ? t('Confirm delete?') : t('Delete')}
    </CButton>
  )
}

const UsersList = ({ roles, onChanged }) => {
  // seeing the users (users.view) - no changes without users.manage
  const manage = useCan()('users.manage')
  const [users, setUsers] = useState(null)
  const [error, setError] = useState(null)
  // the rows opened on a phone (their hidden columns and actions - components/table/narrow.jsx)
  const [open, setOpen] = useState([])
  const [pageState, setPageState] = usePersistedState('nexusedge.usersPage', PERSISTED_DEFAULTS)
  const { search } = pageState
  const setSearch = (value) => setPageState({ search: value })
  const [editingUser, setEditingUser] = useState(null)
  const [creating, setCreating] = useState(false)

  const reload = () => {
    api
      .listUsers()
      .then((all) => {
        setUsers(all)
        setError(null)
      })
      .catch((err) => setError(err.message))
  }

  useEffect(reload, [])

  const filtered = (users ?? []).filter((user) => matchesSearch(user, search, roles ?? []))
  const { page, pageSize, pageItems, totalItems, setPage, setPageSize } = usePagination(filtered, {
    pageSize: pageState.pageSize,
    onPageSizeChange: (size) => setPageState({ pageSize: size }),
  })

  const handleToggleActive = async (user) => {
    try {
      await api.updateUser(user.id, { active: !user.active })
      reload()
    } catch (err) {
      setError(err.message)
    }
  }

  const handleFormSaved = () => {
    setEditingUser(null)
    setCreating(false)
    reload()
    // the roles' members changed too
    onChanged?.()
  }

  return (
    <CCard className="mb-4">
      <CCardHeader className="d-flex justify-content-between align-items-center">
        <PageTitle title={t('Users')} />
        {manage && (
          <CButton size="sm" color="primary" onClick={() => setCreating(true)}>
            {t('Add user')}
          </CButton>
        )}
      </CCardHeader>
      <CCardBody>
        {error && <CAlert color="danger">{error}</CAlert>}
        {!error && !users && <CSpinner color="primary" />}
        {!error && users && (
          <>
            <div className="mb-3">
              <TableSearchInput
                value={search}
                onSearch={setSearch}
                placeholder={t('Search by username, name, role...')}
              />
            </div>
            {filtered.length === 0 ? (
              <CAlert color="info">
                {users.length === 0 ? t('No users yet.') : t('No users match this search.')}
              </CAlert>
            ) : (
              <>
                <CTable hover responsive>
                  <CTableHead>
                    <CTableRow>
                      <CTableHeaderCell scope="col" />
                      <CTableHeaderCell scope="col">{t('Username')}</CTableHeaderCell>
                      <CTableHeaderCell scope="col" className={WIDE_ONLY}>
                        {t('Display name')}
                      </CTableHeaderCell>
                      <CTableHeaderCell scope="col">{t('Roles')}</CTableHeaderCell>
                      <CTableHeaderCell
                        scope="col"
                        className={WIDE_ONLY}
                        title={t("The AI's tokens a day")}
                      >
                        AI
                      </CTableHeaderCell>
                      <CTableHeaderCell scope="col" className={WIDE_ONLY}>
                        {t('Status')}
                      </CTableHeaderCell>
                      <CTableHeaderCell scope="col" className="text-end">
                        <span className={WIDE_ONLY_INLINE}>{t('Actions')}</span>
                      </CTableHeaderCell>
                    </CTableRow>
                  </CTableHead>
                  <CTableBody>
                    {pageItems.map((user) => {
                      const expanded = open.includes(user.id)
                      const ai = <AiTokensMark value={user.ai_daily_tokens} />
                      const status = (
                        <CBadge color={user.active ? 'success' : 'secondary'} className="mb-1">
                          {user.active ? t('Active') : t('Inactive')}
                        </CBadge>
                      )
                      const actions = manage && (
                        <>
                          <CButton
                            size="sm"
                            color="secondary"
                            variant="outline"
                            className="me-1"
                            onClick={() => setEditingUser(user)}
                          >
                            {t('Edit')}
                          </CButton>
                          <CButton
                            size="sm"
                            color="secondary"
                            variant="outline"
                            className="me-1"
                            disabled={user.active && !user.deactivatable}
                            onClick={() => handleToggleActive(user)}
                          >
                            {user.active ? t('Deactivate') : t('Activate')}
                          </CButton>
                          <DeleteButton user={user} onDeleted={reload} onError={setError} />
                        </>
                      )
                      return (
                        <React.Fragment key={user.id}>
                          <CTableRow>
                            <CTableDataCell>
                              <UserAvatar user={user} />
                            </CTableDataCell>
                            <CTableDataCell>
                              {user.username}
                              {/* a phone: the name under the login - no column of its own */}
                              {user.display_name && (
                                <div className={cx(NARROW_ONLY, 'small text-body-secondary')}>
                                  {user.display_name}
                                </div>
                              )}
                            </CTableDataCell>
                            <CTableDataCell className={WIDE_ONLY}>
                              {user.display_name ?? '-'}
                            </CTableDataCell>
                            <CTableDataCell>
                              <AvatarRow
                                items={byStrength(
                                  (user.roleKeys ?? []).map(
                                    (k) => roles.find((r) => r.key === k) ?? { key: k, name: k },
                                  ),
                                )}
                                render={(r) => <RoleAvatar role={r} />}
                                titleOf={(r) => r.name}
                                max={4}
                              />
                            </CTableDataCell>
                            <CTableDataCell className={WIDE_ONLY}>{ai}</CTableDataCell>
                            <CTableDataCell className={WIDE_ONLY}>{status}</CTableDataCell>
                            <CTableDataCell className="text-end text-nowrap">
                              <span className={WIDE_ONLY_INLINE}>{actions}</span>
                              <ExpandToggleButton
                                className={NARROW_ONLY}
                                expanded={expanded}
                                onClick={() =>
                                  setOpen(
                                    expanded
                                      ? open.filter((id) => id !== user.id)
                                      : [...open, user.id],
                                  )
                                }
                              />
                            </CTableDataCell>
                          </CTableRow>
                          {expanded && (
                            <NarrowFieldsRow
                              fields={[
                                { label: 'AI', value: ai },
                                { label: t('Status'), value: status },
                                { label: t('Actions'), value: actions || null },
                              ]}
                            />
                          )}
                        </React.Fragment>
                      )
                    })}
                  </CTableBody>
                </CTable>
                <TablePagination
                  page={page}
                  pageSize={pageSize}
                  totalItems={totalItems}
                  onPageChange={setPage}
                  onPageSizeChange={setPageSize}
                />
              </>
            )}
          </>
        )}
        {(editingUser || creating) && (
          <UserForm
            user={editingUser}
            roles={roles}
            onClose={() => {
              setEditingUser(null)
              setCreating(false)
            }}
            onSaved={handleFormSaved}
          />
        )}
      </CCardBody>
    </CCard>
  )
}

export default UsersList
