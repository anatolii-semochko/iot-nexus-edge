// The permission catalog (B1 - iot AGENTS_TO_DO.md 2026-10-17): every action
// a person can take, as one tree - section (a menu tab) -> block -> action -
// the single source for the API's guard (access/routes.ts), the UI's
// can(), the role editor and the AI Assistant. A key is
// "<section>.<action>"; its level maps the AI Assistant's levels (read /
// control / config / install) plus admin. A role gives the actions by
// levels on objects (access/rights.ts - the one mapping). A DNP's own routes fall under the "dnp" section unless
// they name a key of their own.

export type Level = "read" | "control" | "config" | "install" | "admin";

export interface CatalogAction {
  key: string;
  label: string;
  level: Level;
}
export interface CatalogBlock {
  key: string;
  label: string;
  actions: CatalogAction[];
}
export interface CatalogSection {
  key: string;
  label: string;
  blocks: CatalogBlock[];
}

const a = (key: string, label: string, level: Level): CatalogAction => ({ key, label, level });

export const CATALOG: CatalogSection[] = [
  {
    key: "dashboard",
    label: "Dashboard",
    blocks: [{ key: "cards", label: "Cards", actions: [a("dashboard.view", "See the dashboard", "read"), a("dashboard.manage", "Arrange the cards", "config")] }],
  },
  {
    key: "ai",
    label: "AI Assistant",
    blocks: [
      {
        key: "messenger",
        label: "Messenger",
        actions: [
          a("ai.use", "Talk to the assistant", "read"),
          a("ai.decide", "Accept / reject proposals", "control"),
          a("ai.share", "Share own conversations (read only for all who may talk to it)", "config"),
        ],
      },
      { key: "settings", label: "Settings", actions: [a("ai.configure", "Connections, instances, MCP, calendar", "admin")] },
    ],
  },
  {
    key: "nodes",
    label: "Nodes",
    blocks: [{ key: "nodes", label: "Nodes", actions: [a("nodes.view", "See nodes", "read"), a("nodes.manage", "Register, edit, group, delete nodes", "install")] }],
  },
  {
    key: "devices",
    label: "Devices",
    blocks: [
      { key: "values", label: "Values", actions: [a("devices.view", "See devices and values", "read"), a("devices.write", "Set manual values", "control")] },
      {
        key: "simulation",
        label: "Simulation",
        // without simulation.view the units show as if real - no simulation marks (2026-10-27)
        actions: [a("simulation.view", "See which units are simulated", "control"), a("devices.simulate", "Simulate values, switch simulated / physical", "control")],
      },
      { key: "registry", label: "Registry", actions: [a("devices.manage", "Register, edit, group, delete devices", "install")] },
    ],
  },
  {
    key: "processes",
    label: "Processes",
    blocks: [
      { key: "state", label: "State", actions: [a("processes.view", "See processes and their messages", "read")] },
      { key: "control", label: "Control", actions: [a("processes.control", "ON / OFF, commands, dismiss messages", "control")] },
      { key: "config", label: "Configuration", actions: [a("processes.config", "Change process settings", "config")] },
      { key: "registry", label: "Registry", actions: [a("processes.manage", "Create, group, delete processes", "install")] },
    ],
  },
  {
    key: "logs",
    label: "Logs",
    blocks: [{ key: "logs", label: "Logs", actions: [a("logs.view", "See logs and history", "read"), a("logs.configure", "What is logged and how", "config")] }],
  },
  {
    key: "library",
    label: "Library",
    blocks: [{ key: "library", label: "Library", actions: [a("library.view", "Browse the library", "read"), a("library.manage", "Sync the library", "install")] }],
  },
  {
    key: "settings",
    label: "Settings",
    blocks: [
      { key: "messages", label: "Messages and monitoring", actions: [a("settings.view", "See message levels, groups, monitoring", "read"), a("settings.config", "Change message levels, groups, monitoring", "config")] },
    ],
  },
  {
    key: "service",
    label: "Service",
    blocks: [
      {
        key: "database",
        label: "Database",
        actions: [
          a("service.view", "See the Service pages - the database's sizes, the saved states, the commands (no change)", "read"),
          a("service.database.backup", "Save and download the state and logs", "admin"),
          a("service.database.restore", "Apply or upload a saved state", "admin"),
          a("service.database.clear-logs", "Clear logs", "admin"),
        ],
      },
      { key: "system", label: "System", actions: [a("service.system", "Service commands (restart, shutdown)", "admin"), a("service.dnp", "DNPs and migrations", "admin")] },
    ],
  },
  {
    key: "users",
    label: "Users",
    blocks: [{ key: "users", label: "Users and access", actions: [a("users.view", "See the users and roles", "read"), a("users.manage", "Users, roles, the guest", "admin")] }],
  },
  {
    key: "dnp",
    label: "DNP panels",
    blocks: [
      {
        key: "dnp",
        label: "Project packages",
        actions: [a("dnp.view", "See the packages' own panels", "read"), a("dnp.control", "Act in them", "control"), a("dnp.config", "Configure them", "config")],
      },
    ],
  },
];

export const ALL_ACTIONS: CatalogAction[] = CATALOG.flatMap((s) => s.blocks.flatMap((b) => b.actions));
export const ALL_PERMISSIONS: string[] = ALL_ACTIONS.map((x) => x.key);
const KNOWN = new Set(ALL_PERMISSIONS);
export const isPermission = (key: string) => KNOWN.has(key);

/** The roles no person may hold (the internal services' accounts' own). */
export const SERVICE_ROLES = new Set(["system"]);
