import React, { useState } from 'react'
import { CButton, CModal, CModalBody, CModalFooter, CModalHeader, CModalTitle } from '@coreui/react'

/**
 * Generic "are you sure?" confirm dialog (AGENTS_TO_DO.md 2026-09-04,
 * first built for the aquarium project's own Light Profiles/Power
 * Curves/Programs tables' delete buttons) - this app had no confirm-
 * before-destructive-action primitive anywhere before this; every other
 * delete button in the codebase (e.g. ProcessesTable.jsx's own) fires
 * immediately on click. Generic from day one, same reasoning
 * useExpandableRows/usePagination already follow - any future caller
 * needing a yes/no gate before an action can reuse this instead of a
 * bespoke modal.
 *
 * `confirm(options)` returns a Promise<boolean> - resolves `true` only
 * if the user clicks the confirm button, `false` on Cancel or closing
 * the modal any other way (backdrop click, Escape). `modal` is the JSX
 * to render once, anywhere in the calling component's own tree - it's
 * inert until `confirm()` is actually called.
 *
 * @returns {{ confirm: (options: { title?: string, body: React.ReactNode, confirmLabel?: string, confirmColor?: string }) => Promise<boolean>, modal: React.ReactNode }}
 */
export function useConfirmModal() {
  const [state, setState] = useState(null) // { title, body, confirmLabel, confirmColor, resolve } | null

  const confirm = (options) =>
    new Promise((resolve) => {
      setState({ ...options, resolve })
    })

  const close = (result) => {
    state?.resolve(result)
    setState(null)
  }

  const modal = (
    <CModal visible={state !== null} onClose={() => close(false)} alignment="center">
      <CModalHeader>
        <CModalTitle>{state?.title ?? 'Confirm'}</CModalTitle>
      </CModalHeader>
      <CModalBody>{state?.body}</CModalBody>
      <CModalFooter>
        <CButton color="secondary" variant="outline" onClick={() => close(false)}>
          Cancel
        </CButton>
        <CButton color={state?.confirmColor ?? 'primary'} onClick={() => close(true)}>
          {state?.confirmLabel ?? 'Confirm'}
        </CButton>
      </CModalFooter>
    </CModal>
  )

  return { confirm, modal }
}
