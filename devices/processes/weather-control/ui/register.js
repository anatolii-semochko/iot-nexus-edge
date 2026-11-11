// CORE Library process-kind UI registration (AGENTS.md section 82) - loaded
// by apps/ui's pluginProcessTypes.js glob over devices/processes/*/ui/:
// the process panel, its zones settings section and the Dashboard
// component (with its avatar).
import React from 'react'
import { dashboardRegistry } from 'src/dashboardRegistry'
import { processTypeRegistry } from 'src/processTypeRegistry'
import WeatherControlPanel from './WeatherControlPanel'
import WeatherSettingsSection from './WeatherSettingsSection'
import { packageT } from 'src/i18n'
// the package's words (its own locales/, then the core's)
const t = packageT('weather-control')

processTypeRegistry.registerPanel('weather-control', WeatherControlPanel)
processTypeRegistry.registerSettingsSection('weather-control', WeatherSettingsSection, '*')

dashboardRegistry.registerComponent({
  key: 'weatherControl.panel',
  title: t('Weather'),
  description: t(
    "The weather now and ahead: the station's readings, the warnings, the next hours and days - the sun for the PV, the heating's need",
  ),
  processKind: 'weather-control',
  // the user's scene (2026-10-30); the process row keeps the engineer's panel
  Component: React.lazy(() => import('./WeatherScene')),
  avatars: [
    // the figures first (the default "auto"), the static picture still to choose
    {
      key: 'summary',
      title: t('Temperature, wind, sun, humidity, rain, today'),
      Component: React.lazy(() => import('./WeatherSummaryAvatar')),
    },
    {
      key: 'picture',
      title: t('Sun, cloud, rain, temperature'),
      Component: React.lazy(() => import('./WeatherAvatar')),
    },
  ],
})
