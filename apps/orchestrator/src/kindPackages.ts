/**
 * Which package each plugin process kind came from (processPlugins.ts fills it): its folder name - the
 * UI's i18next namespace of its words. A message's template with no `ns` gets its process's package
 * (apiClient.syncMessages / logEvents) - a producer never names its own; a built-in kind - "core".
 */
const packages = new Map<string, string>();

export const setKindPackage = (kind: string, pkg: string): void => {
  packages.set(kind, pkg);
};

export const packageOfKind = (kind: string | undefined): string => (kind && packages.get(kind)) || "core";
