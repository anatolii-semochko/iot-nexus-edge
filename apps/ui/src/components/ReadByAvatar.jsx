import React from 'react'
import { CAvatar } from '@coreui/react'

import { ICON_BUTTON_WIDTH } from './IconButton'
import { formatSmartDateTime, userInitials, userTitle } from '../utils/format'

// Who marked a WEM message as read, and when (tooltip) - shown in place of
// the message's "X" (mark as read) button once it is read. As wide as that
// button with the avatar centered in it, so the avatars of read rows line
// up with the buttons of unread ones. `user` - the list's
// `hidden_by_user` ({ username, display_name, avatar_path }); `at` - its
// `hidden_at`.
const ReadByAvatar = ({ user, at }) => (
  <span
    className="d-inline-flex justify-content-center align-middle"
    style={{ width: ICON_BUTTON_WIDTH }}
    title={userTitle(user, `read ${formatSmartDateTime(at)}`)}
  >
    {user.avatar_path ? (
      <CAvatar src={`/api/uploads/avatars/${user.avatar_path}`} size="sm" />
    ) : (
      <CAvatar color="secondary" textColor="white" size="sm">
        {userInitials(user)}
      </CAvatar>
    )}
  </span>
)

export default ReadByAvatar
