import { useEffect, useState } from 'react'
import { api } from '../../api/client'

// What the assistant is on for (GET /ai/entities) - read once per page load, shared by the
// messenger, the side panel and the AI buttons (2026-10-24).
let cache = null

export const loadAiEntities = () => {
  cache ??= api.listAiEntities().catch((err) => {
    cache = null
    throw err
  })
  return cache
}

/** { data: { entities, quickStart } | null, error } */
export const useAiEntities = () => {
  const [state, setState] = useState({ data: null, error: null })
  useEffect(() => {
    let off = false
    loadAiEntities()
      .then((data) => !off && setState({ data, error: null }))
      .catch((err) => !off && setState({ data: null, error: err.message }))
    return () => {
      off = true
    }
  }, [])
  return state
}
