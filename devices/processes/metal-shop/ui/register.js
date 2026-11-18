// The small metal shop (iot AGENTS_TO_DO.md 2026-11-17/18 - the demo's complex, step 1: the panels as
// mockups on fixed figures; the process, the nodes and the simulation come in the next steps). Loaded by
// apps/ui's pluginProcessTypes.js glob over devices/processes/*/ui/ - a system Dashboard component for now
// (no process yet).
import React from 'react'
import { dashboardRegistry } from 'src/dashboardRegistry'
import { packageT } from 'src/i18n'
// the package's words (its own locales/, then the core's)
const t = packageT('metal-shop')

dashboardRegistry.registerComponent({
  key: 'metalShop.panel',
  title: t('Metal shop'),
  description: t(
    'The whole shop on one plan: the blanks, the CNC machines, the anodizing line, the oven, QC and the utilities - each with its figures; the batches in work (a mockup)',
  ),
  Component: React.lazy(() => import('./MetalShopScene')),
  avatars: [
    {
      key: 'picture',
      title: t('The shop'),
      Component: React.lazy(() => import('./MetalShopAvatar')),
    },
  ],
})
