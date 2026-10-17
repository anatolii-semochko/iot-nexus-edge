import React from 'react'
import { Link } from 'react-router-dom'

/**
 * A WEM message's link (log_messages.link, migration 072) - the in-app
 * page it points to (a scheduled AI run's problem -> its report in the AI
 * Assistant). Nothing when the message has none. `onClick` - e.g. a modal
 * closing itself on the way.
 */
const MessageLink = ({ link, onClick }) =>
  link ? (
    <>
      {' '}
      <Link
        to={link}
        onClick={(e) => {
          e.stopPropagation()
          onClick?.()
        }}
        className="small"
      >
        Open
      </Link>
    </>
  ) : null

export default MessageLink
