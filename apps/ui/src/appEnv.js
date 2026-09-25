// Deployment environment (AGENTS_TO_DO.md 2026-09-25) - the stack's own
// NODE_ENV, baked in at build time the same way VITE_PROJECT_NAME is
// (projectName.js): the UI is a static bundle and never sees the
// containers' runtime env. docker-compose passes it as the
// VITE_NODE_ENV build arg. Unset (e.g. a CI image build for a device)
// counts as production, so a missing arg never hides production-only
// behavior.
export const NODE_ENV = import.meta.env.VITE_NODE_ENV || 'production'
export const IS_PRODUCTION = NODE_ENV === 'production'
