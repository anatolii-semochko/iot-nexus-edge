// Dashboard content extension point (AGENTS.md section 85) - a target
// project's `plugins/*/ui/register.js` can hand the Dashboard page its own
// component; without one the page keeps its placeholder. Deliberately the
// minimum (one slot, last registration wins) - the full "Dashboard widget
// host" is still an open design topic. Plain object read via property
// access, same react-hooks/static-components reasoning as
// processTypeRegistry.js.
export const dashboardContent = { main: null }

export const dashboardRegistry = {
  register(Component) {
    dashboardContent.main = Component
  },
}
