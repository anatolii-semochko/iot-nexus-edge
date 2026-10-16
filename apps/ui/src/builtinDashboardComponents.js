import React from 'react'
import { dashboardRegistry } from './dashboardRegistry'

// The core's own Dashboard components (Dashboard cards, 2026-10-16) - the
// minimal set, to grow as needed: the system's pages as whole components
// (no process) and the core process kinds' panels (one per named
// process). Lazy - a card loads its page only when it is opened.
const lazy = (load) => React.lazy(load)

dashboardRegistry.registerComponent({
  key: 'system.processes',
  title: 'Processes',
  description: 'Every process: its state, warnings and errors',
  Component: lazy(() => import('./views/processes/ProcessesList')),
})
dashboardRegistry.registerComponent({
  key: 'system.nodes',
  title: 'Nodes',
  description: 'The nodes: online / heartbeat, simulated',
  Component: lazy(() => import('./views/devices/NodesList')),
})
dashboardRegistry.registerComponent({
  key: 'system.liveEvents',
  title: 'Live events',
  description: 'Device values and commands as they come',
  Component: lazy(() => import('./views/logs/LiveEvents')),
})
dashboardRegistry.registerComponent({
  key: 'system.logs',
  title: 'Logs',
  description: 'The message, device and command logs',
  Component: lazy(() => import('./views/logs/LogsList')),
})
dashboardRegistry.registerComponent({
  key: 'resourceMonitor.panel',
  title: 'Resource monitor',
  description: 'CPU, RAM and disk of the host',
  processKind: 'resource-monitor',
  Component: lazy(() => import('./views/processes/ResourceMonitorPanel')),
  avatars: [
    {
      key: 'chart',
      title: 'The live chart',
      Component: lazy(() => import('./views/processes/ResourceMonitorAvatar')),
    },
  ],
})
dashboardRegistry.registerComponent({
  key: 'weatherControl.panel',
  title: 'Weather',
  description: 'The weather station: its zones and readings',
  processKind: 'weather-control',
  Component: lazy(() => import('./views/processes/WeatherControlPanel')),
  avatars: [
    {
      key: 'picture',
      title: 'Sun, cloud, rain, temperature',
      Component: lazy(() => import('./views/processes/WeatherAvatar')),
    },
  ],
})
