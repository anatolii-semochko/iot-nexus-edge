import React from 'react'
import { cilChevronBottom, cilChevronTop } from '@coreui/icons'
import IconButton from '../IconButton'
import { t } from 'src/i18n'

/**
 * Row-expand toggle, styled like the outline action buttons next to it
 * instead of the underlined `color="link"` button it replaces. Generic -
 * any expandable-row table can use this, not just Processes. Thin wrapper
 * around the shared IconButton primitive (AGENTS.md section 19) - just
 * picks which chevron and label match `expanded`.
 */
// `className` - e.g. NARROW_ONLY (components/table/narrow.jsx): a toggle a row needs only on a phone,
// where its hidden columns move into the expanded part.
const ExpandToggleButton = ({ expanded, onClick, size = 'sm', className }) => (
  <IconButton
    icon={expanded ? cilChevronTop : cilChevronBottom}
    size={size}
    onClick={onClick}
    ariaLabel={expanded ? t('Collapse') : t('Expand')}
    center
    className={className}
  />
)

export default ExpandToggleButton
