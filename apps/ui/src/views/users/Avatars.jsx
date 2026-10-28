import React from 'react'
import { CAvatar } from '@coreui/react'
import CIcon from '@coreui/icons-react'
import { cilCheck, cilX } from '@coreui/icons'
import { userInitials, userTitle } from '../../utils/format'

// The users' and roles' circles (2026-10-28 - the tables' Roles / Members columns grew too wide with
// many of them): a person - the avatar with its active flag; a role - its initials in its level's colour.

/** A person's avatar with the active / inactive flag (not an action), `title` - who it is. */
export const UserAvatar = ({ user }) => (
  <div className="position-relative d-inline-block" title={userTitle(user)}>
    {user.avatar_path ? (
      <CAvatar src={`/api/uploads/avatars/${user.avatar_path}`} size="md" />
    ) : (
      <CAvatar color="secondary" textColor="white" size="md">
        {userInitials(user)}
      </CAvatar>
    )}
    {/* the form's flag (UserForm.jsx), smaller - in proportion to the "md" avatar */}
    <CAvatar
      color={user.active ? 'success' : 'danger'}
      textColor="white"
      className="position-absolute p-0 d-flex align-items-center justify-content-center"
      style={{ width: '0.85rem', height: '0.85rem', top: '-0.15rem', right: '-0.15rem' }}
    >
      <CIcon icon={user.active ? cilCheck : cilX} height={8} width={8} />
    </CAvatar>
  </div>
)

const LEVEL_ORDER = ['view', 'control', 'config']

/**
 * A role's highest level (2026-10-28 - the Roles table's Rights): over its objects and sections, the
 * strongest last -
 *   none    - no rights;
 *   view    - sees;
 *   control - operates (ON / OFF, setpoints, commands);
 *   config  - an engineer's: the settings, the registry, the simulation;
 *   admin   - manages the users and the access (Users and access - Configure): can give anyone anything;
 *   full    - everything, built in (Administrator); service - the same, for the system's own accounts.
 */
export const roleLevel = (role) => {
  // the system's own accounts hold everything too - told apart
  if (role.service) return 'service'
  if (role.full) return 'full'
  if ((role.rights?.['section:users'] ?? []).includes('config')) return 'admin'
  const top = Math.max(
    -1,
    ...Object.values(role.rights ?? {}).flatMap((levels) =>
      levels.map((l) => LEVEL_ORDER.indexOf(l)),
    ),
  )
  return LEVEL_ORDER[top] ?? 'none'
}

// a level's look - "hotter" for more; the colours read in both themes (Everything - the text's colour)
const LEVEL_LOOKS = {
  full: {
    label: 'Full',
    hint: 'Everything',
    bg: 'var(--cui-emphasis-color)',
    fg: 'var(--cui-body-bg)',
  },
  service: {
    label: 'Service',
    hint: "Everything - the system's own account",
    bg: 'var(--cui-secondary)',
    fg: '#fff',
  },
  admin: {
    label: 'Administer',
    hint: 'Manages the users and the access',
    bg: 'var(--cui-primary)',
    fg: '#fff',
  },
  config: { label: 'Configure', hint: 'Up to Configure', bg: 'var(--cui-danger)', fg: '#fff' },
  control: { label: 'Control', hint: 'Up to Control', bg: 'var(--cui-warning)', fg: '#212631' },
  view: { label: 'View', hint: 'View only', bg: 'var(--cui-info)', fg: '#fff' },
  none: {
    label: 'None',
    hint: 'No rights',
    bg: 'var(--cui-secondary-bg)',
    fg: 'var(--cui-body-color)',
  },
}
export const levelLook = (level) => LEVEL_LOOKS[level] ?? LEVEL_LOOKS.none

/** A role's highest level as a badge (the Roles table's Rights). */
export const RoleLevelBadge = ({ role, title }) => {
  const look = levelLook(roleLevel(role))
  return (
    <span
      className="badge"
      style={{ background: look.bg, color: look.fg }}
      title={title ? `${look.hint}\n${title}` : look.hint}
    >
      {look.label}
    </span>
  )
}

// "Guest - Energy operator" -> "EO", "Guest - Administrator (view)" -> "A": the guest's package is told by
// the outline, not by a "G"; a note in brackets left out
const roleInitials = (name) =>
  name
    .replace(/^guest\s*-\s*/i, '')
    .replace(/\([^)]*\)/g, ' ')
    .split(/[\s-]+/)
    .map((w) => w.match(/[\p{L}\p{N}]/u)?.[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()

const RANK = ['full', 'admin', 'config', 'control', 'view', 'service', 'none']

/** Roles in their strength's order - the strongest first (a person's row shows it before the "+N"). */
export const byStrength = (roles) =>
  [...roles].sort((a, b) => {
    const r = (x) => {
      const i = RANK.indexOf(roleLevel(x))
      return i < 0 ? RANK.length : i
    }
    return r(a) - r(b) || a.name.localeCompare(b.name)
  })

/** A role's circle: its initials, its highest level's colour; a guest's role - outlined. */
export const RoleAvatar = ({ role }) => {
  const look = levelLook(roleLevel(role))
  const guest = Boolean(role.linkKey) || /^guest\b/i.test(role.name)
  return (
    <CAvatar
      size="md"
      title={`${role.name} - ${look.hint}${guest ? ' (a guest role)' : ''}`}
      style={{
        fontSize: '0.75rem',
        fontWeight: 600,
        ...(guest
          ? {
              border: `2px solid ${look.bg}`,
              color: look.bg === LEVEL_LOOKS.none.bg ? look.fg : look.bg,
            }
          : { background: look.bg, color: look.fg }),
      }}
    >
      {roleInitials(role.name) || '?'}
    </CAvatar>
  )
}

/** A row of circles, at most `max` shown and the rest as "+N" (their names in its title). */
export const AvatarRow = ({ items, render, titleOf, max = 6 }) => {
  if (!items.length) return <span className="text-body-secondary">-</span>
  const shown = items.slice(0, items.length > max ? max - 1 : max)
  const rest = items.slice(shown.length)
  return (
    <div className="d-flex align-items-center flex-wrap gap-2">
      {shown.map((item, i) => (
        <React.Fragment key={i}>{render(item)}</React.Fragment>
      ))}
      {rest.length > 0 && (
        <CAvatar
          size="md"
          className="border bg-body-secondary text-body"
          title={rest.map(titleOf).join('\n')}
          style={{ fontSize: '0.75rem' }}
        >
          +{rest.length}
        </CAvatar>
      )}
    </div>
  )
}
