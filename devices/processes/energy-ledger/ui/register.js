// CORE Library process-kind UI registration (AGENTS.md section 82) - loaded
// by apps/ui's pluginProcessTypes.js glob over devices/processes/*/ui/:
// the ledger's view - the engineer's panel (the process row) and the
// user's Dashboard component.
import React from 'react'
import { dashboardRegistry } from 'src/dashboardRegistry'
import { processTypeRegistry } from 'src/processTypeRegistry'
import LedgerScene from './LedgerScene'
import LedgerSettingsSection from './LedgerSettingsSection'
import { packageT } from 'src/i18n'
// the package's words (its own locales/, then the core's)
const t = packageT('energy-ledger')

processTypeRegistry.registerPanel('energy-ledger', LedgerScene)
// the engineer's settings: the operating parameters, the strategies', the plan's timing, the holidays' calendar
processTypeRegistry.registerSettingsSection('energy-ledger', LedgerSettingsSection, '*')

dashboardRegistry.registerComponent({
  key: 'energyLedger.scene',
  title: t('Energy Ledger'),
  description: t(
    'What the energy system saved - a day, a month, a year: the savings bridge, the calendar, the key figures',
  ),
  processKind: 'energy-ledger',
  Component: React.lazy(() => import('./LedgerScene')),
  avatars: [
    {
      key: 'summary',
      title: t('Saved today, efficiency, self-sufficiency, paid, the plan, the strategy'),
      Component: React.lazy(() => import('./LedgerAvatar')),
    },
  ],
})
