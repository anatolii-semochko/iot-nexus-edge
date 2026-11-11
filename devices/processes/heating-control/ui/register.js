// CORE Library process-kind UI registration (AGENTS.md section 82) - loaded
// by apps/ui's pluginProcessTypes.js glob over devices/processes/*/ui/:
// the scene - the engineer's panel (the process row) and the user's
// Dashboard component.
import React from "react";
import { dashboardRegistry } from "src/dashboardRegistry";
import { processTypeRegistry } from "src/processTypeRegistry";
import HeatingScene from "./HeatingScene";
import HeatingSettingsSection from "./HeatingSettingsSection";
import { packageT } from "src/i18n";
// the package's words (its own locales/, then the core's)
const t = packageT("heating-control");

processTypeRegistry.registerPanel("heating-control", HeatingScene);
// the engineer's settings: the groups of each block, the auto thresholds, the tanks' bands
processTypeRegistry.registerSettingsSection(
  "heating-control",
  HeatingSettingsSection,
  "*",
);

dashboardRegistry.registerComponent({
  key: "heatingControl.scene",
  title: t("Heating"),
  description: t(
    "The heat pumps, the heat storage and the rooms - live, with the mode and the fan coils' valves",
  ),
  processKind: "heating-control",
  Component: React.lazy(() => import("./HeatingScene")),
  avatars: [
    {
      key: "summary",
      title: t("Heat pump, tank, fan coil - with their figures"),
      Component: React.lazy(() => import("./HeatingAvatar")),
    },
  ],
});

// every heating system together, at a glance - made for a folder's full width under its blocks (a
// component card); a mockup until the heating's rework (iot AGENTS_TO_DO.md 2026-10-29)
dashboardRegistry.registerComponent({
  key: "heatingControl.overview",
  title: t("Heating - the overview"),
  description: t(
    "Every heating system together: the outdoor air, the heat pumps, the heat storage, the rooms - with the heat flows between them",
  ),
  Component: React.lazy(() => import("./HeatingOverview")),
});

dashboardRegistry.registerComponent({
  key: "heatingControl.room",
  title: t("Heating - a room"),
  description: t(
    "One room's climate: its fan coil and valve, the temperature, humidity and setpoint",
  ),
  processKind: "heating-control",
  Component: React.lazy(() => import("./HeatingRoom")),
  avatars: [
    {
      key: "room",
      title: t("The fan coil, the setpoint, the heat now and today"),
      Component: React.lazy(() => import("./HeatingRoomAvatar")),
    },
  ],
  params: (process) => [
    {
      key: "nodeId",
      label: t("Room"),
      required: true,
      hint: t("The room - its fan coil"),
      options: (process?.config?.consumers ?? []).map((c) => ({
        value: c.nodeId,
        label: c.name,
      })),
    },
  ],
});
