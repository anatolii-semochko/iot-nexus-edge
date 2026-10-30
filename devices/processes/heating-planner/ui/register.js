// CORE Library process-kind UI registration (AGENTS.md section 82) - loaded by apps/ui's
// pluginProcessTypes.js glob over devices/processes/*/ui/: the plan's page - the engineer's panel (the
// process row) and the user's Dashboard component with its card picture (P2 - iot AGENTS_TO_DO.md
// 2026-10-29).
import React from 'react'
import { dashboardRegistry } from 'src/dashboardRegistry'
import { processTypeRegistry } from 'src/processTypeRegistry'
import HeatingPlanScene from './HeatingPlanScene'

processTypeRegistry.registerPanel('heating-planner', HeatingPlanScene)

dashboardRegistry.registerComponent({
  key: 'heatingPlanner.plan',
  title: 'Heating plan',
  description:
    "The heat pumps' plan ahead for every heating system: the heat, the units, the store, the rooms' comfort margin - against the prices, the sun and the Energy Ledger's signal; what it saves",
  processKind: 'heating-planner',
  Component: React.lazy(() => import('./HeatingPlanScene')),
  avatars: [
    {
      key: 'summary',
      title: "The next day's heat under the price, the saving, the heat pumps now",
      Component: React.lazy(() => import('./HeatingPlanAvatar')),
    },
  ],
})
