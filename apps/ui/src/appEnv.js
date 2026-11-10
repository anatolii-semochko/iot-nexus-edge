// Deployment environment (AGENTS_TO_DO.md 2026-09-25) - the stack's own
// NODE_ENV, baked in at build time the same way VITE_PROJECT_NAME is
// (projectName.js): the UI is a static bundle and never sees the
// containers' runtime env. docker-compose passes it as the
// VITE_NODE_ENV build arg. Unset (e.g. a CI image build for a device)
// counts as production, so a missing arg never hides production-only
// behavior.
export const NODE_ENV = import.meta.env.VITE_NODE_ENV || 'production'
export const IS_PRODUCTION = NODE_ENV === 'production'

// The header's Simulation badge (the user, 2026-11-10): 'hide', 'show' (steady) or 'blink' - the stack's
// SIMULATION_BADGE (the VITE_SIMULATION_BADGE build arg); unset - blinks in production, steady otherwise.
const BADGE = String(import.meta.env.VITE_SIMULATION_BADGE || '').toLowerCase()
export const SIMULATION_BADGE = ['hide', 'show', 'blink'].includes(BADGE)
  ? BADGE
  : IS_PRODUCTION
    ? 'blink'
    : 'show'
