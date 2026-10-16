// Dashboard extension point (AGENTS.md section 85; the card tree -
// "Dashboard cards", 2026-10-16). A target project's
// `plugins/*/ui/register.js` offers the Dashboard its UI components:
//
//   dashboardRegistry.registerComponent({
//     key: 'aquarium.dashboard',        // unique, stored in dashboard_cards.component_key
//     title: 'Aquarium dashboard',
//     processKind: 'aquarium-control',  // one component per named process of this kind
//     Component,                        // ({ process }) - the process row; a system one: ()
//     Preview,                          // optional ({ process }) - the card's own preview
//   })
//
// Without `processKind` the component is a system one (no process).
// Service -> Config -> Dashboard builds the card tree out of them; the
// Dashboard page shows the tree. Plain objects read via property access,
// same react-hooks/static-components reasoning as processTypeRegistry.js.
//
// `register(Component)` - the older single slot: the page shows it while
// the card tree is empty (a target project's whole dashboard).
export const dashboardContent = { main: null }
export const dashboardComponents = {}

export const dashboardRegistry = {
  register(Component) {
    dashboardContent.main = Component
  },
  registerComponent(def) {
    dashboardComponents[def.key] = def
  },
}

/**
 * The components a card may show, from the registry and the system's
 * processes: [{ key, title, process | null, def }] - a process-bound one
 * per named process of its kind, a system one once.
 */
export function availableComponents(processes) {
  return Object.values(dashboardComponents).flatMap((def) =>
    def.processKind
      ? processes
          .filter((p) => p.kind === def.processKind)
          .map((p) => ({ key: def.key, title: def.title, process: p, def }))
      : [{ key: def.key, title: def.title, process: null, def }],
  )
}
