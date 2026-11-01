// CORE Library process-kind UI registration (AGENTS.md section 82) - loaded
// by apps/ui's pluginProcessTypes.js glob over devices/processes/*/ui/:
// the process panel, its settings section and the Dashboard component.
import React from 'react'
import { dashboardRegistry } from 'src/dashboardRegistry'
import { processTypeRegistry } from 'src/processTypeRegistry'
import EnergyGridPanel from './EnergyGridPanel'
import EnergyGridSettingsSection from './EnergyGridSettingsSection'
import { packageT } from 'src/i18n'
// the package's words (its own locales/, then the core's)
const t = packageT('energy-grid')

processTypeRegistry.registerPanel('energy-grid', EnergyGridPanel)
processTypeRegistry.registerSettingsSection('energy-grid', EnergyGridSettingsSection, '*')

dashboardRegistry.registerComponent({
  key: 'energyGrid.panel',
  title: t('Grid connection'),
  description: t(
    "The grid connection point: power in / out, prices now, today and tomorrow, today's account",
  ),
  processKind: 'energy-grid',
  Component: React.lazy(() => import('./EnergyGridPanel')),
})
