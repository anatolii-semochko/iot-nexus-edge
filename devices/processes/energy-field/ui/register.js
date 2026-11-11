// CORE Library process-kind UI registration (AGENTS.md section 82) - loaded
// by apps/ui's pluginProcessTypes.js glob over devices/processes/*/ui/:
// the engineer's panel (the process row) and the user's scene (a Dashboard
// component, with its card picture).
import React from "react";
import { dashboardRegistry } from "src/dashboardRegistry";
import { processTypeRegistry } from "src/processTypeRegistry";
import EnergyFieldPanel from "./EnergyFieldPanel";
import EnergyFieldSettingsSection from "./EnergyFieldSettingsSection";
import { packageT } from "src/i18n";
// the package's words (its own locales/, then the core's)
const t = packageT("energy-field");

processTypeRegistry.registerPanel("energy-field", EnergyFieldPanel);
// the engineer's settings: the groups, the batteries' limits, the critical states' thresholds
processTypeRegistry.registerSettingsSection(
  "energy-field",
  EnergyFieldSettingsSection,
  "*",
);

dashboardRegistry.registerComponent({
  key: "energyField.scene",
  title: t("Energy"),
  description: t(
    "The site's generation, batteries, grid and consumption - live, with the basic controls",
  ),
  processKind: "energy-field",
  Component: React.lazy(() => import("./EnergyFieldScene")),
  avatars: [
    {
      key: "summary",
      title: t("Grid, batteries, wind, consumer, sun, today"),
      Component: React.lazy(() => import("./EnergyFieldAvatar")),
    },
  ],
});

// the whole picture at a glance - made for a folder's full width under its blocks (a component card)
dashboardRegistry.registerComponent({
  key: "energyField.overview",
  title: t("Energy - the overview"),
  description: t(
    "The generation and the grid, the Energy Ledger, the batteries and the consumption - with the flows between them",
  ),
  processKind: "energy-field",
  Component: React.lazy(() => import("./EnergyOverview")),
});

dashboardRegistry.registerComponent({
  key: "energyField.meter",
  title: t("Energy - a meter"),
  description: t(
    "One room's / area's electricity meter: its power now, today's kWh and cost, the chart",
  ),
  processKind: "energy-field",
  Component: React.lazy(() => import("./EnergyMeter")),
  avatars: [
    {
      key: "meter",
      title: t("The meter, the power now, today, the cost"),
      Component: React.lazy(() => import("./EnergyMeterAvatar")),
    },
  ],
  params: (process) => [
    {
      key: "nodeId",
      label: t("Meter"),
      required: true,
      hint: t(
        "The sub-meter of the consumption (the energy field's consumer.subMeters)",
      ),
      options: (process?.config?.consumer?.subMeters ?? []).map((x) => ({
        value: x.nodeId,
        label: x.name,
      })),
    },
  ],
});
