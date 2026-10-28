// CORE Library process-kind UI registration (AGENTS.md section 82) - loaded
// by apps/ui's pluginProcessTypes.js glob over devices/processes/*/ui/:
// the process panel, its zones settings section and the Dashboard
// component (with its avatar).
import React from 'react'
import { dashboardRegistry } from 'src/dashboardRegistry'
import { processTypeRegistry } from 'src/processTypeRegistry'
import WeatherControlPanel from './WeatherControlPanel'
import WeatherSettingsSection from './WeatherSettingsSection'

processTypeRegistry.registerPanel('weather-control', WeatherControlPanel)
processTypeRegistry.registerSettingsSection('weather-control', WeatherSettingsSection, '*')

dashboardRegistry.registerComponent({
  key: 'weatherControl.panel',
  title: 'Weather',
  description: 'The weather station: its zones and readings',
  processKind: 'weather-control',
  Component: React.lazy(() => import('./WeatherControlPanel')),
  avatars: [
    // the figures first (the default "auto"), the static picture still to choose
    {
      key: 'summary',
      title: 'Temperature, wind, sun, humidity, rain, today',
      Component: React.lazy(() => import('./WeatherSummaryAvatar')),
    },
    {
      key: 'picture',
      title: 'Sun, cloud, rain, temperature',
      Component: React.lazy(() => import('./WeatherAvatar')),
    },
  ],
})
