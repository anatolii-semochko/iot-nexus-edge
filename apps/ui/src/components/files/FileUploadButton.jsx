import React, { useRef, useState } from 'react'
import { CButton, CSpinner } from '@coreui/react'

// Generic single-file upload button (AGENTS.md section 81) - a visible
// button driving a hidden file input. `onFile(file)` is the caller's own
// upload; the button shows a spinner and stays disabled until it settles,
// and surfaces its error inline.
const FileUploadButton = ({
  accept,
  label = 'Upload',
  onFile,
  disabled,
  size = 'sm',
  color = 'primary',
}) => {
  const inputRef = useRef(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const handleChange = async (e) => {
    const file = e.target.files?.[0]
    // Reset so picking the same file again still fires onChange.
    e.target.value = ''
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      await onFile(file)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <span className="d-inline-flex align-items-center gap-2">
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="d-none"
        onChange={handleChange}
      />
      <CButton
        size={size}
        color={color}
        disabled={disabled || busy}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? <CSpinner size="sm" /> : label}
      </CButton>
      {error && <span className="text-danger small">{error}</span>}
    </span>
  )
}

export default FileUploadButton
