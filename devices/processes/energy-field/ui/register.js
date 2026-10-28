// CORE Library process-kind UI registration (AGENTS.md section 82) - loaded
// by apps/ui's pluginProcessTypes.js glob over devices/processes/*/ui/:
// the engineer's panel (the process row) and the user's scene (a Dashboard
// component, with its card picture).
import React from 'react'
import { dashboardRegistry } from 'src/dashboardRegistry'
import { processTypeRegistry } from 'src/processTypeRegistry'
import EnergyFieldPanel from './EnergyFieldPanel'
import EnergyFieldSettingsSection from './EnergyFieldSettingsSection'

processTypeRegistry.registerPanel('energy-field', EnergyFieldPanel)
// the engineer's settings: the groups, the batteries' limits, the critical states' thresholds
processTypeRegistry.registerSettingsSection('energy-field', EnergyFieldSettingsSection, '*')

dashboardRegistry.registerComponent({
  key: 'energyField.scene',
  title: 'Energy',
  description:
    "The site's generation, batteries, grid and consumption - live, with the basic controls",
  processKind: 'energy-field',
  Component: React.lazy(() => import('./EnergyFieldScene')),
  avatars: [
    {
      key: 'summary',
      title: 'Grid, batteries, wind, consumer, sun, today',
      Component: React.lazy(() => import('./EnergyFieldAvatar')),
    },
  ],
})

dashboardRegistry.registerComponent({
  key: 'energyField.meter',
  title: 'Energy - a meter',
  description:
    "One room's / area's electricity meter: its power now, today's kWh and cost, the chart",
  processKind: 'energy-field',
  Component: React.lazy(() => import('./EnergyMeter')),
  params: (process) => [
    {
      key: 'nodeId',
      label: 'Meter',
      required: true,
      hint: "The sub-meter of the consumption (the energy field's consumer.subMeters)",
      options: (process?.config?.consumer?.subMeters ?? []).map((x) => ({
        value: x.nodeId,
        label: x.name,
      })),
    },
  ],
})
